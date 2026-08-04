/**
 * Micro-reveals — every answer buys the person a fact about themselves.
 *
 * Onboarding used to spend seven screens taking and one screen giving: all
 * of the arithmetic waited for the Life Reveal at the end. But the numbers
 * are deterministic and instant — nothing about a free-hours budget needs
 * to wait for a server round-trip, let alone a model. So each of these
 * returns the one honest fact an answer just made computable, worded for
 * the life that answered it, to be shown the moment the answer lands.
 *
 * Same invariants as everything else in the engine: no reference to
 * lifespan or death, agency framing, no guilt, and one number at a time —
 * a micro-reveal that needs a paragraph is a lecture, not a reveal.
 */

import { freeTimeBudget } from './lifeWindows';
import { lifeShape } from './lifeShape';
import { deriveGoalTitle } from './goalTitle';

export interface MicroReveal {
  /** A number worth landing big, when the fact has one. */
  stat?: { value: number; unit: string };
  /** The person's own words, mirrored back, when the fact is theirs. */
  quote?: string;
  line: string;
}

// ---------------------------------------------------------------------------
// Step 1 — the week they just described, handed straight back
// ---------------------------------------------------------------------------

export interface WeekEchoInput {
  workHoursPerWeek?: number | null;
  workType?: string | null;
}

/**
 * The free-hours number, the moment the week that produces it is known.
 * Null until both parts of the answer exist — an echo of half an answer
 * would be the app guessing, which is the thing it promises not to do.
 */
export function weekEcho(input: WeekEchoInput): MicroReveal | null {
  const { workHoursPerWeek: hours, workType } = input;
  if (!workType || hours == null) return null;
  const budget = freeTimeBudget(hours, workType);
  const shape = lifeShape(workType);
  const kind = (workType ?? '').toLowerCase();

  const line = shape.careWorkIsWork
    ? `Left each week after sleep and the ${hours} hours the household takes — the life part of your life.`
    : kind === 'student'
      ? 'Left each week after class, study and sleep — the raw material for everything you are about to build.'
      : hours === 0 && shape.selfDirectedWork
        ? 'No employer on the clock — the widest weekly budget Priority ever gets to plan with.'
        : `Left after sleep, ${hours} working hours and life's overhead — the number almost nobody knows about their own week.`;

  return {
    stat: { value: budget.freeHoursPerWeek, unit: 'hours a week are actually yours' },
    line,
  };
}

// ---------------------------------------------------------------------------
// Step 4 — the admission, received rather than recorded
// ---------------------------------------------------------------------------

export interface DriftEchoInput {
  ranking: string[];
  /** Drifting domains, worst gap first — from `driftFromReality`. */
  neglected: string[];
  /** The 1–5 scores, so the echo can cite the number they just gave. */
  reality?: Record<string, number>;
  /** Display name for a domain key; keys are shown raw without it. */
  labelOf?: (domain: string) => string;
}

/**
 * Ranking something first and then scoring it 2/5 is the entire diagnosis
 * this product exists for — it should not pass in silence. The quieter
 * case still gets a receipt: the person has just admitted something, and
 * is owed the assurance that something happens next.
 */
export function driftEcho(input: DriftEchoInput): MicroReveal | null {
  const { ranking, neglected } = input;
  if (neglected.length === 0) return null;
  const labelOf = input.labelOf ?? ((d: string) => d);

  const top = neglected
    .map((d) => ({ d, idx: ranking.indexOf(d) }))
    .filter((x) => x.idx >= 0)
    .sort((a, b) => a.idx - b.idx)[0];
  const score = top ? input.reality?.[top.d] : undefined;

  if (top && top.idx <= 2) {
    return {
      line: score
        ? `You ranked ${labelOf(top.d)} #${top.idx + 1} and scored it ${score}/5. ` +
          `That gap — said against lived — is exactly what Priority works on.`
        : `${labelOf(top.d)} is #${top.idx + 1} for you and among the least lived. ` +
          `That gap — said against lived — is exactly what Priority works on.`,
    };
  }
  return {
    line:
      'Nothing here stays invisible from now on — each one gets a first small step, ' +
      'not a lecture.',
  };
}

// ---------------------------------------------------------------------------
// Step 5 — the someday, already wearing its goal name
// ---------------------------------------------------------------------------

/**
 * Mirrors the postponed thing back under the short name it is about to
 * carry as a goal — the same derivation the API will run, so the echo and
 * the eventual goal card always agree on what it is called.
 */
export function somedayEcho(postponing: string): MicroReveal | null {
  if (!postponing.trim()) return null;
  return {
    quote: deriveGoalTitle(postponing).title,
    line:
      'Written down, it stops being a someday. In a minute it becomes your first real goal — ' +
      'with a fifteen-minute first step this week.',
  };
}

// ---------------------------------------------------------------------------
// The Reveal — a receipt for the minutes just spent, and one dated promise
// ---------------------------------------------------------------------------

export interface RevealLedger {
  intro: string;
  /** One line per fact the answers actually produced — nothing padded. */
  lines: string[];
  /** The checkable reason to come back, pointed at the Sunday Session. */
  promise: string;
}

export interface RevealLedgerInput {
  freeHoursPerWeek?: number | null;
  ranking?: string[];
  neglectedCount?: number;
  personName?: string | null;
  goalTitle?: string | null;
  feeling?: string | null;
  labelOf?: (domain: string) => string;
}

const COUNT_WORDS = ['One', 'Two', 'Three', 'Four'];

export function revealLedger(input: RevealLedgerInput): RevealLedger | null {
  const labelOf = input.labelOf ?? ((d: string) => d);
  const lines: string[] = [];

  if (input.freeHoursPerWeek != null) {
    lines.push(`Your real week — ~${input.freeHoursPerWeek} hours that are actually yours.`);
  }
  if (input.ranking && input.ranking.length > 0) {
    lines.push(`What matters, in your order — ${labelOf(input.ranking[0])} first.`);
  }
  if (input.neglectedCount) {
    const word = COUNT_WORDS[input.neglectedCount - 1] ?? String(input.neglectedCount);
    lines.push(
      input.neglectedCount === 1
        ? 'One drifting area, named out loud.'
        : `${word} drifting areas, named out loud.`,
    );
  }
  if (input.personName) {
    lines.push(`${input.personName}'s time with you, made countable.`);
  }
  if (input.goalTitle) {
    lines.push(`“${input.goalTitle}” — a someday with a start date.`);
  }
  if (input.feeling) {
    lines.push(`A definition of a good week: “${input.feeling}”.`);
  }

  if (lines.length === 0) return null;
  return {
    intro: 'A few minutes of honest answers. What they bought:',
    lines,
    promise:
      'One real week from now, the Sunday Session shows you where the hours actually went — ' +
      'this stops being what you said, and becomes what you did.',
  };
}
