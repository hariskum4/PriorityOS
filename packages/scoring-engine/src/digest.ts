import { lifeAlignment, type DomainBalance } from './alignment';

/**
 * A life, in about two hundred tokens.
 *
 * The obvious way to give a model context is to hand it the state: the
 * dashboard, the archive, the rhythms, the people. Measured, that is 13.7 KB
 * for one screen and about 83,500 tokens for three years of one person's
 * archive — a cost paid on every generation, growing with use, made almost
 * entirely of rows nobody is going to reason about.
 *
 * This is the other approach. Not the record, the *reading* of it: which
 * parts of a life are starving, who has slipped past their own rhythm, what
 * is actually being kept, and how much of the week left anything behind.
 * Every field is a conclusion some engine already reached, so the model is
 * given the same facts the screens are drawn from rather than the raw
 * material to draw its own — and when it writes a number, it is quoting one
 * that a person can check.
 *
 * Three properties it has to keep:
 *
 *   **Bounded.** The shape is fixed and every list is capped. A digest of
 *   somebody's tenth year is the same size as their first, which is what
 *   makes it safe to send often and safe to cache.
 *
 *   **Derived, never quoted.** Themes, counts and bands — never a sentence
 *   somebody wrote. The journal is the one place in this app where people say
 *   true things about their marriages, and none of it needs to leave for a
 *   model to know that reflection is being neglected.
 *
 *   **Deterministic.** Same inputs, same digest, byte for byte. It can be
 *   cached for a day, diffed against yesterday's, and tested — none of which
 *   is true of anything a model produces.
 *
 * Names are left in place. The redaction layer swaps them for placeholders at
 * the boundary where things actually leave, and doing it twice would mean two
 * implementations of the one rule that must never be got wrong.
 */

/** How far behind somebody is, in words a sentence can use. */
export type SlipBand = 'due' | 'overdue' | 'long overdue';

export interface DigestPerson {
  name: string;
  relation: string;
  /** Days since the last logged contact. Null when there has never been one. */
  daysSince: number | null;
  /** Their own stated rhythm, in days. */
  wantedEveryDays: number | null;
  band: SlipBand;
}

export interface DigestRhythm {
  title: string;
  domain: string;
  /** Kept this week, against what they asked of themselves. */
  doneThisWeek: number;
  targetPerWeek: number;
}

export interface DigestInput {
  age?: number | null;
  country?: string | null;
  /** 'working' | 'retired' | 'not_working' — the shape, not the job title. */
  workShape?: string | null;
  /** What they told the app about moving. Suggestions must respect it. */
  movementLimits?: string | null;
  domains?: DomainBalance[];
  people?: DigestPerson[];
  rhythms?: DigestRhythm[];
  /** Missions completed this week, and how many left a moment behind. */
  week?: { done: number; kept: number };
  /** Minutes in the day's longest open stretch, when a day was drawn. */
  longestFreeStretchMinutes?: number | null;
  /** Domains their own writing has been about lately. Derived tags only. */
  recentThemes?: string[];
}

export interface Digest {
  /** Schema version, so a cached digest from an older shape is recognisable. */
  v: 1;
  who: {
    age: number | null;
    country: string | null;
    workShape: string | null;
    movementLimits: string | null;
  };
  /** Where attention is against intention, worst first. Capped at three. */
  starving: Array<{ domain: string; wants: number; gets: number }>;
  /** The single best-served part, for contrast. Null when nothing is measured. */
  fed: string | null;
  /** 0–100. Null before anything has been measured at all. */
  alignment: number | null;
  /** Who has slipped past their own rhythm. Capped at three, worst first. */
  waiting: DigestPerson[];
  /** What is actually being kept, capped at five. */
  keeping: DigestRhythm[];
  week: { done: number; kept: number };
  /** Minutes in the longest open stretch, or null when no day was drawn. */
  freeStretchMinutes: number | null;
  themes: string[];
}

const cap = <T>(xs: T[] | undefined, n: number): T[] => (xs ?? []).slice(0, n);

/**
 * How many times past their own rhythm somebody is.
 *
 * Falls back to raw days when no cadence was ever stated, which keeps
 * somebody who was never given a rhythm in a sensible place rather than at
 * either extreme.
 */
function overdueRatio(p: DigestPerson): number {
  if (p.daysSince == null) return 0;
  if (!p.wantedEveryDays) return p.daysSince / 30;
  return p.daysSince / p.wantedEveryDays;
}
const num = (n: unknown): number | null =>
  (typeof n === 'number' && Number.isFinite(n) ? n : null);

/**
 * Build the digest.
 *
 * Nothing here computes anything new — `lifeAlignment` is the same reading the
 * Today screen prints, and the bands arrive already decided. This is
 * selection and capping, which is the entire job: the value is in what it
 * leaves out.
 */
export function buildDigest(input: DigestInput): Digest {
  const domains = (input.domains ?? []).filter((d) => d.importance > 0);
  const reading = domains.length ? lifeAlignment(domains) : null;

  /* Share of intention against share of attention, which is the comparison
     every domain sentence in this app is built on. Percentages rather than
     raw scores because a model reasons about "wants 30% and gets 4%" and
     cannot do anything useful with "importance 60, attention 8". */
  const totalWant = domains.reduce((s, d) => s + Math.max(0, d.importance), 0);
  const totalGot = domains.reduce((s, d) => s + Math.max(0, d.attention), 0);
  const pct = (n: number, total: number) => (total > 0 ? Math.round((n / total) * 100) : 0);

  const starving = domains
    .map((d) => ({
      domain: d.domainType,
      wants: pct(Math.max(0, d.importance), totalWant),
      gets: pct(Math.max(0, d.attention), totalGot),
    }))
    .filter((d) => d.wants > d.gets)
    .sort((a, b) => (b.wants - b.gets) - (a.wants - a.gets))
    .slice(0, 3);

  return {
    v: 1,
    who: {
      age: num(input.age),
      country: input.country ?? null,
      workShape: input.workShape ?? null,
      movementLimits: input.movementLimits ?? null,
    },
    starving,
    fed: reading?.fed?.domainType ?? null,
    alignment: reading ? Math.round(reading.score) : null,
    /**
     * Worst first, so a sentence that names one person names the right one —
     * and "worst" is how far past *their own* rhythm, not how many days.
     *
     * Sorted by raw days, a friend at 75 days on a monthly cadence outranks a
     * mother at 26 days on a weekly one. She is 3.7 times past what was asked
     * and he is 2.5, so the raw sort hands the model the wrong name and it
     * writes a true sentence about the less important silence.
     */
    waiting: cap(
      [...(input.people ?? [])].sort((a, b) => overdueRatio(b) - overdueRatio(a)),
      3,
    ),
    keeping: cap(input.rhythms, 5),
    week: {
      done: Math.max(0, Math.floor(input.week?.done ?? 0)),
      kept: Math.max(0, Math.floor(input.week?.kept ?? 0)),
    },
    freeStretchMinutes: num(input.longestFreeStretchMinutes),
    themes: cap(input.recentThemes, 4),
  };
}

/**
 * Roughly how much of a model's context this will occupy.
 *
 * Four characters to a token is the usual English approximation and close
 * enough for a budget. It exists so a test can fail when the digest starts
 * growing, which is the failure mode this whole file is here to prevent.
 */
export function digestTokenEstimate(digest: Digest): number {
  return Math.ceil(JSON.stringify(digest).length / 4);
}
