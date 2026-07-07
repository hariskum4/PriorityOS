import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { XP_TABLE, XpEvent, levelForXp } from '@priority/scoring-engine';

/** Achievement catalog (blueprint §5.7): earned for real-life behavior,
 * never for app usage volume. Stored denormalized on the profile so the
 * client renders the shelf without a catalog lookup. */
const ACHIEVEMENTS: Array<{
  key: string;
  name: string;
  description: string;
  test: (s: AchievementStats) => boolean;
}> = [
  { key: 'first_step', name: 'First step', description: 'Completed your first mission', test: (s) => s.completedMissions >= 1 },
  { key: 'shows_up', name: 'Shows up', description: '10 meaningful missions done', test: (s) => s.completedMissions >= 10 },
  { key: 'consistent', name: 'Consistent', description: 'A 7-day streak', test: (s) => s.dailyStreak >= 7 },
  { key: 'dedicated', name: 'Dedicated', description: 'A 30-day streak', test: (s) => s.dailyStreak >= 30 },
  { key: 'storyteller', name: 'Storyteller', description: '10 journal entries', test: (s) => s.journalEntries >= 10 },
  { key: 'wide_heart', name: 'Wide heart', description: '3 or more people you show up for', test: (s) => s.relationships >= 3 },
  { key: 'sunday_ritualist', name: 'Sunday ritualist', description: '4 Sunday Sessions completed', test: (s) => s.sundaySessions >= 4 },
  { key: 'getting_clear', name: 'Getting clear', description: 'Reached level 5', test: (s) => s.level >= 5 },
];

interface AchievementStats {
  completedMissions: number;
  journalEntries: number;
  relationships: number;
  sundaySessions: number;
  dailyStreak: number;
  level: number;
}

@Injectable()
export class GamificationService {
  constructor(private prisma: PrismaService) {}

  async award(userId: string, event: XpEvent, domainType: string, refId?: string) {
    const amount = XP_TABLE[event];
    await this.prisma.domainXpEntry.create({
      data: { userId, domainType, amount, reason: event, refId },
    });
    const profile = await this.prisma.gamificationProfile.update({
      where: { userId },
      data: { totalXp: { increment: amount } },
    });
    const level = levelForXp(profile.totalXp);
    if (level !== profile.level) {
      await this.prisma.gamificationProfile.update({
        where: { userId },
        data: { level },
      });
    }
    await this.touchDailyStreak(userId);
    const newBadges = await this.checkAchievements(userId);
    return { amount, totalXp: profile.totalXp, level, newBadges };
  }

  /** Evaluate the catalog and persist newly earned badges. */
  private async checkAchievements(userId: string) {
    const profile = await this.prisma.gamificationProfile.findUnique({ where: { userId } });
    if (!profile) return [];
    const earned = (profile.badges as any[]) ?? [];
    const earnedKeys = new Set(earned.map((b) => b.key));
    const pending = ACHIEVEMENTS.filter((a) => !earnedKeys.has(a.key));
    if (!pending.length) return [];

    const [completedMissions, journalEntries, relationships, sundaySessions] =
      await Promise.all([
        this.prisma.mission.count({ where: { userId, status: 'completed' } }),
        this.prisma.journalEntry.count({ where: { userId } }),
        this.prisma.relationship.count({ where: { userId } }),
        this.prisma.weeklyReview.count({ where: { userId, sessionCompletedAt: { not: null } } }),
      ]);
    const stats: AchievementStats = {
      completedMissions,
      journalEntries,
      relationships,
      sundaySessions,
      dailyStreak: profile.dailyStreak,
      level: profile.level,
    };

    const newly = pending
      .filter((a) => a.test(stats))
      .map((a) => ({ key: a.key, name: a.name, description: a.description, earnedAt: new Date().toISOString() }));
    if (newly.length) {
      await this.prisma.gamificationProfile.update({
        where: { userId },
        data: { badges: [...earned, ...newly] },
      });
    }
    return newly;
  }

  /** Forgiving daily-usage streak: a missed day consumes grace before resetting. */
  private async touchDailyStreak(userId: string) {
    const p = await this.prisma.gamificationProfile.findUnique({ where: { userId } });
    if (!p) return;
    const today = new Date();
    const startOfDay = (d: Date) =>
      new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const last = p.lastActiveDate ? startOfDay(p.lastActiveDate) : null;
    const now = startOfDay(today);
    if (last && now.getTime() === last.getTime()) return; // already counted today

    let { dailyStreak, graceRemaining } = p;
    if (last) {
      const gapDays = Math.round((now.getTime() - last.getTime()) / 86_400_000);
      if (gapDays === 1) dailyStreak += 1;
      else if (gapDays === 2 && graceRemaining > 0) {
        dailyStreak += 1;
        graceRemaining -= 1;
      } else dailyStreak = 1;
    } else dailyStreak = 1;

    await this.prisma.gamificationProfile.update({
      where: { userId },
      data: {
        dailyStreak,
        graceRemaining,
        bestStreak: Math.max(p.bestStreak, dailyStreak),
        lastActiveDate: today,
      },
    });
  }

  profile(userId: string) {
    return this.prisma.gamificationProfile.findUnique({ where: { userId } });
  }

  domainXp(userId: string) {
    return this.prisma.domainXpEntry.groupBy({
      by: ['domainType'],
      where: { userId },
      _sum: { amount: true },
    });
  }
}
