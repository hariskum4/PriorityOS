/**
 * Steal the time — the stolen hour, phrased for one particular life.
 *
 * Two halves, kept firmly apart, because they fail in different ways.
 *
 * The **engine** decides. Which domains are starving is arithmetic over shares
 * (`domainShares`), which of them a single action can serve at once is a
 * ranked walk over a catalog, and which person to name is whoever is furthest
 * past the rhythm they asked for. All of it deterministic, unit-tested, and
 * explainable back to the person in their own numbers.
 *
 * The **model** writes. It receives slots that are already solved and returns
 * two strings for each: the action, and one line on why the single action
 * serves both things. It cannot choose a domain, cannot name a different
 * person, cannot add or drop a suggestion — the merge below only ever reads
 * `action` and `framing`, keyed to a slot the engine issued, and anything else
 * it sends is discarded unread.
 *
 * That split is this repo's standing rule ("the LLM narrates, it never
 * computes scores") and it is what makes AI safe here. A model that misreads
 * `purpose 3% → 0%` would be a lie about someone's life; a model that writes a
 * dull sentence is just a dull sentence, and the catalog line it replaced is
 * sitting right there as the fallback.
 *
 * What it buys: the catalog is 26 hand-written actions and cannot know that
 * someone cycles to work, has a six-year-old rather than a sixteen-year-old,
 * or has written three times this month about missing the long walks. The
 * ranking was already sharp. This is the vocabulary catching up.
 */
import { Injectable } from '@nestjs/common';
import { STACK_CRAFT } from '@priority/ai-prompts';
import {
  domainShares,
  lifeShape,
  suggestStacks,
  shortfallsCovered,
  type StackPerson,
  type StackSuggestion,
} from '@priority/scoring-engine';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { BlueprintService } from './blueprint.service';

/** Days a desired contact cadence stands for. */
const CADENCE_DAYS: Record<string, number> = {
  daily: 1, weekly: 7, biweekly: 14, monthly: 30, quarterly: 90, yearly: 365,
};

/** How long a finished stack rests before it can be suggested again. */
const RESUGGEST_AFTER_DAYS = 14;

const DAY_MS = 86_400_000;

/** Bounds on what the model may hand back, so a bad generation cannot shout. */
const MAX_ACTION = 90;
const MAX_FRAMING = 120;

export interface StacksResponse {
  stacks: StackSuggestion[];
  /** Domains getting less attention than they were promised. */
  shortDomains: Array<{ domainType: string; claimed: number; received: number; shortfall: number }>;
  /** Of those, the ones these stacks would actually feed. */
  helps: string[];
  /** Whether the wording came from the model or the catalog. Shown to nobody; useful in logs. */
  source: 'ai' | 'catalog';
}

@Injectable()
export class StacksService {
  constructor(
    private prisma: PrismaService,
    private ai: AiService,
    private blueprint: BlueprintService,
  ) {}

  async forUser(userId: string, limit = 3): Promise<StacksResponse> {
    const [domains, people, pending, done, user, personal] = await Promise.all([
      this.prisma.lifeDomain.findMany({
        where: { userId },
        select: { domainType: true, importanceScore: true, attentionScore: true },
      }),
      this.prisma.relationship.findMany({
        where: { userId },
        select: {
          id: true, name: true, relationType: true, lastContactAt: true,
          desiredCallFrequency: true, locationType: true,
        },
      }),
      this.prisma.mission.findMany({
        where: { userId, status: 'pending' },
        select: { title: true },
      }),
      this.prisma.mission.findMany({
        where: {
          userId,
          status: 'completed',
          completedAt: { gte: new Date(Date.now() - RESUGGEST_AFTER_DAYS * DAY_MS) },
        },
        select: { title: true },
      }),
      this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          profession: true, workType: true, workHoursPerWeek: true, city: true,
          country: true, maritalStatus: true, childrenCount: true, dob: true,
          livesAwayFromParents: true, motivationStyle: true, commuteMinutes: true,
        },
      }),
      /* Stacks written for this one person. They join the same pool and are
         ranked by the same shortfall arithmetic — no shortcut to the top. */
      this.blueprint.stacksFor(userId),
    ]);

    const shares = domainShares(domains.map((d) => ({
      domainType: d.domainType,
      importance: Number(d.importanceScore),
      attention: Number(d.attentionScore),
    })));

    const stackPeople: StackPerson[] = people.map((r) => {
      const days = r.lastContactAt
        ? Math.floor((Date.now() - r.lastContactAt.getTime()) / DAY_MS)
        : null;
      return {
        id: r.id,
        name: r.name,
        relationType: r.relationType,
        daysSince: days,
        // Never logged counts as well over — the reading the People tab uses.
        overdue: days === null ? 2 : days / (CADENCE_DAYS[r.desiredCallFrequency ?? 'monthly'] ?? 30),
        // So a by-phone stack never dials someone in the reader's own flat.
        locationType: r.locationType,
      };
    });

    const exclude = [...pending, ...done].map((m) => m.title);
    // Same gate the catalog's `role` applies to people, applied to the life:
    // no commute suggestions for someone who never leaves for work.
    const shape = lifeShape(user?.workType, user?.commuteMinutes);
    const engine = suggestStacks(shares, stackPeople, limit, exclude, shape, personal);
    const shortDomains = shares.filter((s) => s.shortfall > 0);

    const base: StacksResponse = {
      stacks: engine,
      shortDomains,
      helps: shortfallsCovered(engine),
      source: 'catalog',
    };
    if (!engine.length) return base;

    /**
     * Regenerate when the life changes, not when the screen is opened.
     *
     * The key is the shape of the need: which slots the engine chose, and who
     * they name. Complete something, let a domain slip, or let a friend go
     * quiet and the wording is rewritten; open the tab six times in an evening
     * and it is written once. The day-level cache in AiService does the rest.
     */
    const cacheKey = engine.map((s) => `${s.key}:${s.personId ?? '-'}`).join('|');

    const crafted = await this.ai.generate<{ stacks: Array<{ key: string; action: string; framing: string }> }>(
      userId,
      'stack_craft',
      STACK_CRAFT,
      {
        // Slots the model may phrase but not change.
        slots: engine.map((s) => ({
          key: s.key,
          domains: s.domains,
          person: s.person,
          baseAction: s.action,
          baseFraming: s.framing,
          // Stated so the wording can lean on the reason, never so the model
          // can recompute it.
          why: s.reason,
        })),
        profile: {
          profession: user?.profession ?? null,
          workType: user?.workType ?? null,
          workHoursPerWeek: user?.workHoursPerWeek ?? null,
          city: user?.city ?? null,
          country: user?.country ?? null,
          maritalStatus: user?.maritalStatus ?? null,
          childrenCount: user?.childrenCount ?? 0,
          livesAwayFromParents: user?.livesAwayFromParents ?? false,
          motivationStyle: user?.motivationStyle ?? 'balanced',
          ageYears: user?.dob
            ? Math.floor((Date.now() - user.dob.getTime()) / (365.25 * DAY_MS))
            : null,
        },
      },
      { stacks: [] },
      /**
       * Longer than the default, because nothing is waiting on it. The tab
       * renders the engine's own wording from cached data the moment it opens
       * and swaps in this one when it lands, so a slow generation costs a
       * plainer sentence for a few seconds and nothing else. At 25s this
       * timed out every time: three slots and a profile is a lot to ask of a
       * model that thinks out loud before it answers.
       */
      { cacheKey, timeoutMs: 60_000 },
    );

    const merged = this.merge(engine, crafted?.stacks, stackPeople.map((p) => p.name));
    return {
      ...base,
      stacks: merged.stacks,
      source: merged.changed ? 'ai' : 'catalog',
    };
  }

  /**
   * Take the wording, keep everything else.
   *
   * Written as a whitelist rather than a merge: the engine's slot is the
   * record, and exactly two fields of it can be overwritten. A model that
   * returns extra slots, renames a key, drops one, or writes an empty action
   * changes nothing — the catalog line stands. There is no path here by which
   * a generation can alter which domains a suggestion serves, who it names, or
   * why the engine chose it.
   */
  private merge(
    engine: StackSuggestion[],
    crafted: Array<{ key: string; action: string; framing: string }> | undefined,
    everyone: string[],
  ): { stacks: StackSuggestion[]; changed: boolean } {
    if (!Array.isArray(crafted) || !crafted.length) return { stacks: engine, changed: false };

    const byKey = new Map<string, { action?: string; framing?: string }>();
    for (const c of crafted) {
      if (!c || typeof c.key !== 'string') continue;
      byKey.set(c.key, { action: c.action, framing: c.framing });
    }

    let changed = false;
    const stacks = engine.map((slot) => {
      const c = byKey.get(slot.key);
      if (!c) return slot;

      const action = clean(c.action, MAX_ACTION);
      const framing = clean(c.framing, MAX_FRAMING);
      if (!action) return slot;

      /**
       * A slot names its own person or nobody.
       *
       * Two ways this goes wrong and both are checkable. A slot about Amma
       * that comes back about Arjun has quietly reassigned an hour of
       * someone's week to the wrong relationship. And a slot about nothing in
       * particular that comes back naming one of their people has invented a
       * plan involving a real human being.
       *
       * A name conjured from nowhere — one belonging to nobody in this record
       * — is not detectable here without guessing at proper nouns, and
       * guessing would reject "Cycle to Cubbon Park". That one is held by the
       * prompt's grounding rules and by the redaction layer, which never sends
       * a real name in the first place.
       */
      const namesSomeoneElse = everyone.some(
        (n) => n !== slot.person && mentions(action, n),
      );
      const keepsItsOwn = !slot.person || mentions(action, slot.person);
      if (namesSomeoneElse || !keepsItsOwn) return slot;

      if (action !== slot.action || (framing && framing !== slot.framing)) changed = true;
      return { ...slot, action, framing: framing || slot.framing };
    });

    return { stacks, changed };
  }
}

/**
 * Whether a line names a person — on word boundaries, so "Ravi" is not found
 * inside "ravioli" and a name is not matched as a fragment of another word.
 */
function mentions(text: string, name: string): boolean {
  if (!name) return false;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^\\p{L}])${escaped}([^\\p{L}]|$)`, 'iu').test(text);
}

/** One line, trimmed, within bounds, or nothing at all. */
function clean(s: unknown, max: number): string {
  if (typeof s !== 'string') return '';
  const one = s.replace(/\s+/g, ' ').trim().replace(/[.\s]+$/, '');
  return one.length > 0 && one.length <= max ? one : '';
}
