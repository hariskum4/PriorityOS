/**
 * The rhythms a life is still missing, worded for that life.
 *
 * Same two halves as `stacks.service.ts`, kept apart for the same reason.
 *
 * The **engine** decides: which domains have no standing rhythm at all, which
 * rhythm each of those is still asking for, and how often it happens. That is
 * a lookup over `@priority/scoring-engine`'s catalog against the habits this
 * person already holds — deterministic, offline, and unchanged by anything
 * below.
 *
 * The **model** writes: two strings per slot, keyed to a slot the engine
 * issued. It cannot pick a domain, cannot change a cadence, cannot add or drop
 * a rhythm. The merge reads `title` and `because` and discards everything else
 * unread.
 *
 * What that buys is the thing a catalog structurally cannot have. "An hour a
 * week on what comes next" is right for everybody and specific to nobody: for
 * someone who told us at onboarding they are trying to leave their job it is
 * three old colleagues, and for someone who said they want to stay and go
 * deeper it is the certification they keep not booking. The onboarding answers
 * are already stored. They were simply never read on this path.
 */
import { Injectable } from '@nestjs/common';
import { RHYTHM_CRAFT } from '@priority/ai-prompts';
import { rhythmFor, type Rhythm } from '@priority/scoring-engine';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { BlueprintService } from './blueprint.service';

const DAY_MS = 86_400_000;

/** Bounds on what the model may hand back, matching the prompt's own. */
const MAX_TITLE = 42;
const MAX_BECAUSE = 100;

/**
 * How many domains get a crafted rhythm in one pass.
 *
 * The sky asks about one domain at a time, so this is a prefetch rather than a
 * page of results. Six covers every domain a person is likely to look at in a
 * session without turning one screen into a paragraph of generation.
 */
const MAX_SLOTS = 6;

/** Openings whose noun lives somewhere else on the page. The original bug. */
const DANGLING = /^(give|do|make|put|keep|start) it\b/i;

export interface CraftedRhythm extends Rhythm {
  domainType: string;
}

export interface RhythmsResponse {
  rhythms: CraftedRhythm[];
  source: 'ai' | 'catalog';
}

@Injectable()
export class RhythmsService {
  constructor(
    private prisma: PrismaService,
    private ai: AiService,
    private blueprint: BlueprintService,
  ) {}

  async forUser(userId: string): Promise<RhythmsResponse> {
    const [domains, habits, user, answers, goals, personal] = await Promise.all([
      this.prisma.lifeDomain.findMany({
        where: { userId },
        select: { domainType: true, importanceScore: true, attentionScore: true },
      }),
      /* Retired ones included. A rhythm somebody deliberately ended must not
         come back reworded — that would be the catalog's one honest rule
         defeated by the layer that was only supposed to rephrase it. */
      this.prisma.habit.findMany({
        where: { userId },
        select: { title: true, domainType: true, isActive: true },
      }),
      this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          profession: true, workType: true, workHoursPerWeek: true, city: true,
          country: true, maritalStatus: true, childrenCount: true, dob: true,
          livesAwayFromParents: true, parentsInLife: true, motivationStyle: true,
        },
      }),
      this.prisma.onboardingAnswer.findMany({
        where: { userId },
        select: { key: true, value: true },
      }),
      this.prisma.goal.findMany({
        where: { userId, status: { not: 'completed' } },
        select: { title: true, domainType: true },
        take: 5,
      }),
      /* The catalog written for this one person. Empty for anybody whose
         blueprint has not run, been switched off, or produced nothing the
         judge would keep — in which case everything below is unchanged. */
      this.blueprint.rhythmsFor(userId),
    ]);

    /* Domains that already hold a rhythm are not asking for one. Ranked by how
       far behind what the person said they wanted, so the ones they are most
       likely to open are the ones that get the language. */
    const held = new Set(
      habits.filter((h) => h.isActive !== false).map((h) => h.domainType),
    );
    const takenTitles = habits.map((h) => h.title);
    /* "Call home, the same day every week" is written for somebody whose
       family is a phone call away. Offered to a reader who told us they live
       with their parents — a full-time carer got it about the mother in the
       next room — it reads as the app not knowing the one thing it was told
       about their family. Marking it taken slides the offer to the domain's
       next rhythm, which works face to face. */
    if (user?.livesAwayFromParents === false) {
      takenTitles.push('Call home, the same day every week');
    }
    /**
     * Nothing aimed at a parent, for somebody who has none.
     *
     * Two of the family catalog's three are written straight at a living
     * parent — one asks you to call home weekly, and the other says "your
     * parents carry a whole life you have not heard, and it does not keep",
     * which is a sentence to read at eighty-seven when both of them are
     * decades gone. `family.hour` survives: an unhurried hour with the people
     * you have is true for siblings, cousins and grandchildren, and leaving
     * one rhythm standing means the domain still has something to offer
     * rather than falling silent.
     *
     * Explicit `false` only. `null` is every account that predates the
     * column, and treating "never asked" as "nobody" would delete a mother
     * on the strength of a migration.
     */
    if (user?.parentsInLife === false) {
      takenTitles.push(
        'Call home, the same day every week',
        'Ask one thing you have never asked',
      );
    }

    const ranked = domains
      .filter((d) => Number(d.importanceScore) > 0 && !held.has(d.domainType))
      .sort((a, b) => (
        (Number(b.importanceScore) - Number(b.attentionScore))
        - (Number(a.importanceScore) - Number(a.attentionScore))
      ));

    const engine: CraftedRhythm[] = [];
    for (const d of ranked) {
      /* Personal first, catalog as the fallback — the whole arrangement in
         one argument. A domain with a generated rhythm offers that; a domain
         without one offers what it always did. */
      const mine = personal.filter((p) => p.domainType === d.domainType);
      const r = rhythmFor(d.domainType, takenTitles, mine);
      if (r) engine.push({ ...r, domainType: d.domainType });
      if (engine.length >= MAX_SLOTS) break;
    }

    const base: RhythmsResponse = { rhythms: engine, source: 'catalog' };
    if (!engine.length) return base;

    /**
     * A blueprint rhythm is not sent to be reworded.
     *
     * It was written for this life already, so a rewrite could only make it
     * less specific — and this merge is the weaker of the two checks. It
     * enforces length and the dangling opener; the blueprint judge enforces
     * invented people, tone, and lives the reader does not lead. Handing a
     * judged title back to an unjudged pass would quietly lose those.
     */
    const personalKeys = new Set(personal.map((p) => p.key));
    const toCraft = engine.filter((r) => !personalKeys.has(r.key));
    if (!toCraft.length) return { rhythms: engine, source: 'ai' };

    const answerOf = (key: string) => answers.find((a) => a.key === key)?.value ?? null;

    const cacheKey = engine.map((r) => r.key).join('|');

    const crafted = await this.ai.generate<{ rhythms: Array<{ key: string; title: string; because: string }> }>(
      userId,
      'rhythm_craft',
      RHYTHM_CRAFT,
      {
        slots: toCraft.map((r) => ({
          key: r.key,
          domain: r.domainType,
          perWeek: r.perWeek,
          baseTitle: r.title,
          baseBecause: r.because,
        })),
        /* The answers that were already collected and never read here. This is
           the whole point of the pass: a rhythm for "career" means something
           different to somebody who wrote that they are trying to get out. */
        onboarding: {
          postponing: answerOf('postponing'),
          futureSelf: answerOf('futureSelf'),
          eulogy: answerOf('eulogy'),
          neglectedDomains: answerOf('neglectedDomains'),
          firstWeekFeeling: answerOf('firstWeekFeeling'),
        },
        goals: goals.map((g) => ({ title: g.title, domain: g.domainType })),
        profile: {
          profession: user?.profession ?? null,
          workType: user?.workType ?? null,
          workHoursPerWeek: user?.workHoursPerWeek ?? null,
          city: user?.city ?? null,
          country: user?.country ?? null,
          maritalStatus: user?.maritalStatus ?? null,
          childrenCount: user?.childrenCount ?? 0,
          livesAwayFromParents: user?.livesAwayFromParents ?? null,
          /* So nothing generated writes a mother into a life that does not
             have one. Only an explicit false says so; null is never asked. */
          hasParentsInLife: user?.parentsInLife !== false,
          motivationStyle: user?.motivationStyle ?? 'balanced',
          ageYears: user?.dob
            ? Math.floor((Date.now() - user.dob.getTime()) / (365.25 * DAY_MS))
            : null,
        },
      },
      { rhythms: [] },
      /* Nothing waits on this: the sky renders the catalog wording from cached
         data the moment a lens opens and swaps this in when it lands. */
      { cacheKey, timeoutMs: 60_000 },
    );

    const merged = this.merge(engine, crafted?.rhythms);
    return { rhythms: merged.rhythms, source: merged.changed ? 'ai' : 'catalog' };
  }

  /**
   * Take the wording, keep everything else.
   *
   * A whitelist rather than a merge. The engine's slot is the record and two
   * of its fields can be overwritten; a model that renames a key, returns an
   * extra slot, drops one, changes a cadence or writes an empty title changes
   * nothing at all and the catalog line stands.
   */
  private merge(
    engine: CraftedRhythm[],
    crafted: Array<{ key: string; title: string; because: string }> | undefined,
  ): { rhythms: CraftedRhythm[]; changed: boolean } {
    if (!Array.isArray(crafted) || !crafted.length) return { rhythms: engine, changed: false };

    const byKey = new Map<string, { title?: string; because?: string }>();
    for (const c of crafted) {
      if (!c || typeof c.key !== 'string') continue;
      byKey.set(c.key, { title: c.title, because: c.because });
    }

    let changed = false;
    const rhythms = engine.map((slot) => {
      const c = byKey.get(slot.key);
      if (!c) return slot;

      const title = clean(c.title, MAX_TITLE);
      const because = clean(c.because, MAX_BECAUSE);
      /* The defect this whole catalog was written to fix, guarded against
         reappearing by way of a generation: a title whose subject is missing
         reads as nonsense on a card that has nothing else on it. */
      if (!title || DANGLING.test(title)) return slot;

      if (title !== slot.title || (because && because !== slot.because)) changed = true;
      return { ...slot, title, because: because || slot.because };
    });

    return { rhythms, changed };
  }
}

/** One line, trimmed, within bounds, or nothing at all. */
function clean(s: unknown, max: number): string {
  if (typeof s !== 'string') return '';
  const one = s.replace(/\s+/g, ' ').trim().replace(/[.\s]+$/, '');
  return one.length > 0 && one.length <= max ? one : '';
}
