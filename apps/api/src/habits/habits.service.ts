import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UserClock } from '../common/clock.module';
import { ScoringService } from '../scoring/scoring.service';
import { GamificationService } from '../gamification/gamification.service';
import { advanceStreak } from '@priority/scoring-engine';

/**
 * How far back a habit's rate is measured. Four weeks: long enough that one
 * bad week does not read as abandonment, short enough that a rhythm someone
 * genuinely stopped keeping stops being reported as kept.
 */
const RATE_WINDOW_DAYS = 28;

@Injectable()
export class HabitsService {
  constructor(
    private prisma: PrismaService,
    private scoring: ScoringService,
    private game: GamificationService,
    private clock: UserClock,
  ) {}

  /**
   * Active habits, with this week's logs and a steadier read behind them.
   *
   * `logs` is this week and drives the tick-boxes, which is right for "have I
   * done it today". It is the wrong window for asking whether a rhythm is
   * being kept: one quiet week would flip a year-old habit from kept to
   * failing, and this app grants grace on streaks precisely because a life
   * does not run on calendar weeks. `perWeek` is the rate over four, which
   * survives a bad week and still notices a habit that has actually stopped.
   */
  async list(userId: string) {
    const since = await this.clock.daysAgo(userId, RATE_WINDOW_DAYS);
    const habits = await this.prisma.habit.findMany({
      where: { userId, isActive: true },
      include: {
        logs: {
          where: { completedAt: { gte: await this.clock.startOfWeek(userId) } },
          orderBy: { completedAt: 'desc' },
        },
        _count: { select: { logs: { where: { completedAt: { gte: since } } } } },
      },
    });

    return habits.map(({ _count, ...h }) => ({
      ...h,
      recentLogs: _count.logs,
      perWeek: Math.round((_count.logs / (RATE_WINDOW_DAYS / 7)) * 10) / 10,
      rateWindowDays: RATE_WINDOW_DAYS,
    }));
  }

  create(userId: string, data: any) {
    return this.prisma.habit.create({
      data: {
        userId,
        title: data.title,
        domainType: data.domainType,
        relationshipId: data.relationshipId ?? null,
        targetPerWeek: data.targetPerWeek ?? 3,
        xpReward: data.xpReward ?? 10,
        sourceType: data.sourceType ?? 'user',
      },
    });
  }

  async complete(userId: string, id: string, note?: string) {
    const habit = await this.prisma.habit.findFirst({ where: { id, userId } });
    if (!habit) throw new NotFoundException('Habit not found');
    await this.prisma.habitLog.create({ data: { habitId: id, note } });
    const xp = await this.game.award(userId, 'habit_completed', habit.domainType, id);
    await this.scoring.recalcUserDomains(userId);
    return { habitId: id, xp };
  }

  /**
   * Weekly streak roll-over — invoked by the Sunday-night job.
   * Uses the forgiving frequency-based streak from the scoring engine.
   */
  async rolloverWeek(userId: string) {
    const habits = await this.prisma.habit.findMany({
      where: { userId, isActive: true },
      include: { logs: { where: { completedAt: { gte: await this.clock.daysAgo(userId, 7) } } } },
    });
    for (const h of habits) {
      const next = advanceStreak(
        {
          current: h.streakCurrent,
          best: h.streakBest,
          graceRemaining: h.graceRemaining,
        },
        { targetCompletions: h.targetPerWeek, actualCompletions: h.logs.length },
      );
      await this.prisma.habit.update({
        where: { id: h.id },
        data: {
          streakCurrent: next.current,
          streakBest: next.best,
          graceRemaining: next.graceRemaining,
        },
      });
    }
  }
}

