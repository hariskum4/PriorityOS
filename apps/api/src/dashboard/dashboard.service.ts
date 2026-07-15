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
      const personName = (topMission as any).relationship?.name as string | undefined;
      const gap = Math.max(
        0,
        Number(domain?.importanceScore ?? 0) - Number(domain?.attentionScore ?? 0),
      );
      // Fallback copy must not read like a template: name the person, name
      // the gap, vary the encouragement — deterministic but personal.
      const fallbackWhy = personName
        ? `Because ${personName} is the person this week keeps postponing — and ${topMission.domainType} is where your say-do gap is widest right now (${Math.round(gap)} points).`
        : gap > 20
          ? `You rated ${topMission.domainType} as important, but this week it's ${Math.round(gap)} points behind where you said it should be. This one action closes the most of that.`
          : `Of everything pending, this moves the needle most on what you said matters.`;
      const encouragements = [
        'Fifteen focused minutes beats a perfect plan.',
        'Small and today beats big and someday.',
        'Do the tiny version if the whole thing feels heavy.',
        'One honest step. That’s the whole assignment.',
      ];
      const dayIndex = Math.floor(Date.now() / 86_400_000) % encouragements.length;
      whyToday = await this.ai.generate(
        userId,
        'daily_focus',
        DAILY_FOCUS,
        {
          mission: { title: topMission.title, domain: topMission.domainType, person: personName },
          neglectRisk: Number(domain?.neglectRiskScore ?? 0),
          importance: Number(domain?.importanceScore ?? 0),
        },
        { whyToday: fallbackWhy, encouragement: encouragements[dayIndex] },
        // One generation per mission per day — not one per page load.
        { cacheKey: `${topMission.id}:${new Date().toISOString().slice(0, 10)}` },
      );
    }

    // Memory resurfacing: when today's mission is about a person, bring back
    // the last moment saved with them. Deterministic — the memory IS the copy.
    let resurfacedMemory: {
      title: string;
      reflection: string | null;
      occurredAt: Date;
      personName: string;
    } | null = null;
    if (topMission?.relationshipId) {
      const mem = await this.prisma.memory.findFirst({
        where: { userId, relationshipId: topMission.relationshipId },
        orderBy: { occurredAt: 'desc' },
        select: { title: true, reflection: true, occurredAt: true },
      });
      if (mem) {
        resurfacedMemory = {
          ...mem,
          personName: ((topMission as any).relationship?.name as string) ?? '',
        };
      }
    }

    return {
      todayMission: topMission,
      whyToday,
      resurfacedMemory,
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
