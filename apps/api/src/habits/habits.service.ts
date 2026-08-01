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
  async list(userId: string, includeRetired = false) {
    const since = await this.clock.daysAgo(userId, RATE_WINDOW_DAYS);
    const habits = await this.prisma.habit.findMany({
      where: { userId, ...(includeRetired ? {} : { isActive: true }) },
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

  /**
   * Check a rhythm off for today. Once per day, whatever happens.
   *
   * This used to create a log every time it was called, with no guard of any
   * kind — the only thing standing between one honest tap and six logs was a
   * `disabled` prop on the client. Six calls in the same second produced six
   * logs and 60 XP, and made `perWeek` report 1.5, which is the number the
   * healthspan card reads to decide whether a lever is being kept. A figure
   * built to be honest was trivially forgeable.
   *
   * It did not need anyone dishonest, either. Mutations run `offlineFirst`
   * with `retry: 3`, so a single tap on a bad connection could write three.
   *
   * So the day is the unit, and the call is idempotent: tapping again returns
   * the same answer, awards nothing further, and says plainly that today was
   * already counted. A note sent with a repeat tap is still kept — someone
   * adding what they lifted after ticking the box is not a duplicate.
   */
  async complete(userId: string, id: string, note?: string) {
    const habit = await this.prisma.habit.findFirst({ where: { id, userId } });
    if (!habit) throw new NotFoundException('Habit not found');

    const startOfToday = await this.clock.startOfToday(userId);
    const already = await this.prisma.habitLog.findFirst({
      where: { habitId: id, completedAt: { gte: startOfToday } },
      orderBy: { completedAt: 'desc' },
    });

    if (already) {
      const trimmed = note?.trim();
      if (trimmed && !already.note) {
        await this.prisma.habitLog.update({ where: { id: already.id }, data: { note: trimmed } });
      }
      return {
        habitId: id,
        alreadyToday: true,
        xp: null,
        doneThisWeek: await this.doneThisWeek(userId, id),
        targetPerWeek: habit.targetPerWeek,
      };
    }

    await this.prisma.habitLog.create({ data: { habitId: id, note: note?.trim() || null } });
    const xp = await this.game.award(userId, 'habit_completed', habit.domainType, id);
    await this.scoring.recalcUserDomains(userId);
    return {
      habitId: id,
      alreadyToday: false,
      xp,
      doneThisWeek: await this.doneThisWeek(userId, id),
      targetPerWeek: habit.targetPerWeek,
    };
  }

  /** How many days this week this rhythm has been kept. Days, not taps. */
  private async doneThisWeek(userId: string, habitId: string): Promise<number> {
    return this.prisma.habitLog.count({
      where: { habitId, completedAt: { gte: await this.clock.startOfWeek(userId) } },
    });
  }

  /**
   * Undo today's check-in.
   *
   * Ticking the wrong row is easy and, with one log a day now enforced,
   * there was no way back from it — the row simply stayed struck through
   * until midnight. Removes today's log only; earlier days are history.
   */
  async uncomplete(userId: string, id: string) {
    const habit = await this.prisma.habit.findFirst({ where: { id, userId } });
    if (!habit) throw new NotFoundException('Habit not found');
    const startOfToday = await this.clock.startOfToday(userId);
    await this.prisma.habitLog.deleteMany({
      where: { habitId: id, completedAt: { gte: startOfToday } },
    });
    await this.scoring.recalcUserDomains(userId);
    return {
      habitId: id,
      doneThisWeek: await this.doneThisWeek(userId, id),
      targetPerWeek: habit.targetPerWeek,
    };
  }

  /**
   * Stop a rhythm without erasing that it happened.
   *
   * Deliberately not a delete. Someone who kept a habit for six months and no
   * longer needs it has not made a mistake to be undone — the streak, the
   * logs and the XP already awarded all stay, and the rhythm simply stops
   * being asked for. It also stops being re-offered: the ladder and the
   * healthspan levers both read retired habits as taken, so ending one does
   * not make the app suggest it again the next morning.
   */
  async retire(userId: string, id: string) {
    const habit = await this.prisma.habit.findFirst({ where: { id, userId } });
    if (!habit) throw new NotFoundException('Habit not found');
    return this.prisma.habit.update({ where: { id }, data: { isActive: false } });
  }

  /** Picking it back up. The streak resumes from where it was left. */
  async restore(userId: string, id: string) {
    const habit = await this.prisma.habit.findFirst({ where: { id, userId } });
    if (!habit) throw new NotFoundException('Habit not found');
    return this.prisma.habit.update({ where: { id }, data: { isActive: true } });
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

