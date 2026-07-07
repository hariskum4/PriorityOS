/**
 * Time-window estimators beyond relationship visits — each one earned its
 * place from documented public reactions, not vibes:
 *
 *  - Tail End share: Tim Urban's "The Tail End" went viral on the insight
 *    that leaving home means ~93% of in-person parent time is already used.
 *    Readers report the % framing (not the death framing) is what moved
 *    them to act. We compute it honestly and frame what REMAINS.
 *  - Childhood windows: the "18 summers" meme demonstrably guilt-trips
 *    working parents (documented backlash). We count ordinary units
 *    instead — weekends and dinners — and always attach the corrective:
 *    parenting does not end at 18.
 *  - Creative compounding: "30 minutes a day is a book in a year" reframes
 *    a dream from impossible to arithmetic. Ambiguity aversion research:
 *    specificity unlocks action.
 *  - Cost of waiting: compounding is the one finite window where delay has
 *    an exact price. Shown as money gained by starting now, never as money
 *    "lost" by having waited (no retroactive guilt).
 *
 * Same safety invariants as timeReality.ts: no zeros, no death language,
 * agency counterpart always, assumptions always.
 */

import { softRound } from './timeReality';

// ---------------------------------------------------------------------------
// 1. Tail End share — % of in-person time together that is still ahead
// ---------------------------------------------------------------------------

export interface TailEndInput {
  /** Days/year together during the years you lived in the same home. */
  childhoodDaysPerYear?: number; // default 330 (Urban's ~90% of days)
  yearsLivedTogether: number;    // e.g. 18
  currentDaysPerYear: number;    // e.g. 10 (visits × days per visit)
  /** Remaining planning-horizon years (from estimateTimeReality). */
  remainingYears: number;
}

export interface TailEndResult {
  percentAhead: number;       // % of lifetime together that is still to come
  daysAhead: number;
  daysAheadIfDoubled: number; // agency counterpart
  framingText: string;
  assumptions: string[];
}

export function estimateTailEnd(input: TailEndInput): TailEndResult {
  const childhoodDays =
    (input.childhoodDaysPerYear ?? 330) * Math.max(input.yearsLivedTogether, 1);
  const daysAhead = Math.max(
    Math.round(input.currentDaysPerYear * input.remainingYears),
    1,
  );
  const percentAhead = Math.max(
    Math.round((daysAhead / (childhoodDays + daysAhead)) * 100),
    1,
  );
  const daysAheadIfDoubled = daysAhead * 2;
  return {
    percentAhead,
    daysAhead: softRound(daysAhead),
    daysAheadIfDoubled: softRound(daysAheadIfDoubled),
    framingText:
      `About ${percentAhead}% of your total in-person time together is still ahead of you — ` +
      `roughly ${softRound(daysAhead)} days. Doubling your visits doubles that number. ` +
      `It is the one percentage here you control.`,
    assumptions: [
      'Childhood years assume near-daily time together, like most people who grew up in one home',
      'Future days use your current visit pace — the number moves the moment the pace does',
      'A planning horizon is used, not a prediction about anyone',
    ],
  };
}

// ---------------------------------------------------------------------------
// 2. Childhood windows — ordinary units, guilt-corrected
// ---------------------------------------------------------------------------

export interface ChildhoodWindowsInput {
  childAge: number;
  /** Realistic free weekends/year (work, activities). Default 40. */
  weekendsPerYear?: number;
  /** Shared dinners/week at current rhythm. Default 5. */
  dinnersPerWeek?: number;
}

export interface ChildhoodWindowsResult {
  yearsOfConcentratedTime: number;
  weekendsAhead: number;
  dinnersAhead: number;
  framingText: string;
  assumptions: string[];
}

export function estimateChildhoodWindows(
  input: ChildhoodWindowsInput,
): ChildhoodWindowsResult {
  const years = Math.max(18 - input.childAge, 1);
  const weekends = Math.max(
    softRound((input.weekendsPerYear ?? 40) * years),
    1,
  );
  const dinners = Math.max(
    softRound((input.dinnersPerWeek ?? 5) * 52 * years),
    1,
  );
  return {
    yearsOfConcentratedTime: years,
    weekendsAhead: weekends,
    dinnersAhead: dinners,
    framingText:
      `Around ${weekends} free weekends and ~${dinners} shared dinners before they turn 18. ` +
      `Ordinary days are where childhood actually happens — and parenting does not end at 18; ` +
      `this just counts the concentrated years.`,
    assumptions: [
      'Counts realistic free weekends, not every calendar weekend',
      'Dinner count uses your current family rhythm and moves with it',
      'The relationship continues past 18 — these are the highest-density years, not a deadline',
    ],
  };
}

// ---------------------------------------------------------------------------
// 3. Creative compounding — 30 minutes a day, made concrete
// ---------------------------------------------------------------------------

export interface CreativeCompoundingResult {
  hoursPerYear: number;
  milestone: string;
  framingText: string;
}

const CREATIVE_MILESTONES: Array<{ minHours: number; label: string }> = [
  { minHours: 300, label: 'a serious skill built from scratch' },
  { minHours: 180, label: 'a full first draft of a book' },
  { minHours: 120, label: 'conversational basics of a new language' },
  { minHours: 60, label: 'a finished creative project' },
  { minHours: 1, label: 'a real body of practice' },
];

export function estimateCreativeCompounding(
  minutesPerDay: number,
  daysPerWeek = 5,
): CreativeCompoundingResult {
  const hoursPerYear = Math.max(
    Math.round((minutesPerDay / 60) * daysPerWeek * 52),
    1,
  );
  const milestone =
    CREATIVE_MILESTONES.find((m) => hoursPerYear >= m.minHours)?.label ??
    CREATIVE_MILESTONES[CREATIVE_MILESTONES.length - 1].label;
  return {
    hoursPerYear,
    milestone,
    framingText:
      `${minutesPerDay} minutes, ${daysPerWeek} days a week is ~${hoursPerYear} hours a year — ` +
      `enough for ${milestone}. Not someday. Arithmetic.`,
  };
}

// ---------------------------------------------------------------------------
// 4. Cost of waiting — compounding, framed as gain for starting now
// ---------------------------------------------------------------------------

export interface CompoundingInput {
  monthlyAmount: number;
  currentAge: number;
  targetAge?: number;      // default 60
  annualReturnPct?: number; // default 12 (long-run equity assumption, stated)
  delayYears?: number;      // default 5
}

export interface CompoundingResult {
  corpusStartingNow: number;
  corpusIfDelayed: number;
  gainFromStartingNow: number;
  framingText: string;
  assumptions: string[];
}

function futureValueOfSip(monthly: number, years: number, annualPct: number): number {
  const i = annualPct / 100 / 12;
  const n = Math.max(Math.round(years * 12), 0);
  if (n === 0) return 0;
  if (i === 0) return monthly * n;
  return monthly * ((Math.pow(1 + i, n) - 1) / i) * (1 + i);
}

export function estimateCostOfWaiting(input: CompoundingInput): CompoundingResult {
  const targetAge = input.targetAge ?? 60;
  const rate = input.annualReturnPct ?? 12;
  const delay = input.delayYears ?? 5;
  const years = Math.max(targetAge - input.currentAge, 1);
  const now = Math.round(futureValueOfSip(input.monthlyAmount, years, rate));
  const delayed = Math.round(
    futureValueOfSip(input.monthlyAmount, Math.max(years - delay, 0), rate),
  );
  const gain = Math.max(now - delayed, 0);
  return {
    corpusStartingNow: now,
    corpusIfDelayed: delayed,
    gainFromStartingNow: gain,
    framingText:
      `Starting this month instead of in ${delay} years adds ~${gain.toLocaleString()} ` +
      `to what compounds by ${targetAge}. The window is not closed — it is open right now.`,
    assumptions: [
      `Assumes ~${rate}% average annual return — a long-run equity assumption, not a promise`,
      'Assumes the monthly amount stays constant; increases compound further',
      'Inflation and taxes are not modeled — this compares timing, not products',
    ],
  };
}
