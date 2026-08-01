import { Injectable, UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  me(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true, email: true, fullName: true, dob: true, timezone: true,
        city: true, country: true, profession: true, workType: true,
        workHoursPerWeek: true, screenHoursPerDay: true,
        maritalStatus: true, childrenCount: true,
        livesAwayFromParents: true, onboardingCompleted: true,
        motivationStyle: true, createdAt: true,
      },
    });
  }

  update(userId: string, data: Record<string, unknown>) {
    const allowed = [
      'fullName', 'dob', 'timezone', 'city', 'country', 'profession',
      'workType', 'workHoursPerWeek', 'screenHoursPerDay', 'maritalStatus',
      'childrenCount', 'livesAwayFromParents', 'motivationStyle',
    ];
    const patch = Object.fromEntries(
      Object.entries(data).filter(([k]) => allowed.includes(k)),
    );
    return this.prisma.user.update({ where: { id: userId }, data: patch });
  }

  preferences(userId: string) {
    return this.prisma.userPreferences.findUnique({ where: { userId } });
  }

  updatePreferences(userId: string, data: Record<string, unknown>) {
    const allowed = [
      'reminderTone', 'insightIntensity', 'quietHoursStart', 'quietHoursEnd',
      'preferredReminderHour', 'gamificationEnabled', 'weeklyReviewDay',
    ];
    const patch = Object.fromEntries(
      Object.entries(data).filter(([k]) => allowed.includes(k)),
    );
    return this.prisma.userPreferences.update({ where: { userId }, data: patch });
  }

  /**
   * Everything this system holds about one person, as machine-readable JSON.
   *
   * The Record screen is the readable version; this is the portable one. It is
   * the other half of asking someone to keep their life here: they can take
   * all of it out, in a form another program can read, without asking us.
   *
   * Credentials are the one exclusion — password hashes and refresh-token
   * hashes are ours to hold, not data about them, and exporting them only
   * creates a second place to steal them from.
   */
  async exportAll(userId: string) {
    const [
      user, preferences, onboarding, domains, relationships, memories,
      goals, missions, habits, journal, insights, reviews, gamification,
      xp, decisions, knowledge, attention, lifeOsState, notifications,
    ] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true, email: true, fullName: true, dob: true, timezone: true,
          city: true, country: true, profession: true, workType: true,
          workHoursPerWeek: true, screenHoursPerDay: true,
          maritalStatus: true, childrenCount: true,
          livesAwayFromParents: true, onboardingCompleted: true,
          motivationStyle: true, createdAt: true,
        },
      }),
      this.prisma.userPreferences.findUnique({ where: { userId } }),
      this.prisma.onboardingAnswer.findMany({ where: { userId } }),
      this.prisma.lifeDomain.findMany({ where: { userId } }),
      this.prisma.relationship.findMany({
        where: { userId },
        include: { contactLogs: true },
      }),
      this.prisma.memory.findMany({ where: { userId } }),
      this.prisma.goal.findMany({ where: { userId } }),
      this.prisma.mission.findMany({ where: { userId } }),
      this.prisma.habit.findMany({ where: { userId }, include: { logs: true } }),
      this.prisma.journalEntry.findMany({ where: { userId } }),
      this.prisma.opportunityInsight.findMany({ where: { userId } }),
      this.prisma.weeklyReview.findMany({ where: { userId } }),
      this.prisma.gamificationProfile.findUnique({ where: { userId } }),
      this.prisma.domainXpEntry.findMany({ where: { userId } }),
      this.prisma.decision.findMany({ where: { userId } }),
      this.prisma.knowledgeItem.findMany({ where: { userId } }),
      this.prisma.domainAttentionSample.findMany({ where: { userId } }),
      this.prisma.lifeOsState.findUnique({ where: { userId } }),
      this.prisma.notification.findMany({ where: { userId } }),
    ]);

    return {
      format: 'priority-archive',
      version: 1,
      exportedAt: new Date().toISOString(),
      user,
      preferences,
      onboarding,
      domains,
      relationships,
      memories,
      goals,
      missions,
      habits,
      journal,
      insights,
      reviews,
      gamification,
      xp,
      decisions,
      knowledge,
      attention,
      lifeOsState,
      notifications,
    };
  }

  /**
   * Erase the account. Irreversible, and meant to be.
   *
   * Re-authenticating first is not ceremony: an access token can be lifted from
   * a shared laptop, and this is the one call that cannot be undone. Every
   * user-owned table cascades from User, so a single delete is genuinely
   * complete rather than merely thorough-looking.
   */
  async deleteAccount(userId: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.passwordHash) throw new UnauthorizedException('Invalid credentials');
    if (!password || !(await argon2.verify(user.passwordHash, password))) {
      throw new UnauthorizedException('Password does not match');
    }

    await this.prisma.user.delete({ where: { id: userId } });
    return { deleted: true, at: new Date().toISOString() };
  }
}
