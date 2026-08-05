import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ScoringService } from '../scoring/scoring.service';
import { GamificationService } from '../gamification/gamification.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { AiService } from '../ai/ai.service';
import { RelationshipsService } from '../relationships/relationships.service';
import { MISSION_CRAFT } from '@priority/ai-prompts';
import {
  catalogKeyFor,
  rankMissions,
  suggestNextMission,
  MissionSuggestion,
  CADENCE_DAYS,
  Cadence,
  isRemoteLocation,
} from '@priority/scoring-engine';

/**
 * The deficit a suggestion was made into, as a band.
 *
 * Three names rather than a number: the risk score moves continuously and
 * slightly, so grouping six months of completions by the exact figure would
 * produce a thousand buckets of one. What the question needs is "was this
 * domain starving when we offered this", and three answers is enough to tell.
 */
function neglectBandFor(risk: { toNumber(): number } | number | null): 'unknown' | 'low' | 'medium' | 'high' {
  /* Prisma hands back a Decimal for this column, not a number. */
  const n = risk == null ? null : (typeof risk === 'number' ? risk : risk.toNumber());
  if (n == null || !Number.isFinite(n)) return 'unknown';
  if (n >= 66) return 'high';
  if (n >= 33) return 'medium';
  return 'low';
}

@Injectable()
export class MissionsService {
  private readonly logger = new Logger(MissionsService.name);

  constructor(
    private prisma: PrismaService,
    private scoring: ScoringService,
    private game: GamificationService,
    private analytics: AnalyticsService,
    private ai: AiService,
    private relationships: RelationshipsService,
  ) {}

  list(userId: string, status?: string) {
    // Completed missions are a momentum feed, not a priority queue — most
    // recent first, capped, so "I completed it" is never a dead end.
    if (status === 'completed') {
      return this.prisma.mission.findMany({
        where: { userId, status },
        orderBy: { completedAt: 'desc' },
        take: 30,
        include: { relationship: { select: { id: true, name: true, locationType: true } } },
      });
    }
    return this.prisma.mission.findMany({
      where: { userId, ...(status ? { status } : {}) },
      orderBy: [{ priorityScore: 'desc' }, { dueDate: 'asc' }],
      include: { relationship: { select: { id: true, name: true, locationType: true } } },
    });
  }

  async create(userId: string, data: any) {
    // Idempotent by title: tapping a starter button twice (or a retry) must
    // not stack identical missions — duplicates also jam the adaptive loop.
    const existing = await this.prisma.mission.findFirst({
      where: {
        userId,
        status: 'pending',
        title: { equals: String(data.title).trim(), mode: 'insensitive' },
      },
    });
    if (existing) return existing;
    /**
     * A link is a claim about whose life this row joins. Completing a
     * relationship mission writes a ContactLog onto that relationship, so a
     * foreign id here would let one account append to another account's
     * contact history. Same shape for goals: a foreign goalId would mark a
     * stranger's goal as stepped-on.
     */
    if (data.relationshipId) {
      const rel = await this.prisma.relationship.findFirst({
        where: { id: data.relationshipId, userId }, select: { id: true },
      });
      if (!rel) throw new NotFoundException('Relationship not found');
    }
    if (data.goalId) {
      const goal = await this.prisma.goal.findFirst({
        where: { id: data.goalId, userId }, select: { id: true },
      });
      if (!goal) throw new NotFoundException('Goal not found');
    }
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
        /* The catalog identity, same contract as Habit — see the note there.
           Ladder rungs are keyed by their own titles, so most missions that
           came from the app resolve; anything hand-written stays null. */
        sourceKey: data.sourceKey ?? catalogKeyFor(String(data.title ?? '')),
      },
    });
  }

  async update(userId: string, id: string, data: any) {
    await this.assertOwned(userId, id);
    return this.prisma.mission.update({ where: { id }, data });
  }

  async complete(userId: string, id: string) {
    const mission = await this.assertOwned(userId, id);
    /**
     * updateMany's count is the completion lock. Two taps land as two
     * requests; both read "pending", but exactly one flips the row. Without
     * this, the loser re-awarded XP, logged a second contact, and asked the
     * engine for another next-mission — six taps in one second once produced
     * six of everything.
     */
    const { count } = await this.prisma.mission.updateMany({
      where: { id, status: { not: 'completed' } },
      data: { status: 'completed', completedAt: new Date() },
    });
    const updated = await this.prisma.mission.findUniqueOrThrow({ where: { id } });
    if (count === 0) {
      // Already completed — idempotent: same shape, nothing awarded twice.
      return { mission: updated, xp: null, next: null };
    }
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
      // The contact just changed the urgency arithmetic; leaving the stored
      // score stale kept the People list shouting about a person just seen.
      await this.relationships.recalcPriority(mission.relationshipId);
    }
    const xpEvent = mission.relationshipId
      ? 'relationship_mission_completed'
      : 'mission_completed';
    const xp = await this.game.award(userId, xpEvent, mission.domainType, id);
    await this.scoring.recalcUserDomains(userId);
    await this.analytics.track(userId, 'mission_completed', {
      domainType: mission.domainType,
      relationship: !!mission.relationshipId,
      /**
       * Which catalog entry was kept, and how starved the domain was when it
       * was proposed.
       *
       * Not a metric anybody reads today. It is the only way the catalog ever
       * stops being editorial: with the identity and the deficit band on the
       * same row, six months of this answers "does `family.call` outperform
       * `family.hour` when the family domain is badly neglected" — which is a
       * question about this app's own users rather than about anybody's
       * literature, and the one thing a competitor cannot copy.
       *
       * Banded rather than exact, because the risk score drifts continuously
       * and a band is what a comparison can actually group by.
       */
      sourceKey: mission.sourceKey ?? null,
      neglectBand: neglectBandFor(
        (await this.prisma.lifeDomain.findFirst({
          where: { userId, domainType: mission.domainType },
          select: { neglectRiskScore: true },
        }))?.neglectRiskScore ?? null,
      ),
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
      select: { domainType: true, relationshipId: true, title: true },
    });
    // Count DISTINCT titles: duplicate rows (historical bug, double-taps)
    // must never convince the engine the plate is full and silence the loop.
    const distinctPending = new Set(pending.map((p) => p.title.trim().toLowerCase()));
    if (distinctPending.size >= 2) return null; // enough on the plate already

    const [domains, relationships, history, goals] = await Promise.all([
      this.prisma.lifeDomain.findMany({ where: { userId } }),
      this.prisma.relationship.findMany({ where: { userId, wantsMoreTime: true } }),
      // Last 30 days of missions: recency drives variant rotation, and
      // repeated snoozing ("not this") retires an action — dismissal is
      // the other half of the learning loop, not just completion.
      this.prisma.mission.findMany({
        where: { userId, createdAt: { gte: new Date(Date.now() - 30 * 86_400_000) } },
        select: { title: true, snoozeCount: true, createdAt: true },
      }),
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
        // The children templates switch on it — bedtime chapters are not a
        // mission for the parent of a 25-year-old in another city.
        locationType: r.locationType,
      })),
      goalsWithoutSteps: goals
        .filter((g) => g.missions.length === 0)
        .map((g) => ({ id: g.id, title: g.title, domainType: g.domainType })),
      lastCompletedDomain,
      pendingDomains: pending.map((p) => p.domainType),
      pendingRelationshipIds: pending
        .map((p) => p.relationshipId)
        .filter((id): id is string => !!id),
      pendingTitles: pending.map((p) => p.title),
      recentTitles: history
        .filter((m) => m.createdAt.getTime() >= Date.now() - 7 * 86_400_000)
        .map((m) => m.title),
      dismissedTitles: history.filter((m) => m.snoozeCount >= 2).map((m) => m.title),
    });
    if (!suggestion) return null;

    const mission = await this.prisma.mission.create({
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

    // Personalize in the background — the LLM never sits on the critical
    // path of a user interaction. The deterministic copy above is already
    // good; the AI pass rewrites it in the user's own words when it lands.
    void this.personalizeMission(userId, mission.id, suggestion).catch((err) =>
      this.logger.warn(`mission personalization failed: ${String(err)}`),
    );

    return mission;
  }

  /**
   * Rewrite an engine-selected mission in the user's own language: their
   * onboarding words, the person's name, the real numbers. Engine decides
   * WHAT; the model only decides how it's phrased. Fire-and-forget.
   */
  private async personalizeMission(
    userId: string,
    missionId: string,
    suggestion: MissionSuggestion,
  ) {
    if (!this.ai.enabled) return;

    const [answers, relationship, goal, domain] = await Promise.all([
      this.prisma.onboardingAnswer.findMany({
        where: { userId, key: { in: ['postponing', 'firstWeekFeeling', 'futureSelf'] } },
      }),
      suggestion.relationshipId
        ? this.prisma.relationship.findUnique({ where: { id: suggestion.relationshipId } })
        : null,
      suggestion.goalId
        ? this.prisma.goal.findUnique({ where: { id: suggestion.goalId } })
        : null,
      this.prisma.lifeDomain.findFirst({
        where: { userId, domainType: suggestion.domainType },
      }),
    ]);
    const answer = (key: string) =>
      String(answers.find((a) => a.key === key)?.value ?? '').slice(0, 200) || undefined;

    const crafted = await this.ai.generate(
      userId,
      'mission_craft',
      MISSION_CRAFT,
      {
        engineDecision: {
          domainType: suggestion.domainType,
          missionType: suggestion.missionType,
          baseTitle: suggestion.title,
          rationale: suggestion.rationale,
          estimatedMinutes: suggestion.estimatedMinutes,
        },
        person: relationship
          ? {
              name: relationship.name,
              relationType: relationship.relationType,
              daysSinceContact: relationship.lastContactAt
                ? Math.floor((Date.now() - relationship.lastContactAt.getTime()) / 86_400_000)
                : null,
              /* The same two facts the stack writer was missing. A name and a
                 relation type let a model write "read one more chapter at
                 bedtime" for a 25-year-old in another city — it is not a
                 hallucination so much as a question nobody answered. */
              ageYears: relationship.age ?? null,
              livesWithYou: relationship.locationType === 'same_home',
              isRemote: isRemoteLocation(relationship.locationType),
              seenInPerson: relationship.inPersonFrequency ?? null,
            }
          : null,
        goal: goal ? { title: goal.title } : null,
        domainScores: domain
          ? {
              importance: Number(domain.importanceScore),
              attention: Number(domain.attentionScore),
              neglectRisk: Number(domain.neglectRiskScore),
            }
          : null,
        userWords: {
          postponing: answer('postponing'),
          firstWeekFeeling: answer('firstWeekFeeling'),
          futureSelf: answer('futureSelf'),
        },
      },
      // Fallback = keep the deterministic copy; personalization is a bonus.
      { title: suggestion.title, microStep: '', rationale: suggestion.rationale },
    );

    const title = String(crafted.title ?? '').trim().slice(0, 80);
    const rationale = String(crafted.rationale ?? '').trim().slice(0, 200);
    const microStep = String(crafted.microStep ?? '').trim().slice(0, 120);
    if (!title || title.toLowerCase() === suggestion.title.toLowerCase()) return;

    // Only touch it if it's still pending and unchanged — never rewrite
    // something the user already completed or edited.
    await this.prisma.mission.updateMany({
      where: { id: missionId, userId, status: 'pending', title: suggestion.title },
      data: {
        title,
        aiRationale: rationale || suggestion.rationale,
        ...(microStep ? { description: microStep } : {}),
      },
    });
  }

  private async assertOwned(userId: string, id: string) {
    const mission = await this.prisma.mission.findFirst({ where: { id, userId } });
    if (!mission) throw new NotFoundException('Mission not found');
    return mission;
  }
}
