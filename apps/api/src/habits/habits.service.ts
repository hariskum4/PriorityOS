import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ScoringService } from '../scoring/scoring.service';
import { GamificationService } from '../gamification/gamification.service';
import { advanceStreak } from '@priority/scoring-engine';

@Injectable()
export class HabitsService {
  constructor(
    private prisma: PrismaService,
    private scoring: ScoringService,
    private game: GamificationService,
  ) {}

  list(userId: string) {
    return this.prisma.habit.findMany({
      where: { userId, isActive: true },
      include: {
        logs: {
          where: { completedAt: { gte: startOfWeek() } },
          orderBy: { completedAt: 'desc' },
        },
      },
    });
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
      include: { logs: { where: { completedAt: { gte: startOfWeek(-7) } } } },
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

function startOfWeek(offsetDays = 0): Date {
  const d = new Date();
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + offsetDays); // Monday
  d.setHours(0, 0, 0, 0);
  return d;
}
