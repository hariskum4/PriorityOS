import { Injectable } from '@nestjs/common';
import { detectCrisisLanguage } from '@priority/scoring-engine';
import { PrismaService } from '../prisma/prisma.service';
import { ScoringService } from '../scoring/scoring.service';
import { GamificationService } from '../gamification/gamification.service';

@Injectable()
export class JournalService {
  constructor(
    private prisma: PrismaService,
    private scoring: ScoringService,
    private game: GamificationService,
  ) {}

  list(userId: string) {
    return this.prisma.journalEntry.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async create(userId: string, data: any) {
    const entry = await this.prisma.journalEntry.create({
      data: {
        userId,
        mood: data.mood ?? null,
        gratitude: data.gratitude ?? null,
        whatMattered: data.whatMattered ?? null,
        whatIAvoided: data.whatIAvoided ?? null,
        gladNotPostponed: data.gladNotPostponed ?? null,
        freeText: data.freeText ?? null,
        domainTags: data.domainTags ?? [],
      },
    });
    await this.game.award(userId, 'journal_entry', 'reflection', entry.id);
    await this.scoring.recalcUserDomains(userId);

    // Blueprint §19.5: heavy disclosures switch the product from coaching
    // to a support pattern. Local, deterministic, never blocks the save,
    // and the flag is boolean — the matched words are not stored or logged.
    const supportSuggested = detectCrisisLanguage(
      data.whatMattered,
      data.whatIAvoided,
      data.gratitude,
      data.gladNotPostponed,
      data.freeText,
    );

    return { ...entry, supportSuggested };
  }
}
