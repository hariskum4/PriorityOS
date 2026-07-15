import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GamificationService } from '../gamification/gamification.service';
import { AiService } from '../ai/ai.service';
import { InsightsService } from '../insights/insights.service';
import { JOURNAL_SUMMARY, WEEKLY_REVIEW_NARRATIVE } from '@priority/ai-prompts';

@Injectable()
export class WeeklyReviewService {
  constructor(
    private prisma: PrismaService,
    private game: GamificationService,
    private ai: AiService,
    private insights: InsightsService,
  ) {}

  async current(userId: string) {
    const { weekStart } = weekBounds();
    return this.prisma.weeklyReview.findUnique({
      where: { userId_weekStart: { userId, weekStart } },
    });
  }

  /** Generate (or regenerate) this week's review from deterministic stats. */
  async generate(userId: string) {
    const { weekStart, weekEnd } = weekBounds();

    // PRD §10.5: opportunity insights refresh at exactly two moments —
    // onboarding and the weekly review cycle. This is the second one.
    await this.insights.regenerateForUser(userId);

    const [missions, habitLogs, journalEntries, domains] = await Promise.all([
      this.prisma.mission.findMany({
        where: {
          userId,
          status: 'completed',
          completedAt: { gte: weekStart, lte: weekEnd },
        },
        include: { relationship: { select: { name: true } } },
      }),
      this.prisma.habitLog.count({
        where: {
          habit: { userId },
          completedAt: { gte: weekStart, lte: weekEnd },
        },
      }),
      this.prisma.journalEntry.findMany({
        where: { userId, createdAt: { gte: weekStart, lte: weekEnd } },
        orderBy: { createdAt: 'asc' },
        select: {
          mood: true,
          gratitude: true,
          whatMattered: true,
          whatIAvoided: true,
          freeText: true,
          domainTags: true,
          createdAt: true,
        },
      }),
      this.prisma.lifeDomain.findMany({ where: { userId } }),
    ]);
    const journal = journalEntries.length;

    // The journal stops being write-only here: the week's entries become
    // themes and (gently) a named avoidance pattern — their own words,
    // mirrored back. Skip entirely when there's nothing written.
    const writtenEntries = journalEntries.filter(
      (e) => e.whatMattered?.trim() || e.whatIAvoided?.trim() || e.gratitude?.trim() || e.freeText?.trim(),
    );
    let journalSummary: { themes: string[]; avoidancePattern: string | null; domainTags: string[] } | null = null;
    if (writtenEntries.length > 0) {
      const lastAvoided = [...writtenEntries].reverse().find((e) => e.whatIAvoided?.trim())?.whatIAvoided?.trim();
      const tagUnion = [
        ...new Set(writtenEntries.flatMap((e) => (Array.isArray(e.domainTags) ? (e.domainTags as string[]) : []))),
      ];
      journalSummary = await this.ai.generate(
        userId,
        'journal_summary',
        JOURNAL_SUMMARY,
        {
          entries: writtenEntries.map((e) => ({
            day: e.createdAt.toISOString().slice(0, 10),
            mood: e.mood,
            whatMattered: e.whatMattered?.slice(0, 400),
            whatIAvoided: e.whatIAvoided?.slice(0, 400),
            gratitude: e.gratitude?.slice(0, 200),
            freeText: e.freeText?.slice(0, 400),
          })),
        },
        // Fallback mirrors their own words — no interpretation, just honesty.
        {
          themes: tagUnion.slice(0, 4),
          avoidancePattern: lastAvoided
            ? `You named it yourself this week: "${lastAvoided.slice(0, 90)}"`
            : null,
          domainTags: tagUnion,
        },
      );
    }

    const domainDeltas = Object.fromEntries(
      domains.map((d) => [
        d.domainType,
        {
          attention: Number(d.attentionScore),
          neglectRisk: Number(d.neglectRiskScore),
          delta: Number(d.attentionScore) - Number(d.prevAttentionScore),
        },
      ]),
    );

    const neglectedDomains = domains
      .filter((d) => Number(d.neglectRiskScore) >= 50)
      .sort((a, b) => Number(b.neglectRiskScore) - Number(a.neglectRiskScore))
      .map((d) => d.domainType);

    const topWins = [
      ...missions
        .filter((m) => m.relationshipId)
        .map((m) => `Showed up for ${m.relationship?.name}: ${m.title}`),
      ...missions.filter((m) => !m.relationshipId).map((m) => m.title),
    ].slice(0, 3);

    const statsCtx = {
      completedMissions: missions.length,
      completedHabits: habitLogs,
      journalEntries: journal,
      domainDeltas,
      neglectedDomains,
      topWins,
      journalThemes: journalSummary?.themes ?? [],
      avoidancePattern: journalSummary?.avoidancePattern ?? null,
    };

    const narrative = await this.ai.generate(
      userId,
      'weekly_review',
      WEEKLY_REVIEW_NARRATIVE,
      statsCtx,
      {
        narrative: `You completed ${missions.length} mission(s) and ${habitLogs} habit check-in(s) this week. ${
          neglectedDomains.length
            ? `The biggest gap between what you value and where your time went: ${neglectedDomains[0]}.`
            : 'No domain crossed the neglect threshold — a genuinely aligned week.'
        }`,
        topWins,
        regretRiskFocus: neglectedDomains[0]
          ? `One meaningful action in ${neglectedDomains[0]} before next Sunday`
          : 'Keep the current balance',
        nextWeekFocus: (neglectedDomains.length
          ? neglectedDomains
          : domains
              .sort((a, b) => Number(b.importanceScore) - Number(a.importanceScore))
              .map((d) => d.domainType)
        )
          .slice(0, 3)
          .map((d) => `One meaningful action in ${d}`),
      },
    );

    const review = await this.prisma.weeklyReview.upsert({
      where: { userId_weekStart: { userId, weekStart } },
      create: {
        userId,
        weekStart,
        weekEnd,
        completedMissions: missions.length,
        completedHabits: habitLogs,
        journalEntries: journal,
        domainDeltas,
        topWins: narrative.topWins ?? topWins,
        neglectedDomains,
        regretRiskFocus: narrative.regretRiskFocus,
        nextWeekFocus: narrative.nextWeekFocus,
        aiNarrative: narrative.narrative,
        journalThemes: journalSummary?.themes ?? [],
        avoidancePattern: journalSummary?.avoidancePattern ?? null,
      },
      update: {
        completedMissions: missions.length,
        completedHabits: habitLogs,
        journalEntries: journal,
        domainDeltas,
        topWins: narrative.topWins ?? topWins,
        neglectedDomains,
        regretRiskFocus: narrative.regretRiskFocus,
        nextWeekFocus: narrative.nextWeekFocus,
        aiNarrative: narrative.narrative,
        journalThemes: journalSummary?.themes ?? [],
        avoidancePattern: journalSummary?.avoidancePattern ?? null,
      },
    });
    return review;
  }

  /**
   * Complete the full 6-step Sunday Session: domain self-scores, week word,
   * chosen next-week priorities (created as missions), the One Thing, and
   * an intention word. This is the retention backbone — completing it is
   * the product's north-star behavior.
   */
  async completeSession(
    userId: string,
    data: {
      weekWord?: string;
      domainSelfScores?: Record<string, number>;
      nextWeekPriorities?: { title: string; domainType: string }[];
      oneThing?: string;
      intentionWord?: string;
    },
  ) {
    const { weekStart } = weekBounds();
    // Ensure this week's review exists (user may run the session early).
    let review = await this.current(userId);
    if (!review) review = await this.generate(userId);

    const picked = (data.nextWeekPriorities ?? []).slice(0, 7);
    for (const p of picked) {
      await this.prisma.mission.create({
        data: {
          userId,
          title: p.title,
          domainType: p.domainType,
          missionType: 'one_time',
          estimatedMinutes: 15,
          xpReward: 30,
          sourceType: 'sunday_session',
        },
      });
    }

    review = await this.prisma.weeklyReview.update({
      where: { userId_weekStart: { userId, weekStart } },
      data: {
        weekWord: data.weekWord ?? null,
        domainSelfScores: data.domainSelfScores ?? {},
        oneThing: data.oneThing ?? null,
        intentionWord: data.intentionWord ?? null,
        sessionCompletedAt: new Date(),
        userCompletedAt: new Date(),
      },
    });
    const xp = await this.game.award(
      userId,
      'weekly_review_completed',
      'reflection',
      review.id,
    );
    return { review, xp, missionsCreated: picked.length };
  }

  /** User acknowledges the review — this is the retention ritual, reward it. */
  async acknowledge(userId: string) {
    const { weekStart } = weekBounds();
    const review = await this.prisma.weeklyReview.update({
      where: { userId_weekStart: { userId, weekStart } },
      data: { userCompletedAt: new Date() },
    });
    const xp = await this.game.award(
      userId,
      'weekly_review_completed',
      'reflection',
      review.id,
    );
    return { review, xp };
  }
}

export function weekBounds(ref = new Date()): { weekStart: Date; weekEnd: Date } {
  const weekStart = new Date(ref);
  weekStart.setDate(ref.getDate() - ((ref.getDay() + 6) % 7)); // Monday
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);
  return { weekStart, weekEnd };
}
