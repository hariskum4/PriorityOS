import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { weekOf } from '../common/time';
import {
  calculateImportanceScore,
  calculateAttentionScore,
  calculateNeglectRiskScore,
  calculateDomainScore,
  DEFAULT_SCORING_CONFIG,
  ScoringConfig,
  BehaviorEvent,
  EVENT_WEIGHTS,
} from '@priority/scoring-engine';

const WINDOW_DAYS = 30;

@Injectable()
export class ScoringService {
  constructor(private prisma: PrismaService) {}

  async config(): Promise<ScoringConfig> {
    const row = await this.prisma.appConfig.findUnique({
      where: { key: 'scoring' },
    });
    return row
      ? { ...DEFAULT_SCORING_CONFIG, ...(row.value as object) }
      : DEFAULT_SCORING_CONFIG;
  }

  /**
   * Recalculate all domain scores for a user. Called after mission/habit
   * completion, journal writes, onboarding, and by the nightly job.
   */
  async recalcUserDomains(userId: string) {
    const cfg = await this.config();
    const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000);
    /** What each domain stood at once recomputed — kept as this week's sample. */
    const standing: Array<{ domainType: string; importance: number; attention: number }> = [];
    const [domains, missions, habits, journal] = await Promise.all([
      this.prisma.lifeDomain.findMany({ where: { userId } }),
      this.prisma.mission.findMany({
        where: { userId, updatedAt: { gte: since } },
      }),
      this.prisma.habit.findMany({
        where: { userId },
        include: { logs: { where: { completedAt: { gte: since } } } },
      }),
      this.prisma.journalEntry.findMany({
        where: { userId, createdAt: { gte: since } },
      }),
    ]);

    const ranked = domains.filter((d) => d.priorityRank !== null).length;

    /**
     * Active goals per domain, counted once.
     *
     * This was a `goal.count` inside the loop below — twelve queries issued
     * one after another, each waiting for the one before it. That is free on
     * a laptop and expensive in production, where the API runs in Oregon and
     * the database is in Mumbai: every await is a quarter of a second on the
     * wire, so twelve counts and twelve updates cost six seconds of doing
     * nothing. One grouped query answers all twelve.
     */
    const goalCounts = new Map<string, number>();
    for (const row of await this.prisma.goal.groupBy({
      by: ['domainType'],
      where: { userId, status: 'active' },
      _count: { _all: true },
    })) {
      goalCounts.set(row.domainType, row._count._all);
    }

    /** Each domain's new row, computed in memory and written in one pass. */
    const writes: Array<{ id: string; data: Record<string, unknown> }> = [];

    for (const domain of domains) {
      const events: BehaviorEvent[] = [];
      const ageDays = (d: Date) =>
        Math.floor((Date.now() - d.getTime()) / 86_400_000);

      let lastAction: Date | null = domain.lastMeaningfulActionAt;
      let snoozes = 0;

      for (const m of missions.filter((m) => m.domainType === domain.domainType)) {
        if (m.status === 'completed' && m.completedAt) {
          events.push({
            ageDays: ageDays(m.completedAt),
            weight: EVENT_WEIGHTS.missionCompleted,
          });
          if (!lastAction || m.completedAt > lastAction) lastAction = m.completedAt;
        }
        snoozes += m.snoozeCount;
      }
      for (const h of habits.filter((h) => h.domainType === domain.domainType)) {
        for (const log of h.logs) {
          events.push({
            ageDays: ageDays(log.completedAt),
            weight: EVENT_WEIGHTS.habitCompleted,
          });
          if (!lastAction || log.completedAt > lastAction) lastAction = log.completedAt;
        }
      }
      for (const j of journal) {
        const tags = (j.domainTags as string[]) ?? [];
        if (tags.includes(domain.domainType)) {
          events.push({
            ageDays: ageDays(j.createdAt),
            weight: EVENT_WEIGHTS.journalMention,
          });
        }
      }

      const goalCount = goalCounts.get(domain.domainType) ?? 0;

      const importance = calculateImportanceScore({
        priorityRank: domain.priorityRank ?? undefined,
        totalRanked: ranked,
        activeGoalCount: goalCount,
        flaggedAsNeglected: domain.flaggedAsNeglected,
        regretRiskFlagged: domain.regretRiskFlagged,
      });
      const attention = calculateAttentionScore(events, cfg);
      const neglectRisk = calculateNeglectRiskScore(
        {
          importance,
          attention,
          daysSinceLastMeaningfulAction: lastAction
            ? Math.floor((Date.now() - lastAction.getTime()) / 86_400_000)
            : null,
          snoozeCount: snoozes,
        },
        cfg,
      );
      const { health, trend } = calculateDomainScore(
        {
          attention,
          neglectRisk,
          previousAttention: Number(domain.prevAttentionScore),
        },
        cfg,
      );

      writes.push({
        id: domain.id,
        data: {
          importanceScore: importance,
          prevAttentionScore: domain.attentionScore,
          attentionScore: attention,
          neglectRiskScore: neglectRisk,
          healthScore: health,
          trend,
          lastMeaningfulActionAt: lastAction,
        },
      });
      standing.push({ domainType: domain.domainType, importance, attention });
    }

    /* Twelve independent updates, sent together rather than in single file.
       Nothing here reads what another write produced, so the ordering was
       never load-bearing — only slow. */
    await Promise.all(writes.map((w) => this.prisma.lifeDomain.update({
      where: { id: w.id },
      data: w.data,
    })));

    await this.recordThisWeek(userId, standing);
  }

  /**
   * Keep this week's standing, every time it changes.
   *
   * The history behind the sky was written by a Monday 03:00 cron and nothing
   * else, which meant a new account had no history at all for up to a week,
   * one point for the week after that, and — since the trend engines refuse to
   * speak below six samples — nothing resembling a trend for a month and a
   * half. Someone joins a tool for living deliberately and it is visibly inert
   * for six weeks, which is exactly when they are deciding whether to stay.
   *
   * The row is unique per (user, domain, week), so writing it on every recompute
   * costs one upsert and keeps the current week honest as the week is lived
   * rather than as it looked at 3am on Monday. The cron stays: it catches the
   * weeks where somebody records nothing at all, which is a true sample too.
   *
   * Deliberately after the domain writes, and deliberately not awaited inside
   * the loop — a failure to keep history must never fail the write that
   * prompted it.
   */
  private async recordThisWeek(
    userId: string,
    standing: Array<{ domainType: string; importance: number; attention: number }>,
  ) {
    if (!standing.length) return;
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { timezone: true },
      });
      const week = weekOf(new Date(), user?.timezone);

      await Promise.all(standing.map((s) =>
        this.prisma.domainAttentionSample.upsert({
          where: {
            userId_domainType_weekOf: { userId, domainType: s.domainType, weekOf: week },
          },
          create: {
            userId, domainType: s.domainType, weekOf: week,
            importance: s.importance, attention: s.attention,
          },
          update: { importance: s.importance, attention: s.attention },
        })));
    } catch {
      // History is a nice-to-have on this path; the cron will catch up.
    }
  }
}
