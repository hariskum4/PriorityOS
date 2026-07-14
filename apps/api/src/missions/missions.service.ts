import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ScoringService } from '../scoring/scoring.service';
import { GamificationService } from '../gamification/gamification.service';
import { AnalyticsService } from '../analytics/analytics.service';
import {
  rankMissions,
  suggestNextMission,
  CADENCE_DAYS,
  Cadence,
} from '@priority/scoring-engine';

@Injectable()
export class MissionsService {
  constructor(
    private prisma: PrismaService,
    private scoring: ScoringService,
    private game: GamificationService,
    private analytics: AnalyticsService,
  ) {}

  list(userId: string, status?: string) {
    return this.prisma.mission.findMany({
      where: { userId, ...(status ? { status } : {}) },
      orderBy: [{ priorityScore: 'desc' }, { dueDate: 'asc' }],
      include: { relationship: { select: { id: true, name: true } } },
    });
  }

  create(userId: string, data: any) {
    return this.prisma.mission.create({
      data: {
        userId,
        title: data.title,
        description: data.description ?? null,
        domainType: data.domainType,
        missionType: data.missionType ?? 'one_time',
        relationshipId: data.relationshipId ?? null,
        goalId: data.goalId ?? null,
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        recurrenceRule: data.recurrenceRule ?? null,
        estimatedMinutes: data.estimatedMinutes ?? null,
        energyLevel: data.energyLevel ?? null,
        xpReward: data.xpReward ?? 25,
        sourceType: data.sourceType ?? 'user',
      },
    });
  }

  async update(userId: string, id: string, data: any) {
    await this.assertOwned(userId, id);
    return this.prisma.mission.update({ where: { id }, data });
  }

  async complete(userId: string, id: string) {
    const mission = await this.assertOwned(userId, id);
    const updated = await this.prisma.mission.update({
      where: { id },
      data: { status: 'completed', completedAt: new Date() },
    });
    // Relationship missions also count as contact — no double data entry.
    if (mission.relationshipId) {
      await this.prisma.contactLog.create({
        data: {
          relationshipId: mission.relationshipId,
          kind: 'activity',
          note: `Mission: ${mission.title}`,
        },
      });
      await this.prisma.relationship.update({
        where: { id: mission.relationshipId },
        data: { lastContactAt: new Date() },
      });
    }
    const xpEvent = mission.relationshipId
      ? 'relationship_mission_completed'
      : 'mission_completed';
    const xp = await this.game.award(userId, xpEvent, mission.domainType, id);
    await this.scoring.recalcUserDomains(userId);
    await this.analytics.track(userId, 'mission_completed', {
      domainType: mission.domainType,
      relationship: !!mission.relationshipId,
    });
    // The adaptive loop: one meaningful action done → the engine reads the
    // refreshed life-graph and lines up the next one. Today never runs dry.
    const next = await this.ensureNextMission(userId, mission.domainType);
    return { mission: updated, xp, next };
  }

  async snooze(userId: string, id: string) {
    await this.assertOwned(userId, id);
    return this.prisma.mission.update({
      where: { id },
      data: {
        snoozeCount: { increment: 1 },
        dueDate: new Date(Date.now() + 86_400_000),
      },
    });
  }

  /** Rank pending missions with the deterministic engine; returns ordered list. */
  async rankedPending(userId: string) {
    const [missions, domains] = await Promise.all([
      this.prisma.mission.findMany({
        where: { userId, status: 'pending' },
        include: { relationship: true },
      }),
      this.prisma.lifeDomain.findMany({ where: { userId } }),
    ]);
    const byDomain = new Map(domains.map((d) => [d.domainType, d]));
    const ranked = rankMissions(
      missions.map((m) => {
        const d = byDomain.get(m.domainType);
        return {
          id: m.id,
          domainNeglectRisk: Number(d?.neglectRiskScore ?? 0),
          domainImportance: Number(d?.importanceScore ?? 0),
          relationshipPriority: m.relationship
            ? Number(m.relationship.priorityScore)
            : undefined,
          dueInDays: m.dueDate
            ? Math.ceil((m.dueDate.getTime() - Date.now()) / 86_400_000)
            : null,
          estimatedMinutes: m.estimatedMinutes,
          snoozeCount: m.snoozeCount,
        };
      }),
    );
    const order = new Map(ranked.map((r, i) => [r.id, i]));
    return missions.sort((a, b) => order.get(a.id)! - order.get(b.id)!);
  }

  /**
   * The adaptive loop's server half. If the pending list is running low,
   * read the refreshed life-graph (post-completion scores), ask the engine
   * for the next-best small action, and create it as a real AI mission.
   */
  async ensureNextMission(userId: string, lastCompletedDomain?: string | null) {
    const pending = await this.prisma.mission.findMany({
      where: { userId, status: 'pending' },
      select: { domainType: true, relationshipId: true },
    });
    if (pending.length >= 2) return null; // enough on the plate already

    const [domains, relationships, goals] = await Promise.all([
      this.prisma.lifeDomain.findMany({ where: { userId } }),
      this.prisma.relationship.findMany({ where: { userId, wantsMoreTime: true } }),
      this.prisma.goal.findMany({
        where: { userId, status: 'active' },
        // A goal is "stepless" only if nothing is pending AND nothing was
        // completed recently — one small step a week, not the same step
        // re-suggested the moment you finish it.
        include: {
          missions: {
            where: {
              OR: [
                { status: 'pending' },
                {
                  status: 'completed',
                  completedAt: { gte: new Date(Date.now() - 5 * 86_400_000) },
                },
              ],
            },
            select: { id: true },
          },
        },
      }),
    ]);

    const suggestion = suggestNextMission({
      domains: domains.map((d) => ({
        domainType: d.domainType,
        importance: Number(d.importanceScore),
        attention: Number(d.attentionScore),
        neglectRisk: Number(d.neglectRiskScore),
      })),
      relationships: relationships.map((r) => ({
        id: r.id,
        name: r.name,
        relationType: r.relationType,
        daysSinceContact: r.lastContactAt
          ? Math.floor((Date.now() - r.lastContactAt.getTime()) / 86_400_000)
          : null,
        desiredCadenceDays:
          CADENCE_DAYS[(r.desiredCallFrequency ?? 'weekly') as Cadence] ?? 7,
      })),
      goalsWithoutSteps: goals
        .filter((g) => g.missions.length === 0)
        .map((g) => ({ id: g.id, title: g.title, domainType: g.domainType })),
      lastCompletedDomain,
      pendingDomains: pending.map((p) => p.domainType),
      pendingRelationshipIds: pending
        .map((p) => p.relationshipId)
        .filter((id): id is string => !!id),
    });
    if (!suggestion) return null;

    return this.prisma.mission.create({
      data: {
        userId,
        title: suggestion.title,
        domainType: suggestion.domainType,
        missionType: suggestion.missionType,
        relationshipId: suggestion.relationshipId ?? null,
        goalId: suggestion.goalId ?? null,
        estimatedMinutes: suggestion.estimatedMinutes,
        xpReward: suggestion.xpReward,
        sourceType: 'AI',
        aiRationale: suggestion.rationale,
      },
    });
  }

  private async assertOwned(userId: string, id: string) {
    const mission = await this.prisma.mission.findFirst({ where: { id, userId } });
    if (!mission) throw new NotFoundException('Mission not found');
    return mission;
  }
}
