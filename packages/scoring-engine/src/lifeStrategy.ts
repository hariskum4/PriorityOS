/**
 * Life-strategy time realities — the deeper reframes:
 *  - Healthspan, not lifespan (compression of morbidity; Fries 1980)
 *  - Energy, not hours (peak-cognition hours are the scarce resource)
 *  - Cost of delay per domain (health, skills, ties compound like money)
 *  - Seasons (you cannot max 8 domains at once; neglect has a threshold)
 *
 * Same invariants: planning lenses not predictions, no zeros, agency
 * always attached, no doom vocabulary.
 */

import { yearsToHorizon } from './lifeWindows';

// ---------------------------------------------------------------------------
// Healthspan — the years that actually matter
// ---------------------------------------------------------------------------

const TYPICAL_UNWELL_YEARS = 10; // the frail tail most people experience

export type LeverKey = 'strength' | 'cardio' | 'sleep' | 'social';
/**
 * Where someone actually stands on a lever.
 *
 *   held     — they set a rhythm and they are keeping it
 *   slipping — they set one and are not keeping it
 *   open     — they have not started
 *
 * The distinction is the entire point. The card used to offer all four as
 * hypotheticals to everyone forever, which meant it could not tell someone
 * doing three of them from someone doing none, and never once credited the
 * one they were actually keeping.
 */
export type LeverState = 'held' | 'slipping' | 'new' | 'open';

/**
 * How long a rhythm gets before anyone is allowed to grade it.
 *
 * Without this, agreeing to strength training twice a week and looking at the
 * card five seconds later was told the rhythm was slipping — the app calling a
 * commitment a failure before a single day of it had passed. Nothing on this
 * card is worth that.
 */
const GRACE_DAYS = 7;

/**
 * Population effects, not predictions about anybody.
 *
 * These are the compression-of-morbidity figures and they are the same for
 * every reader — which is exactly why they must never be summed into a total
 * that looks personal. What is personal is which of them someone is doing.
 */
const HEALTHSPAN_LEVERS: Array<{ key: LeverKey; label: string; yearsGained: number }> = [
  { key: 'strength', label: 'Strength training twice a week', yearsGained: 3 },
  { key: 'cardio', label: 'Zone-2 cardio, 150 min a week', yearsGained: 3 },
  { key: 'sleep', label: 'Protecting 7–8 hours of sleep', yearsGained: 2 },
  { key: 'social', label: 'Staying socially connected', yearsGained: 2 },
];

/**
 * A rhythm someone set, and what they are actually doing against it.
 * `target` and `actual` are both per week, so they are directly comparable.
 */
export interface LeverSignal {
  key: LeverKey;
  target: number;
  actual: number;
  /** What they called it, so the card can say their own words back to them. */
  label?: string;
  /** How long the rhythm has existed. Under a week it is too new to grade. */
  ageDays?: number;
}

/**
 * Which lever a habit is, from what someone called it.
 *
 * Keyword matching is crude, and it is what the data supports — a habit has a
 * title and a domain, not a category. It errs toward `null`: mislabelling
 * "call Amma" as cardio because it contains "call" would be worse than not
 * recognising a habit at all, since an unrecognised one simply leaves the
 * lever open and offers to start one.
 */
export function classifyLever(title: string): LeverKey | null {
  const t = title.toLowerCase();
  if (/\b(strength|gym|lift|weights?|resistance|push[- ]?ups?|squats?|pull[- ]?ups?)\b/.test(t)) return 'strength';
  if (/\b(walk|walking|run|running|jog|jogging|cycle|cycling|bike|swim|swimming|cardio|zone[- ]?2|steps|treadmill)\b/.test(t)) return 'cardio';
  if (/\b(sleep|bed|bedtime|lights out|wind down|screens? off)\b/.test(t)) return 'sleep';
  return null;
}

/**
 * Kept, or not. Deliberately forgiving at four-fifths of target: this app
 * grants grace on streaks, and a card that calls three walks out of four a
 * failure is not telling the truth about a life either.
 */
const KEPT_AT = 0.8;

export function leverStateOf(signal: LeverSignal | undefined): LeverState {
  if (!signal || signal.target <= 0) return 'open';
  // Already keeping it counts immediately; only the failing verdict waits.
  if (signal.actual >= signal.target * KEPT_AT) return 'held';
  if (signal.ageDays != null && signal.ageDays < GRACE_DAYS) return 'new';
  return 'slipping';
}

export interface HealthspanLever {
  key: LeverKey;
  label: string;
  yearsGained: number;
  state: LeverState;
  /** Present when they set a rhythm: what they aimed for and what they did. */
  target?: number;
  actual?: number;
  /** Their own name for it, when there is one. */
  habitLabel?: string;
}

export interface Healthspan {
  healthyYearsLeft: number;
  yearsToHorizon: number;
  /** Population years attached to levers already being kept. */
  yearsHeld: number;
  /** Attached to rhythms that were set and are being missed. */
  yearsSlipping: number;
  /** Attached to rhythms too new to have a verdict yet. */
  yearsNew: number;
  /** Attached to levers not started. */
  yearsOpen: number;
  potentialYearsGained: number;
  levers: HealthspanLever[];
  framingText: string;
}

export function healthspan(age: number, signals: LeverSignal[] = []): Healthspan {
  const horizon = yearsToHorizon(age);
  const healthy = Math.max(horizon - TYPICAL_UNWELL_YEARS, 2);
  const byKey = new Map(signals.map((s) => [s.key, s]));

  const levers: HealthspanLever[] = HEALTHSPAN_LEVERS.map((l) => {
    const signal = byKey.get(l.key);
    const state = leverStateOf(signal);
    return {
      ...l,
      state,
      ...(signal ? { target: signal.target, actual: signal.actual, habitLabel: signal.label } : {}),
    };
  });

  const sum = (state: LeverState) => levers
    .filter((l) => l.state === state)
    .reduce((s, l) => s + l.yearsGained, 0);

  return {
    healthyYearsLeft: healthy,
    yearsToHorizon: horizon,
    yearsHeld: sum('held'),
    yearsSlipping: sum('slipping'),
    yearsNew: sum('new'),
    yearsOpen: sum('open'),
    potentialYearsGained: HEALTHSPAN_LEVERS.reduce((s, l) => s + l.yearsGained, 0),
    levers,
    framingText:
      `Roughly ${healthy} years ahead on a 100-year planning horizon, minus the frail tail most ` +
      `people meet at the end. Ageing is not fixed: the rhythms below are the ones that push that ` +
      `edge out. You are not counting down a wall; you are widening a window.`,
  };
}

// ---------------------------------------------------------------------------
// Energy — the peak hours are the real budget
// ---------------------------------------------------------------------------

/**
 * The daily window of genuinely sharp focus — a population figure, the same
 * for every reader. It is named here and stated on the card rather than
 * quietly multiplied into a total that looks like a personal measurement.
 */
const PEAK_HOURS_PER_DAY = 3;

/**
 * How much of a working hour is a sharp hour. Roughly one in three — the rest
 * of a week goes to meetings, coordination, and the inbox.
 *
 * This is the only place a real per-user input touches the arithmetic, and it
 * is the whole point of the change: the card used to tell everyone the same
 * 21 hours, which told a 20-hour week and a 70-hour week exactly nothing.
 */
const SHARP_SHARE_OF_WORK = 1 / 3;

/**
 * Where the sleep sentence gets its authority.
 *
 *   kept / slipping / starting — from a sleep rhythm they actually set
 *   unknown                    — nothing here knows, and it must say so
 *
 * The card previously asserted "sleep is the multiplier, and under-rest is
 * shrinking this number" to everyone, having never once asked about sleep.
 */
export type SleepBasis = 'kept' | 'slipping' | 'starting' | 'unknown';

const SLEEP_BASIS: Record<LeverState, SleepBasis> = {
  held: 'kept',
  slipping: 'slipping',
  new: 'starting',
  open: 'unknown',
};

export interface EnergyBudget {
  peakHoursPerWeek: number;
  /** Of those, the ones the working week already has first claim on. */
  peakHoursAtWork: number;
  /** What is left over — where everything they actually chose has to fit. */
  peakHoursYours: number;
  peakHoursToHorizon: number;
  sleepBasis: SleepBasis;
  framingText: string;
  /** The sleep line, honest about what it knows. Never an unbacked claim. */
  sleepText: string;
  assumptions: string[];
}

export interface EnergyInputs {
  /** Their real working week. 0 is a real answer (not working), not a gap. */
  workHoursPerWeek?: number;
  /** How many more years they plan to work — sets the horizon count. */
  plannedWorkYearsMore?: number;
  /** Where they stand on a sleep rhythm, from the healthspan lever. */
  sleep?: LeverState;
  /** Their own words for that rhythm, so the card can say them back. */
  sleepLabel?: string;
}

export function energyBudget(inputs: EnergyInputs = {}): EnergyBudget {
  const work = Math.max(inputs.workHoursPerWeek ?? 45, 0);
  const perWeek = PEAK_HOURS_PER_DAY * 7;
  const workingWeeks = Math.max(inputs.plannedWorkYearsMore ?? 20, 1) * 48;

  // Work never gets to claim the last one: a card that reports zero sharp
  // hours has stopped being a planning lens and started being a verdict.
  const claimed = Math.round(work * SHARP_SHARE_OF_WORK);
  const atWork = Math.min(claimed, perWeek - 1);
  const yours = perWeek - atWork;

  const framingText = work === 0
    ? `About ${perWeek} sharp, high-focus hours a week, and no working week with a claim on them. ` +
      `That is rarer than it sounds — almost nobody gets to point all of it at what they chose.`
    : claimed >= perWeek
      ? `About ${perWeek} sharp, high-focus hours a week — and a ${work}-hour working week has a claim ` +
        `on effectively all of them. Roughly ${yours} is left over. Nothing you chose fits in that, ` +
        `which is the finding, not a failure: this number moves when the working week does.`
      : `About ${perWeek} sharp, high-focus hours a week — the ones where your best work lives. Your ` +
        `${work}-hour working week has first claim on roughly ${atWork} of them, which leaves about ` +
        `${yours} for everything you actually chose. That remainder is the whole game.`;

  const sleepBasis = SLEEP_BASIS[inputs.sleep ?? 'open'];
  const named = inputs.sleepLabel ? `"${inputs.sleepLabel}"` : 'your sleep rhythm';

  return {
    peakHoursPerWeek: perWeek,
    peakHoursAtWork: atWork,
    peakHoursYours: yours,
    peakHoursToHorizon: Math.round((perWeek * workingWeeks) / 100) * 100,
    sleepBasis,
    framingText,
    sleepText: {
      kept: `You are keeping ${named}. That is what holds this number where it is — sharp hours are the first thing under-rest takes.`,
      slipping: `${inputs.sleepLabel ? `${named} is` : 'Your sleep rhythm is'} slipping. Sharp hours are the first thing under-rest takes, so your real number is below this one.`,
      starting: `You have just started protecting sleep. If it holds, this is the number that grows.`,
      unknown: `This assumes you are rested. Sleep moves it more than any calendar does — and it is the one thing here that has never been asked about you.`,
    }[sleepBasis],
    assumptions: [
      `Assumes ~${PEAK_HOURS_PER_DAY} genuinely sharp hours a day — a population figure, the same for every reader, not a measurement of you`,
      ...(work > 0
        ? ['Assumes about one hour in three of a working week is a genuinely sharp one']
        : []),
    ],
  };
}

// ---------------------------------------------------------------------------
// Cost of delay — every domain compounds, not just money
// ---------------------------------------------------------------------------

export interface DelayCost {
  domainType: string;
  framingText: string;
}

const DELAY_METAPHORS: Record<string, (delay: number) => string> = {
  health: (d) => `Strength and mobility compound. Starting today versus in ${d} years is the difference between aging strong and aging fragile — the gap is largest exactly where it matters, at the end.`,
  growth: (d) => `Skills compound like interest. A skill begun now has ${d} more years to pay you back — in hours saved, doors opened, and confidence.`,
  purpose: (d) => `Creative work compounds through reps. ${d} years of small sessions is a body of work; ${d} years of "someday" is a blank page.`,
  finance: (d) => `Money compounds fastest early. The rupees you invest now do the heaviest lifting — waiting ${d} years costs far more than ${d} years of contributions.`,
  family: (d) => `Closeness compounds through shared time. ${d} years of small, regular contact builds a bond that no intense catch-up later can replace.`,
  friends: (d) => `Friendships compound on presence. ${d} years of light, steady contact keeps a friendship alive; a ${d}-year gap quietly ends most of them.`,
};

export function costOfDelay(domainType: string, delayYears = 10): DelayCost {
  const fn = DELAY_METAPHORS[domainType];
  return {
    domainType,
    framingText: fn
      ? fn(delayYears)
      : `This area compounds: the earlier you start, the more the small, steady actions add up. Waiting ${delayYears} years costs more than the effort ever would.`,
  };
}

// ---------------------------------------------------------------------------
// Seasons — you cannot max everything at once
// ---------------------------------------------------------------------------

export interface SeasonSuggestion {
  focusDomain: string;
  atRiskDomains: string[];  // over the neglect threshold — the real priority
  framingText: string;
}

const NEGLECT_THRESHOLD = 50; // below this, a domain is drifting toward regret

/**
 * A 90-day emphasis. The honest truth: not every domain can fire at once.
 * The goal is not balance every week — it is that nothing important stays
 * at zero long enough to become a regret. Pick the season by what is most
 * at risk, not by what scores highest.
 */
export function suggestSeason(
  domains: Array<{ domainType: string; importance: number; neglectRisk: number }>,
): SeasonSuggestion {
  const atRisk = domains
    .filter((d) => d.importance > 0 && d.neglectRisk >= NEGLECT_THRESHOLD)
    .sort((a, b) => b.neglectRisk - a.neglectRisk);
  const focus =
    atRisk[0]?.domainType ??
    [...domains].filter((d) => d.importance > 0).sort((a, b) => b.importance - a.importance)[0]?.domainType ??
    'family';
  return {
    focusDomain: focus,
    atRiskDomains: atRisk.map((d) => d.domainType),
    framingText: atRisk.length
      ? `You can't pour into all of it at once, and trying is why most people quit. For the next 90 days, let ${focus} be the season — it's the one closest to a regret. The rest only needs to stay above zero.`
      : `Nothing is drifting into the danger zone — a genuinely rare, aligned place to be. Pick a season to deepen rather than rescue: ${focus} would compound nicely.`,
  };
}
