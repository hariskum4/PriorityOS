/**
 * Whether what someone just told us about a person holds together.
 *
 * The relationship step asks seven questions and accepted any combination of
 * the answers, including ones that cannot be true and ones that quietly turn
 * the app off. Two failures worth naming, because they look different and are
 * the same shape:
 *
 *   **Age was optional.** It is the input three of the app's sharpest readings
 *   depend on — visits remaining, the childhood window, and whether a
 *   relationship sits in a closing one. Skip it and the person gets a people
 *   tab that counts nothing, with no indication of why. An optional field that
 *   silently disables the feature is not optional, it is undiscovered.
 *
 *   **You could ask for less than you already do.** Talk daily, wish for
 *   monthly, and every downstream engine reads the relationship as comfortably
 *   ahead — so it never appears again. That is a correct calculation and a
 *   surprising outcome, and the moment to say so is while the person is
 *   looking at the answer, not six weeks later when they wonder why their
 *   mother never comes up.
 *
 * Everything here is a pure function over the answers so the combinations can
 * be enumerated in tests rather than discovered in a form. Two levels:
 *
 *   `block` — arithmetic that cannot be true, and the step should not pass.
 *   `note`  — true, allowed, and worth saying out loud before it surprises.
 *   `good`  — what the app can now do that it could not a moment ago.
 *
 * Tone rule, same as everywhere: none of these may read as judgement about a
 * relationship. "A parent younger than you" is a data error. "You do not call
 * your mother enough" is not this file's business, and never will be.
 */

export type SanityLevel = 'block' | 'note' | 'good';

export type SanityField =
  | 'age' | 'relationType' | 'locationType'
  | 'callFrequency' | 'desiredCallFrequency' | 'inPersonFrequency';

export interface SanityFinding {
  /** Stable id, for tests and for keying a message in the UI. */
  key: string;
  field: SanityField;
  level: SanityLevel;
  /** Shown verbatim. */
  message: string;
}

export interface SanityInput {
  name?: string | null;
  relationType?: string | null;
  /** Their age, as typed. A string because that is what a text field holds. */
  age?: number | string | null;
  /** The account holder's own age, when known — some checks need both. */
  userAge?: number | null;
  locationType?: string | null;
  callFrequency?: string | null;
  desiredCallFrequency?: string | null;
  inPersonFrequency?: string | null;
}

/** Days each cadence stands for. Mirrors the People tab's map. */
const CADENCE_DAYS: Record<string, number> = {
  daily: 1, weekly: 7, biweekly: 14, monthly: 30, quarterly: 90, yearly: 365,
};

/** Nobody in a relationship record is older than this. */
const MAX_AGE = 119;

/** The narrowest a generation can honestly be. */
const GENERATION_YEARS = 12;

const PARENTS = new Set(['mother', 'father', 'parent']);
const CHILDREN = new Set(['child', 'children', 'son', 'daughter']);

/** The age below which the childhood-window arithmetic runs at all. */
const CHILDHOOD_ENDS = 18;

function cadenceDays(v: unknown): number | null {
  const key = String(v ?? '').toLowerCase();
  return CADENCE_DAYS[key] ?? null;
}

/** A typed age, or null when there is not a usable number in it. */
export function parseAge(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  const floored = Math.floor(n);
  return floored >= 0 && floored <= MAX_AGE ? floored : null;
}

/**
 * Sensible starting answers for a kind of relationship.
 *
 * Not a claim about anyone — every one of these is one tap from being changed,
 * and none of them is a *fact* about the person being described. Only the
 * shape of the questions: partners and children are usually in the same house
 * and spoken to daily; a parent in another city usually is not. Seven pickers
 * that all start on the same default is a form. Seven that start somewhere
 * plausible is a confirmation.
 *
 * Age is deliberately absent. Guessing at somebody's age would be inventing a
 * fact about a real person, which is the one thing this app must never do.
 */
export function defaultsForRelation(relationType: string): {
  locationType: string;
  callFrequency: string;
  desiredCallFrequency: string;
  inPersonFrequency: string;
} {
  const t = String(relationType ?? '').toLowerCase();
  if (t === 'partner' || t === 'spouse') {
    return {
      locationType: 'same_home', callFrequency: 'daily',
      desiredCallFrequency: 'daily', inPersonFrequency: 'daily',
    };
  }
  if (CHILDREN.has(t)) {
    return {
      locationType: 'same_home', callFrequency: 'daily',
      desiredCallFrequency: 'daily', inPersonFrequency: 'daily',
    };
  }
  if (PARENTS.has(t)) {
    return {
      locationType: 'different_city', callFrequency: 'monthly',
      desiredCallFrequency: 'weekly', inPersonFrequency: 'quarterly',
    };
  }
  if (t === 'sibling') {
    return {
      locationType: 'different_city', callFrequency: 'monthly',
      desiredCallFrequency: 'monthly', inPersonFrequency: 'quarterly',
    };
  }
  return {
    locationType: 'same_city', callFrequency: 'monthly',
    desiredCallFrequency: 'monthly', inPersonFrequency: 'monthly',
  };
}

/**
 * Whether "how often do you talk" is a question worth asking at all.
 *
 * For somebody in the same house it is not — the answer is "constantly", it
 * carries no information, and asking it is three taps of nothing. The People
 * tab reads visits for these relationships anyway.
 */
export function asksAboutCalls(locationType: string | null | undefined): boolean {
  return String(locationType ?? '').toLowerCase() !== 'same_home';
}

export function relationshipSanity(input: SanityInput): SanityFinding[] {
  const out: SanityFinding[] = [];
  const rel = String(input.relationType ?? '').toLowerCase();
  const them = (input.name ?? '').trim() || 'them';
  const age = parseAge(input.age);
  const raw = input.age;

  // ---- age, which is not optional -----------------------------------------
  if (raw == null || String(raw).trim() === '') {
    out.push({
      key: 'age.missing',
      field: 'age',
      level: 'block',
      message: 'Their age, roughly — it is what the visits-remaining arithmetic is built on, and Priority cannot do it without one.',
    });
  } else if (age === null) {
    out.push({
      key: 'age.unusable',
      field: 'age',
      level: 'block',
      message: `That is not an age Priority can work with. A number between 0 and ${MAX_AGE}.`,
    });
  }

  /* Generations, checked in the only direction that can be wrong. Someone's
     mother cannot be younger than they are; their child cannot be older. Both
     are typos rather than confessions, so they are stated as arithmetic. */
  if (age != null && input.userAge != null && Number.isFinite(input.userAge)) {
    const mine = Math.floor(input.userAge);
    if (PARENTS.has(rel) && age < mine + GENERATION_YEARS) {
      out.push({
        key: 'age.parent-too-young',
        field: 'age',
        level: 'block',
        message: `You gave your own age as ${mine}, so a parent of ${age} is a typo somewhere.`,
      });
    }
    if (CHILDREN.has(rel) && age > mine - GENERATION_YEARS) {
      out.push({
        key: 'age.child-too-old',
        field: 'age',
        level: 'block',
        message: `You gave your own age as ${mine}, so a child of ${age} is a typo somewhere.`,
      });
    }
  }

  // ---- cadence, which can quietly switch the app off ----------------------
  const actual = cadenceDays(input.callFrequency);
  const wanted = cadenceDays(input.desiredCallFrequency);

  if (actual != null && wanted != null && actual < wanted) {
    out.push({
      key: 'cadence.already-ahead',
      field: 'desiredCallFrequency',
      level: 'note',
      message: `You already talk more often than that, so Priority will leave ${them} alone. Ask for more only if you want more.`,
    });
  } else if (actual != null && wanted != null && actual === wanted) {
    out.push({
      key: 'cadence.exactly-met',
      field: 'desiredCallFrequency',
      level: 'note',
      message: `That is exactly what you already do — nothing here will change unless it slips.`,
    });
  }

  const visits = cadenceDays(input.inPersonFrequency);
  const where = String(input.locationType ?? '').toLowerCase();

  if (where === 'abroad' && visits != null && visits <= 7) {
    out.push({
      key: 'location.abroad-but-seen',
      field: 'inPersonFrequency',
      level: 'note',
      message: 'Seeing someone abroad that often is unusual — worth a second look before it goes into the arithmetic.',
    });
  }

  if (where === 'same_home' && visits != null && visits > 7) {
    out.push({
      key: 'location.home-but-unseen',
      field: 'inPersonFrequency',
      level: 'note',
      message: 'You said the same home but see them less than weekly. Both can be true; Priority will read the visits as written.',
    });
  }

  // ---- what this now makes possible ---------------------------------------
  if (age != null) {
    if (CHILDREN.has(rel)) {
      out.push(age < CHILDHOOD_ENDS
        ? {
          key: 'good.childhood',
          field: 'age',
          level: 'good',
          message: `Priority can count the years of childhood left with ${them} — there are ${CHILDHOOD_ENDS - age}.`,
        }
        : {
          key: 'note.childhood-closed',
          field: 'age',
          level: 'note',
          message: `The childhood-window arithmetic only runs under ${CHILDHOOD_ENDS}. Everything else still counts ${them}.`,
        });
    } else if (PARENTS.has(rel)) {
      out.push({
        key: 'good.visits',
        field: 'age',
        level: 'good',
        message: `Priority can now count the visits you have left with ${them}, at the pace you just described.`,
      });
    } else {
      out.push({
        key: 'good.counted',
        field: 'age',
        level: 'good',
        message: `Priority can now put a real number on the time you have left with ${them}.`,
      });
    }
  }

  /**
   * Nothing is promised while something is wrong.
   *
   * Caught in a browser: a mother of 30 given by a user of 34 showed the typo
   * in red and, directly underneath, "Priority can now count the visits you
   * have left with Mummy". Both were computed correctly and read as one
   * incoherent thought — the age parses, so the promise fired, while the
   * arithmetic it promises would have been built on a number the app had just
   * finished calling a typo.
   */
  if (out.some((f) => f.level === 'block')) {
    return out.filter((f) => f.level !== 'good');
  }

  return out;
}

/** Whether the answers are complete enough to move on. */
export function relationshipBlocked(findings: SanityFinding[]): boolean {
  return findings.some((f) => f.level === 'block');
}
