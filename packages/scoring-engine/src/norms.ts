/**
 * Every number this app asserts about people in general, in one place, with
 * where it came from.
 *
 * The rule from RESEARCH_NOTES §4 is that a figure moves with the reader or it
 * is labelled as not being about them. The labelling half was done card by
 * card, which worked — the sentences are there — but left the constants
 * themselves scattered across four modules with their provenance living only
 * in whichever comment happened to be nearest. Nobody could answer "what does
 * this app claim about the average person, and on what basis" without reading
 * the engine, and a figure whose source cannot be produced on demand is a
 * figure nobody can check.
 *
 * So: the value, the unit, what it is for, and the source, together. Each
 * entry also carries `personal`, which is the §4 distinction made explicit —
 * whether the number moves with the reader's own answers or is the same for
 * everybody. `normNote` writes the disclaimer from that flag rather than
 * leaving each surface to remember to add one.
 *
 * `grade` mirrors `evidence.ts`: how good the underlying basis actually is.
 * Several of these are conventions rather than findings, and saying so here is
 * the point — a planning horizon of 100 is a design decision, not a discovery,
 * and the table should not flatter it into looking like one.
 */

/** How well-founded the number is. Same ladder the receipts use. */
export type NormGrade =
  /** Meta-analysis, systematic review, or national statistics. */
  | 'strong'
  /** Consistent cohort or survey evidence, contested at the edges. */
  | 'moderate'
  /** A widely used working figure with real support but wide spread. */
  | 'rule-of-thumb'
  /** A choice this product made. Defensible, but not a finding. */
  | 'convention';

export interface Norm {
  key: string;
  value: number;
  unit: string;
  /** What it is, in the app's own voice. */
  label: string;
  /** Where it comes from. Named specifically enough to be checked. */
  source: string;
  grade: NormGrade;
  /**
   * False when the figure is the same for every reader.
   *
   * The whole of §4 turns on this. A population constant is honest when it is
   * announced as one and dishonest the moment it is printed as a measurement,
   * and the difference is one sentence that surfaces kept forgetting.
   */
  personal: false;
  /** Anything a reader would need to not over-read it. */
  caveat?: string;
}

export const NORMS: Record<string, Norm> = {
  planningHorizonAge: {
    key: 'planningHorizonAge',
    value: 100,
    unit: 'years of age',
    label: 'The age the Time tab plans to',
    source:
      'A product choice, not a life-expectancy estimate. Deliberately past any '
      + 'national figure so the lens never reads as a countdown, and it extends '
      + 'further as a reader approaches it.',
    grade: 'convention',
    personal: false,
    caveat: 'Nobody is ever shown fewer than 15 years ahead.',
  },
  sleepHoursPerNight: {
    key: 'sleepHoursPerNight',
    value: 7.5,
    unit: 'hours a night',
    label: 'Sleep assumed when working out a free week',
    source:
      'Midpoint of the 7–9h adult range in the US National Sleep Foundation '
      + 'consensus recommendations (Hirshkowitz et al., Sleep Health, 2015).',
    grade: 'strong',
    personal: false,
    caveat: 'Nobody is asked what they actually sleep, so this is an assumption '
      + 'in the arithmetic rather than a reading of the reader.',
  },
  lifeOverheadHoursPerWeek: {
    key: 'lifeOverheadHoursPerWeek',
    value: 24,
    unit: 'hours a week',
    label: 'Commute, chores, errands and admin — the invisible tax on a week',
    source:
      'Order-of-magnitude figure consistent with national time-use surveys '
      + '(US ATUS; UK ONS Time Use Survey) for household activities, care and '
      + 'travel combined.',
    grade: 'rule-of-thumb',
    personal: false,
    caveat: 'Varies enormously with household size and country; this is a '
      + 'single figure standing in for a wide distribution.',
  },
  careWorkOverheadHoursPerWeek: {
    key: 'careWorkOverheadHoursPerWeek',
    value: 8,
    unit: 'hours a week',
    label: 'Personal admin left over when the stated work hours are the household',
    source:
      'The same time-use basis as the figure above, with household labour '
      + 'removed because it has already been counted as the working week.',
    grade: 'rule-of-thumb',
    personal: false,
  },
  peakHoursPerDay: {
    key: 'peakHoursPerDay',
    value: 3,
    unit: 'hours a day',
    label: 'Genuinely sharp focus available in a day',
    source:
      'Converges across the deliberate-practice literature (Ericsson et al., '
      + 'Psychological Review, 1993) and later replications: sustainable '
      + 'high-concentration work tops out at roughly 3–4 hours daily.',
    grade: 'moderate',
    personal: false,
    caveat: 'Measured in expert practice, not office work. The direction is '
      + 'well supported; the exact number is not a personal measurement.',
  },
  typicalUnwellYears: {
    key: 'typicalUnwellYears',
    value: 10,
    unit: 'years',
    label: 'The frail tail at the end of a typical life',
    source:
      'Gap between life expectancy and healthy life expectancy (HALE) in the '
      + 'WHO Global Health Estimates — around a decade in most countries.',
    grade: 'strong',
    personal: false,
    caveat: 'A population gap. Individuals routinely beat it, and the app says '
      + 'so wherever it appears.',
  },
  defaultLifeExpectancy: {
    key: 'defaultLifeExpectancy',
    value: 75,
    unit: 'years',
    label: 'Life expectancy used when no country is known',
    source:
      'Approximate global life expectancy at birth, WHO Global Health '
      + 'Observatory. Replaced by the country figure as soon as one is given.',
    grade: 'strong',
    personal: false,
  },
  workingWeeksPerYear: {
    key: 'workingWeeksPerYear',
    value: 48,
    unit: 'weeks a year',
    label: 'Working weeks in a year, after leave',
    source: 'A conventional planning figure: 52 weeks less about four of leave.',
    grade: 'convention',
    personal: false,
  },
  annualReturnPct: {
    key: 'annualReturnPct',
    value: 12,
    unit: '% a year, nominal',
    label: 'Assumed long-run return in the compounding calculator',
    source:
      'A long-run nominal equity assumption in line with historical Indian '
      + 'equity index returns. Not a forecast, and not advice.',
    grade: 'rule-of-thumb',
    personal: false,
    caveat:
      'Nominal and before tax; inflation is not modelled. The calculator '
      + 'compares timing, never products, and the figure is adjustable.',
  },
};

/**
 * The sentence that keeps a population figure from reading as a measurement.
 *
 * Generated rather than hand-written at each call site, because hand-written
 * is what produced a card asserting 21 sharp hours a week to every reader
 * alive and a healthspan tile summing four population figures into a personal
 * total.
 */
export function normNote(key: string): string | null {
  const n = NORMS[key];
  if (!n) return null;
  const base = n.grade === 'convention'
    ? `${n.label}: ~${n.value} ${n.unit} — a planning choice this app made, the same for every reader`
    : `${n.label}: ~${n.value} ${n.unit} — a population figure, the same for every reader, not a measurement of you`;
  return n.caveat ? `${base}. ${n.caveat}` : `${base}.`;
}

/** Every norm, for an audit screen or a docs page. Stable order. */
export function allNorms(): Norm[] {
  return Object.values(NORMS).sort((a, b) => a.key.localeCompare(b.key));
}

/** The norms whose basis is weakest — the list worth revisiting first. */
export function softestNorms(): Norm[] {
  const rank: Record<NormGrade, number> = {
    convention: 0, 'rule-of-thumb': 1, moderate: 2, strong: 3,
  };
  return allNorms().filter((n) => rank[n.grade] <= 1);
}
