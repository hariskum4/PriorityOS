import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ScoringService } from '../scoring/scoring.service';
import { InsightsService } from '../insights/insights.service';
import { AiService } from '../ai/ai.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { LIFE_REVEAL, VALUES_EXTRACTION } from '@priority/ai-prompts';
import { ALL_DOMAINS } from '@priority/types';

/** The names people and integrations use for domains, mapped to the slugs the rows use. */
const DOMAIN_ALIASES: Record<string, string> = {
  finances: 'finance', money: 'finance',
  friendships: 'friends', friendship: 'friends', friend: 'friends',
  personal_growth: 'growth', learning: 'growth',
  spirituality: 'reflection', inner_life: 'reflection', mindfulness: 'reflection',
  recreation: 'experiences', fun: 'experiences', travel: 'experiences',
  community: 'impact', giving_back: 'impact', environment: 'impact', volunteering: 'impact',
  creative: 'purpose', creative_work: 'purpose', work: 'career', job: 'career',
  parents: 'family', kids: 'children', child: 'children', spouse: 'partner',
};

export function normalizeDomains(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const canonical = new Set<string>(ALL_DOMAINS);
  const out: string[] = [];
  for (const raw of value) {
    const key = String(raw).trim().toLowerCase().replace(/[\s/-]+/g, '_');
    const slug = canonical.has(key) ? key : DOMAIN_ALIASES[key];
    if (slug && !out.includes(slug)) out.push(slug);
  }
  return out;
}

@Injectable()
export class OnboardingService {
  private readonly logger = new Logger(OnboardingService.name);

  constructor(
    private prisma: PrismaService,
    private scoring: ScoringService,
    private insights: InsightsService,
    private ai: AiService,
    private analytics: AnalyticsService,
  ) {}

  async saveAnswers(
    userId: string,
    answers: { section: string; key: string; value: unknown }[],
  ) {
    for (const a of answers) {
      await this.prisma.onboardingAnswer.upsert({
        where: {
          userId_section_key: { userId, section: a.section, key: a.key },
        },
        create: { userId, section: a.section, key: a.key, value: a.value as object },
        update: { value: a.value as object },
      });
    }
    return { saved: answers.length };
  }

  getAnswers(userId: string) {
    return this.prisma.onboardingAnswer.findMany({ where: { userId } });
  }

  /**
   * Materializes onboarding answers into domain ranks/flags, recalculates
   * scores, generates opportunity insights and the AI Life Reveal.
   */
  async complete(userId: string) {
    const answers = await this.getAnswers(userId);
    const get = (section: string, key: string) =>
      answers.find((a) => a.section === section && a.key === key)?.value as any;

    // 1. Domain ranks + flags
    //
    // Matching was exact-string against the canonical slugs, so a caller
    // saying "finances" or "friendships" — perfectly reasonable names for the
    // same domains — had those ranks silently dropped: the reveal echoed the
    // list back while the rows underneath kept priorityRank NULL. Normalise
    // the common variants; a name that still doesn't resolve is skipped, but
    // it no longer takes its neighbours' semantics down with it.
    const ranked: string[] = normalizeDomains(get('values', 'priorityRanking'));
    const neglected: string[] = normalizeDomains(get('values', 'neglectedDomains'));
    const regrets: string[] = normalizeDomains(get('values', 'regretRisks'));
    for (const domain of await this.prisma.lifeDomain.findMany({ where: { userId } })) {
      const rank = ranked.indexOf(domain.domainType);
      await this.prisma.lifeDomain.update({
        where: { id: domain.id },
        data: {
          priorityRank: rank >= 0 ? rank + 1 : null,
          flaggedAsNeglected: neglected.includes(domain.domainType),
          regretRiskFlagged: regrets.includes(domain.domainType),
        },
      });
    }

    // 2. Scores + opportunity insights
    //
    // Neither may block step 3. Insight generation threw on one unusable
    // number and the exception propagated out of this method, so
    // `onboardingCompleted` was never set and the account was stranded on the
    // last screen of sign-up with no way forward — the worst possible place to
    // fail. Both of these are enrichment; finishing onboarding is not.
    try {
      await this.scoring.recalcUserDomains(userId);
    } catch (err) {
      this.logger.error(`recalcUserDomains failed for ${userId}`, err as Error);
    }
    try {
      await this.insights.regenerateForUser(userId);
    } catch (err) {
      this.logger.error(`regenerateForUser failed for ${userId}`, err as Error);
    }

    // 3. Mark complete
    await this.prisma.user.update({
      where: { id: userId },
      data: { onboardingCompleted: true },
    });

    // 3b. The 10x moment: extract values from the future-self + eulogy words.
    // Deterministic fallback keeps it meaningful with AI off; lights up fully
    // the instant AI_ENABLED=true with a key.
    const futureSelf = get('reflection', 'futureSelf');
    const eulogy = get('reflection', 'eulogy');
    let extractedValues: { values: string[]; reflection: string } | null = null;
    if (futureSelf || eulogy) {
      // Fallback mirrors a fragment of THEIR words back — the difference
      // between "an app" and "it heard me", even with the LLM off.
      const fragment = String(eulogy || futureSelf || '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 90);
      extractedValues = await this.ai.generate(
        userId,
        'values_extraction',
        VALUES_EXTRACTION,
        { futureSelf, eulogy },
        {
          values: ranked.slice(0, 5),
          reflection: fragment
            ? `"${fragment}${fragment.length >= 90 ? '…' : ''}" — hold onto that. Everything Priority asks of you is in service of that person.`
            : 'You described a life measured in people and presence, not achievements. That is what Priority will help you protect.',
        },
      );
    }

    // 4. Life Reveal narrative
    const domains = await this.prisma.lifeDomain.findMany({ where: { userId } });
    const relationships = await this.prisma.relationship.findMany({
      where: { userId },
      select: { name: true, relationType: true, wantsMoreTime: true, priorityScore: true },
    });
    const top3 = ranked.slice(0, 3);

    // Personalized deterministic fallback: their #1 domain, their self-rated
    // reality, the thing they keep postponing, the person they named, and
    // how they said they want to feel — their own onboarding, played back.
    const currentReality = (get('values', 'currentReality') ?? {}) as Record<string, number>;
    const postponing = String(get('reflection', 'postponing') ?? '').trim();
    const feeling = String(get('values', 'firstWeekFeeling') ?? '').trim();
    const person = relationships[0]?.name;
    const topDomain = top3[0] ?? 'family';
    const topReality = currentReality[topDomain];

    const narrativeParts: string[] = [];
    narrativeParts.push(
      typeof topReality === 'number'
        ? `You put ${topDomain} first — and rated yourself ${topReality}/5 on actually living it. That distance is the whole story, and it's closable.`
        : `You put ${topDomain} first. Priority's job is to make your weeks agree with that.`,
    );
    if (postponing) {
      narrativeParts.push(`You told us what keeps sliding: "${postponing.slice(0, 70)}". Not someday — this week, one small step.`);
    }
    if (person) {
      narrativeParts.push(`And ${person} is in this plan by name.`);
    }
    if (feeling) {
      narrativeParts.push(`Seven days from now, you said you want to feel ${feeling}. That's the finish line we're building toward.`);
    }

    const reveal = await this.ai.generate(
      userId,
      'life_reveal',
      LIFE_REVEAL,
      { domains, relationships, ranked, neglected, regrets, postponing, feeling },
      {
        headline: person ? `A plan with ${person} in it` : 'What you said, next to what you do',
        narrative: narrativeParts.join(' '),
        topPriorities: top3,
        driftWarning: neglected.length
          ? `You flagged ${neglected[0]} as drifting — that's the gap that compounds quietly. It gets first attention.`
          /**
           * Day one has no drift DATA — which is not the same as no drift.
           * The old fallback ("nothing is drifting — rare, and worth
           * protecting") congratulated a person the app had never watched,
           * two lines under bars showing say-90/do-0, and it said the same
           * thing to someone who had answered nothing at all.
           */
          : 'Drift shows up in how real weeks get spent, and Priority has not watched one of yours yet. A few ordinary days will show where it lives.',
        firstWeekFocus: top3.map((d) => `One meaningful action in ${d}`),
      },
    );

    await this.analytics.track(userId, 'onboarding_completed', {
      rankedCount: ranked.length,
      hasEulogy: !!eulogy,
    });

    return {
      onboardingCompleted: true,
      reveal: extractedValues ? { ...reveal, extractedValues } : reveal,
    };
  }
}
