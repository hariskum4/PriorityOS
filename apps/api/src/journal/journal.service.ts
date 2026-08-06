import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { detectCrisisLanguage } from '@priority/scoring-engine';
import { PrismaService } from '../prisma/prisma.service';
import { ScoringService } from '../scoring/scoring.service';
import { GamificationService } from '../gamification/gamification.service';
import { AiService } from '../ai/ai.service';
import { JOURNAL_DRAFT } from '@priority/ai-prompts';
import { firstPersonPast, insightPrompt } from '@priority/scoring-engine';

@Injectable()
export class JournalService {
  constructor(
    private prisma: PrismaService,
    private scoring: ScoringService,
    private game: GamificationService,
    private ai: AiService,
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

  /**
   * Whether there is anything here worth keeping.
   *
   * Mirrors the Journal screen's own `empty` check, which already disables
   * Save when every field is blank — this is the same rule on the side that
   * cannot be bypassed. Without it a payload naming no field the schema knows
   * still created a row: all-null, counted in the archive, awarded XP, and
   * fed into scoring. That is how a client typo becomes a journal full of
   * entries nobody wrote. An honest 400 is better than a blank memory.
   *
   * A mood on its own does count. Tapping "heavy" and closing the app is a
   * real entry, and the screen treats it as one.
   */
  private hasSomethingToKeep(data: any): boolean {
    if (data?.mood != null) return true;
    return ['gratitude', 'whatMattered', 'whatIAvoided', 'gladNotPostponed', 'freeText']
      .some((k) => typeof data?.[k] === 'string' && data[k].trim().length > 0);
  }

  async create(userId: string, data: any) {
    if (!this.hasSomethingToKeep(data)) {
      throw new BadRequestException(
        'An entry needs a mood or something written — nothing was sent to keep.',
      );
    }

    const text = (v: unknown) => {
      if (typeof v !== 'string') return null;
      const trimmed = v.trim();
      return trimmed.length > 0 ? trimmed : null;
    };

    const entry = await this.prisma.journalEntry.create({
      data: {
        userId,
        mood: data.mood ?? null,
        gratitude: text(data.gratitude),
        whatMattered: text(data.whatMattered),
        whatIAvoided: text(data.whatIAvoided),
        gladNotPostponed: text(data.gladNotPostponed),
        freeText: text(data.freeText),
        domainTags: Array.isArray(data.domainTags) ? data.domainTags : [],
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

  /**
   * The opening line of an entry about something just finished.
   *
   * The Journal has two halves that never met. "Today" is written — how the
   * day felt, what mattered, what was avoided. "Memories" is the archive: a
   * kept moment with a date and a person on it. Completing a mission and
   * tapping Save it produced the second and never the first, so the app could
   * know somebody called their mother and hold not one word about it.
   *
   * The blank page is why. Nobody opens a text field at nine at night to
   * describe a call they have already had. A first line they can accept,
   * change or delete is a different ask entirely.
   *
   * Every word has to be theirs rather than the model's, so the prompt is
   * forbidden from saying how it went — the app knows the call happened and
   * has no idea whether it was any good. "A lovely chat with Amma" is fiction
   * about somebody's evening, and praise is the app grading a life.
   *
   * The fallback is not a degraded path. With AI off this still returns a
   * usable line, because the whole point is a page that is not blank, and a
   * bare statement of what was done is the most honest sentence available.
   */
  async draft(userId: string, input: { title: string; personName?: string; domainType?: string }) {
    const title = input.title.trim();
    const withWhom = input.personName?.trim();
    /**
     * Plain, true, and in their own voice — a starting point to write over
     * rather than a sentence pretending to be a diary.
     *
     * `firstPersonPast` turns the catalog's imperative into an account: the
     * composer used to open with "Call Amma — not a text.", which is an
     * instruction sitting where somebody's own words belong. Null when the
     * title cannot be conjugated honestly, and then the box stays empty —
     * which is exactly what it was before this existed and is never wrong.
     *
     * The question is the half that matters. The expressive-writing trials
     * found the gain tracked causal and insight words rather than emotional
     * ones, so the useful thing to add is not more sentence, it is the
     * question that pulls for the sentence only they can write.
     */
    const fallback = {
      whatMattered: firstPersonPast({ title, personName: withWhom }) ?? '',
      prompt: insightPrompt({ title, personName: withWhom }) as string | null,
    };

    return this.ai.generate(
      userId,
      'journal_draft',
      JOURNAL_DRAFT,
      {
        finished: title,
        withWhom: withWhom ?? null,
        domain: input.domainType ?? null,
      },
      fallback,
      /* Keyed on the thing finished, so re-opening the composer for the same
         moment does not spend a second generation or hand back a different
         sentence than the one already being edited. */
      { cacheKey: `draft:${title}:${withWhom ?? ''}` },
    );
  }

}
