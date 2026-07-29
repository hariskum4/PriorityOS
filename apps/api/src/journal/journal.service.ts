import { Injectable, NotFoundException } from '@nestjs/common';
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

  /**
   * The entries, newest first, a page at a time.
   *
   * `take: 50` with no way to go further meant a journal silently stopped
   * existing past its fiftieth entry — which for a daily habit is under two
   * months. Keyset on `createdAt` rather than an offset, because entries are
   * written while you are reading and an offset would skip or repeat one.
   */
  list(userId: string, opts: { before?: string; q?: string; take?: number } = {}) {
    const take = Math.min(Math.max(Number(opts.take) || 30, 1), 100);
    return this.prisma.journalEntry.findMany({
      where: {
        userId,
        ...(opts.before ? { createdAt: { lt: new Date(opts.before) } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take,
    });
  }

  /**
   * Rewrite an entry.
   *
   * Only the fields actually sent are touched: a client editing one line must
   * not blank the other four, and `null` is a legitimate value meaning "I no
   * longer want this part kept".
   */
  async update(userId: string, id: string, data: any) {
    await this.assertOwned(userId, id);
    const FIELDS = ['mood', 'gratitude', 'whatMattered', 'whatIAvoided', 'gladNotPostponed', 'freeText', 'domainTags'];
    const patch = Object.fromEntries(
      Object.entries(data).filter(([k]) => FIELDS.includes(k)),
    );
    const entry = await this.prisma.journalEntry.update({ where: { id }, data: patch });
    await this.scoring.recalcUserDomains(userId);
    return entry;
  }

  /**
   * Unwrite it.
   *
   * A private journal you cannot take something out of is not private in the
   * way people mean the word. No soft delete, no tombstone: the row goes.
   */
  async remove(userId: string, id: string) {
    await this.assertOwned(userId, id);
    await this.prisma.journalEntry.delete({ where: { id } });
    await this.scoring.recalcUserDomains(userId);
    return { deleted: true };
  }

  private async assertOwned(userId: string, id: string) {
    const entry = await this.prisma.journalEntry.findFirst({ where: { id, userId } });
    if (!entry) throw new NotFoundException('Entry not found');
    return entry;
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
