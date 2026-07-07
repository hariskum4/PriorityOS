import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MissionsService } from '../missions/missions.service';
import { GamificationService } from '../gamification/gamification.service';
import { InsightsService } from '../insights/insights.service';
import { AiService } from '../ai/ai.service';
import { DAILY_FOCUS } from '@priority/ai-prompts';

@Injectable()
export class DashboardService {
  constructor(
    private prisma: PrismaService,
    private missions: MissionsService,
    private game: GamificationService,
    private insights: InsightsService,
    private ai: AiService,
  ) {}

  /**
   * One payload for the home screen. Anti-overload rule: ONE top mission,
   * at most two supporting missions, one insight.
   */
  async get(userId: string) {
    const [ranked, domains, habits, profile, insights] = await Promise.all([
      this.missions.rankedPending(userId),
      this.prisma.lifeDomain.findMany({
        where: { userId },
        orderBy: { neglectRiskScore: 'desc' },
      }),
      this.prisma.habit.findMany({
        where: { userId, isActive: true },
        include: {
          logs: { where: { completedAt: { gte: startOfToday() } } },
        },
      }),
      this.game.profile(userId),
      this.insights.list(userId),
    ]);

    const topMission = ranked[0] ?? null;
    let whyToday: { whyToday: string; encouragement: string } | null = null;
    if (topMission) {
      const domain = domains.find((d) => d.domainType === topMission.domainType);
      whyToday = await this.ai.generate(
        userId,
        'daily_focus',
        DAILY_FOCUS,
        {
          mission: { title: topMission.title, domain: topMission.domainType },
          neglectRisk: Number(domain?.neglectRiskScore ?? 0),
          importance: Number(domain?.importanceScore ?? 0),
        },
        {
          whyToday: `${topMission.domainType} is your highest-gap area right now — this is the single action that closes it most.`,
          encouragement: 'Fifteen focused minutes beats a perfect plan.',
        },
      );
    }

    return {
      todayMission: topMission,
      whyToday,
      supportingMissions: ranked.slice(1, 3),
      domains: domains.map((d) => ({
        domainType: d.domainType,
        importance: Number(d.importanceScore),
        attention: Number(d.attentionScore),
        neglectRisk: Number(d.neglectRiskScore),
        health: Number(d.healthScore),
        trend: d.trend,
      })),
      todayHabits: habits.map((h) => ({
        id: h.id,
        title: h.title,
        domainType: h.domainType,
        targetPerWeek: h.targetPerWeek,
        doneToday: h.logs.length > 0,
        streak: h.streakCurrent,
      })),
      gamification: profile,
      insight: insights[0] ?? null,
    };
  }

  /** GET /recommendations/today — top mission + rationale only. */
  async today(userId: string) {
    const ranked = await this.missions.rankedPending(userId);
    return { mission: ranked[0] ?? null, alternates: ranked.slice(1, 3) };
  }
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
