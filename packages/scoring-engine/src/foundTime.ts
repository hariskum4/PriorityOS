/**
 * An hour that appeared — what to do with it, given where you are.
 *
 * A meeting dies and two hours open up. This is the highest-intent moment
 * the app will ever get: somebody has time *and* has come to ask what to
 * spend it on, which is the opposite of a notification arriving mid-life.
 * It deserves a better answer than the day card's, because the day card is
 * describing a typical Tuesday and this is not one.
 *
 * Two rules decide everything here.
 *
 * **Where filters before what ranks.** A found hour at a desk cannot hold a
 * call home however starved family is, and ranking first would produce
 * "family is what you are neglecting — here is something you cannot do".
 * So the setting removes the impossible, and only then does priority
 * choose among what is left. When the starved domain loses that way, the
 * caller is told, rather than being handed the second-best silently.
 *
 * **A found hour is still allowed to be nothing.** The day card already
 * promises "the rest stays yours"; an app that answers every spare hour
 * with a task has broken that promise. Resting is a real answer and this
 * returns it as one, in the place a suggestion would have gone.
 */

import { fitsSetting, limitsFor, type Setting } from './setting';

/** Something that could fill the window, from any of the app's sources. */
export interface Candidate {
  key: string;
  action: string;
  minutes: number;
  domain: string;
  /** Why it is worth doing at all — the catalog's own words. */
  because?: string;
  /** What the place must allow. Absent fits anywhere. */
  needs?: Array<keyof Setting>;
  /**
   * A rhythm the week still owes, and how many are left. Nothing else
   * earns the top of this list: a commitment already made and running out
   * of week beats anything the app merely thinks is a good idea.
   */
  owedThisWeek?: number;
  /** 0..100 — how starved this domain is. The tie-break, not the ranker. */
  neglectRisk?: number;
}

export interface FoundTimeInput {
  /** How long they said they have. */
  minutes: number;
  where: Setting;
  candidates: Candidate[];
  /** How many alternates to offer beneath the first. Never many. */
  alternates?: number;
}

export interface FoundTimeResult {
  /** The one thing. Null when nothing honest fits. */
  primary: Candidate | null;
  alternates: Candidate[];
  /**
   * What the setting removed, when it removed something that would
   * otherwise have led. Null when nothing was lost to it.
   */
  ruledOut: { domain: string; limits: string[] } | null;
  /** Said when the honest answer is to spend it on nothing. */
  restNote: string | null;
}

/**
 * Nothing shorter than this is worth offering as a plan.
 *
 * Below it the answer is a tiny step, which the app already has, or rest.
 */
const MIN_USEFUL_MINUTES = 10;

/** One primary and two alternates — the same ceiling every surface uses. */
const DEFAULT_ALTERNATES = 2;

/**
 * How much of a found window a single thing may claim.
 *
 * Somebody with two hours does not want one two-hour instruction; they
 * want to start something and keep the rest. A candidate longer than the
 * window is out, but so is one that would swallow it whole when the window
 * is generous.
 */
function fitsWindow(c: Candidate, minutes: number): boolean {
  if (c.minutes > minutes) return false;
  return minutes <= 60 || c.minutes >= MIN_USEFUL_MINUTES;
}

function rank(a: Candidate, b: Candidate): number {
  /* A commitment the week still owes leads, most-owed first: this is the
     one thing on the list the reader already agreed to. */
  const owed = (c: Candidate) => c.owedThisWeek ?? 0;
  if (owed(a) !== owed(b)) return owed(b) - owed(a);
  const risk = (c: Candidate) => c.neglectRisk ?? 0;
  if (risk(a) !== risk(b)) return risk(b) - risk(a);
  /* Then the longer thing, because a found hour is the rare chance to do
     something that does not fit an ordinary evening. Key breaks ties so
     the answer never depends on input order. */
  if (a.minutes !== b.minutes) return b.minutes - a.minutes;
  return a.key.localeCompare(b.key);
}

export function foundTime(input: FoundTimeInput): FoundTimeResult {
  const minutes = Math.max(0, Math.round(input.minutes) || 0);
  const all = input.candidates ?? [];

  if (minutes < MIN_USEFUL_MINUTES) {
    return {
      primary: null,
      alternates: [],
      ruledOut: null,
      restNote: 'Too short to plan around. Whatever you do with it, it is yours.',
    };
  }

  const sized = all.filter((c) => fitsWindow(c, minutes));
  const here = sized.filter((c) => fitsSetting(c.needs, input.where));
  const ranked = [...here].sort(rank);

  /* Whether the best thing overall was lost to the place rather than to
     the ranking. Only worth saying when it beat everything that survived,
     otherwise it is an apology for a decision nobody would have noticed. */
  const bestAnywhere = [...sized].sort(rank)[0];
  const ruledOut = bestAnywhere && !fitsSetting(bestAnywhere.needs, input.where)
    && (!ranked[0] || rank(bestAnywhere, ranked[0]) < 0)
    ? { domain: bestAnywhere.domain, limits: limitsFor(bestAnywhere.needs, input.where) }
    : null;

  if (!ranked.length) {
    return {
      primary: null,
      alternates: [],
      ruledOut,
      restNote: ruledOut
        ? 'Nothing on your list fits where you are right now. That is worth knowing, not worth forcing.'
        : 'Nothing is asking for this hour. Spending it on nothing is a real answer.',
    };
  }

  return {
    primary: ranked[0],
    alternates: ranked.slice(1, 1 + (input.alternates ?? DEFAULT_ALTERNATES)),
    ruledOut,
    restNote: null,
  };
}
