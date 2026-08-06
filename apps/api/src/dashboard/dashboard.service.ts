import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UserClock } from '../common/clock.module';
import { MissionsService } from '../missions/missions.service';
import { GamificationService } from '../gamification/gamification.service';
import { InsightsService } from '../insights/insights.service';
import { AiService } from '../ai/ai.service';
import { DigestService } from '../life-os/digest.service';
import { DAILY_FOCUS } from '@priority/ai-prompts';
import { safeRephrase } from '@priority/scoring-engine';

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(
    private prisma: PrismaService,
    private missions: MissionsService,
    private game: GamificationService,
    private insights: InsightsService,
    private ai: AiService,
    private digest: DigestService,
    private clock: UserClock,
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
      /**
       * Today's logs drive the tick, and the week's count drives what the row
       * is allowed to claim. A rhythm asked for twice a week used to strike
       * itself through after one tap — a completion idiom on what is really a
       * tally, so a half-kept commitment read as finished.
       */
      this.prisma.habit.findMany({
        where: { userId, isActive: true },
        include: {
          logs: { where: { completedAt: { gte: await this.clock.startOfToday(userId) } } },
          _count: {
            select: { logs: { where: { completedAt: { gte: await this.clock.startOfWeek(userId) } } } },
          },
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
      /**
       * "X points behind" is a measurement, and a measurement needs a week.
       *
       * Attention starts at zero, so on day one the gap equals the whole
       * importance score and every domain is maximally "behind". A carer who
       * had just rated family 5/5 — and been told by the Reveal, minutes
       * earlier, that it was worth protecting rather than fixing — opened
       * Today to "family is 60 points behind where you said it should be".
       * Both sentences from the same app, an hour apart. Until one thing has
       * actually been done, there is no "do" side to compare, and the copy
       * says something true instead of something measured.
       */
      const watched = await this.prisma.mission.count({
        where: { userId, status: 'completed' },
        take: 1,
      }) > 0 || habits.some((h) => (h._count?.logs ?? 0) > 0);
      const gap = watched
        ? Math.max(
          0,
          Number(domain?.importanceScore ?? 0) - Number(domain?.attentionScore ?? 0),
        )
        : 0;
      /**
       * A gap is only worth naming when there is one.
       *
       * This branch asserted the domain was "where your say-do gap is widest
       * right now (0 points)" — widest, and zero, in one sentence, on the
       * first card a reader sees. `gap` is clamped at zero, so a domain
       * already getting everything they asked of it was being reported as
       * the worst thing in their life. The person is reason enough alone;
       * the number joins in only when it says something, which is the same
       * bar the branch below already applied.
       */
      const behind = gap > 20
        ? ` — and ${topMission.domainType} is ${Math.round(gap)} points behind where you said it should be`
        : '';
      // Fallback copy must not read like a template: name the person, name
      // the gap, vary the encouragement — deterministic but personal.
      const fallbackWhy = personName
        ? `Because ${personName} is the person this week keeps postponing${behind}.`
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
      /**
       * The whole reading, not three numbers about one domain.
       *
       * "Why this mission, today" is a question about what it beats, and the
       * context here could not answer it: the mission's own neglect risk and
       * importance, and nothing about the rest of the life it was competing
       * with. The digest is ~200 tokens and carries what is starving, who has
       * slipped past their own rhythm, what is being kept and what the week
       * left behind — every number of it already computed for a screen, so
       * anything the model quotes is something the reader can check.
       *
       * Never fatal. A digest that fails to build leaves the model with the
       * mission alone, which is what it had before this line existed.
       */
      /**
       * The model edits; it does not decide.
       *
       * `fallbackWhy` is not a fallback any more — it is the sentence, written
       * by the code that owns the numbers and knows what they mean. The model
       * is handed it and asked for a better version of the same claim, and
       * `safeRephrase` throws that version away if it introduced a number, a
       * name or a unit the original did not carry.
       *
       * Worth the loss of range. Given the whole digest and asked to reason,
       * a good model wrote five false sentences in one evening — all of them
       * plausible, none of them catchable by a test. This shape cannot
       * produce that class of error at all.
       */
      const edited = await this.ai.generateOrDefer(
        userId,
        'daily_focus',
        DAILY_FOCUS,
        { sentence: fallbackWhy },
        { whyToday: fallbackWhy, encouragement: encouragements[dayIndex] },
        // One generation per mission per day — not one per page load.
        { cacheKey: `${topMission.id}:${await this.clock.dayKey(userId)}` },
      );
      const checked = safeRephrase(fallbackWhy, edited?.whyToday);
      if (checked.used === 'engine' && checked.reasons.length && edited?.whyToday !== fallbackWhy) {
        this.logger.warn(`daily_focus rewrite rejected: ${checked.reasons.join('; ')}`);
      }
      whyToday = {
        whyToday: checked.sentence,
        encouragement: edited?.encouragement ?? encouragements[dayIndex],
      };
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
        /**
         * The position the reader put this in, not just the score it produces.
         *
         * Importance is the rank plus a bonus for active goals and flags, so
         * two domains can swap places on score without their ranking having
         * moved. That was harmless while a ranking was permanent. Now that it
         * can be reordered, a card sorted by score would show somebody an
         * order they did not set and read as their change not having landed.
         */
        priorityRank: d.priorityRank,
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
        /** Days kept this week — the number the row is allowed to claim on. */
        doneThisWeek: h._count.logs,
        metThisWeek: h._count.logs >= h.targetPerWeek,
        todayNote: h.logs[0]?.note ?? null,
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

