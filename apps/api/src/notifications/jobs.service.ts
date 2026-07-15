import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from './notifications.service';
import { ScoringService } from '../scoring/scoring.service';
import { MissionsService } from '../missions/missions.service';
import { HabitsService } from '../habits/habits.service';
import { WeeklyReviewService } from '../weekly-review/weekly-review.service';
import { RelationshipsService } from '../relationships/relationships.service';

/**
 * Scheduled jobs. In production these enqueue BullMQ jobs per user; the
 * in-process cron keeps local dev dependency-free while preserving the
 * same service boundaries.
 */
@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private scoring: ScoringService,
    private missions: MissionsService,
    private habits: HabitsService,
    private reviews: WeeklyReviewService,
    private relationships: RelationshipsService,
  ) {}

  /** Morning refresh: recalc scores + daily mission reminder. */
  @Cron('0 6 * * *')
  async morningRefresh() {
    const users = await this.prisma.user.findMany({
      where: { onboardingCompleted: true },
      select: { id: true },
    });
    for (const u of users) {
      await this.scoring.recalcUserDomains(u.id);
      const ranked = await this.missions.rankedPending(u.id);
      const top = ranked[0];
      if (top) {
        const today = new Date().toISOString().slice(0, 10);
        await this.notifications.schedule(
          u.id,
          'daily_mission',
          'Today\u2019s one thing',
          top.title,
          new Date(),
          `daily_mission:${today}`,
        );
      }
    }
    this.logger.log(`Morning refresh: ${users.length} user(s)`);
  }

  /** Relationship drift nudges — at most one per relationship per week. */
  @Cron('0 10 * * *')
  async driftNudges() {
    const rels = await this.prisma.relationship.findMany({
      where: { priorityScore: { gte: 70 }, wantsMoreTime: true },
      include: { user: { select: { id: true, onboardingCompleted: true } } },
    });
    const week = weekKey();
    for (const rel of rels) {
      if (!rel.user.onboardingCompleted) continue;
      await this.relationships.recalcPriority(rel.id);
      // Memory-grounded "reach out with this" line (6-day refresh window,
      // deterministic fallback) \u2014 a gift to open with, not a guilt ping.
      const nudge = await this.relationships.ensureReachOutLine(rel.id);
      await this.notifications.schedule(
        rel.userId,
        'relationship_drift',
        nudge?.title ?? `Time with ${rel.name}?`,
        nudge?.body ?? `It\u2019s been a while since you connected with ${rel.name}. A short call counts.`,
        new Date(),
        `drift:${rel.id}:${week}`,
      );
    }
  }

  /**
   * "Notice when you go quiet." The research is clear: apps that respond to
   * absence warmly retain; ones that punish it churn. If a user has been away
   * 4+ days and we haven't already reached out this absence, send one gentle,
   * no-guilt return nudge — never a streak-shame, never "you missed X days".
   */
  @Cron('0 11 * * *')
  async reengageQuietUsers() {
    const fourDaysAgo = new Date(Date.now() - 4 * 86_400_000);
    const users = await this.prisma.user.findMany({
      where: {
        onboardingCompleted: true,
        lastSeenAt: { lt: fourDaysAgo },
        OR: [{ reengagedAt: null }, { reengagedAt: { lt: fourDaysAgo } }],
      },
      select: { id: true, fullName: true },
    });
    for (const u of users) {
      const first = (u.fullName ?? '').split(' ')[0];
      await this.notifications.schedule(
        u.id,
        'reengage',
        first ? `We kept your place, ${first}` : 'We kept your place',
        'No streak to rebuild, nothing lost. Whenever you have a minute, one small thing is waiting.',
        new Date(),
        `reengage:${u.id}:${new Date().toISOString().slice(0, 10)}`,
      );
      await this.prisma.user.update({ where: { id: u.id }, data: { reengagedAt: new Date() } });
    }
    if (users.length) this.logger.log(`Re-engaged ${users.length} quiet user(s)`);
  }

  /** Sunday evening: roll habit streaks, generate reviews, remind. */
  @Cron('0 18 * * 0')
  async weeklyRollover() {
    const users = await this.prisma.user.findMany({
      where: { onboardingCompleted: true },
      select: { id: true },
    });
    for (const u of users) {
      await this.habits.rolloverWeek(u.id);
      await this.reviews.generate(u.id);
      await this.notifications.schedule(
        u.id,
        'weekly_review',
        'Your week, honestly',
        'Your weekly review is ready — 2 minutes to see where your life energy went.',
        new Date(),
        `weekly_review:${weekKey()}`,
      );
    }
    this.logger.log(`Weekly rollover: ${users.length} user(s)`);
  }
}

function weekKey(): string {
  const d = new Date();
  const onejan = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - onejan.getTime()) / 86_400_000 + onejan.getDay() + 1) / 7);
  return `${d.getFullYear()}-w${week}`;
}
