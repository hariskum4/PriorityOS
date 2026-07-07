import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
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

      const goalCount = await this.prisma.goal.count({
        where: { userId, domainType: domain.domainType, status: 'active' },
      });

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

      await this.prisma.lifeDomain.update({
        where: { id: domain.id },
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
    }
  }
}
