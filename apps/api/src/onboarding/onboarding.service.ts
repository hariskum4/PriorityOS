import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ScoringService } from '../scoring/scoring.service';
import { InsightsService } from '../insights/insights.service';
import { AiService } from '../ai/ai.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { LIFE_REVEAL, VALUES_EXTRACTION } from '@priority/ai-prompts';

@Injectable()
export class OnboardingService {
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
    const ranked: string[] = get('values', 'priorityRanking') ?? [];
    const neglected: string[] = get('values', 'neglectedDomains') ?? [];
    const regrets: string[] = get('values', 'regretRisks') ?? [];
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
    await this.scoring.recalcUserDomains(userId);
    await this.insights.regenerateForUser(userId);

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
      extractedValues = await this.ai.generate(
        userId,
        'values_extraction',
        VALUES_EXTRACTION,
        { futureSelf, eulogy },
        {
          values: ranked.slice(0, 5),
          reflection: 'You described a life measured in people and presence, not achievements. That is what Priority will help you protect.',
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
    const reveal = await this.ai.generate(
      userId,
      'life_reveal',
      LIFE_REVEAL,
      { domains, relationships, ranked, neglected, regrets },
      {
        headline: 'Your priorities, made visible',
        narrative: `You ranked ${top3.join(', ')} as what matters most. Your neglected areas right now: ${neglected.join(', ') || 'none flagged'}. Priority will turn these into one meaningful mission a day.`,
        topPriorities: top3,
        driftWarning: neglected.length
          ? `You flagged ${neglected[0]} as neglected — that gap is where regret compounds.`
          : 'No major drift flagged yet.',
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
