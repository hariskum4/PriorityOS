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
/** Each sustained behavior compresses morbidity — pushes the healthy edge out. */
const HEALTHSPAN_LEVERS: Array<{ key: string; label: string; yearsGained: number }> = [
  { key: 'strength', label: 'Strength training twice a week', yearsGained: 3 },
  { key: 'cardio', label: 'Zone-2 cardio, 150 min a week', yearsGained: 3 },
  { key: 'sleep', label: 'Protecting 7–8 hours of sleep', yearsGained: 2 },
  { key: 'social', label: 'Staying socially connected', yearsGained: 2 },
];

export interface Healthspan {
  healthyYearsLeft: number;
  yearsToHorizon: number;
  potentialYearsGained: number;
  levers: Array<{ label: string; yearsGained: number }>;
  framingText: string;
}

export function healthspan(age: number): Healthspan {
  const horizon = yearsToHorizon(age);
  const healthy = Math.max(horizon - TYPICAL_UNWELL_YEARS, 2);
  const potential = HEALTHSPAN_LEVERS.reduce((s, l) => s + l.yearsGained, 0);
  return {
    healthyYearsLeft: healthy,
    yearsToHorizon: horizon,
    potentialYearsGained: potential,
    levers: HEALTHSPAN_LEVERS.map(({ label, yearsGained }) => ({ label, yearsGained })),
    framingText:
      `Roughly ${healthy} fully able years ahead — the ones where you can hike, lift, and keep up. ` +
      `Ageing is not fixed: the habits below can push that edge out by years. You are not counting down a wall; you are widening a window.`,
  };
}

// ---------------------------------------------------------------------------
// Energy — the peak hours are the real budget
// ---------------------------------------------------------------------------

const PEAK_HOURS_PER_DAY = 3; // broadly, the daily window of sharp focus

export interface EnergyBudget {
  peakHoursPerWeek: number;
  peakHoursToHorizon: number;
  framingText: string;
  assumptions: string[];
}

export function energyBudget(age: number, plannedWorkYearsMore = 20): EnergyBudget {
  const perWeek = PEAK_HOURS_PER_DAY * 7;
  const workingWeeks = Math.max(plannedWorkYearsMore, 1) * 48;
  return {
    peakHoursPerWeek: perWeek,
    peakHoursToHorizon: Math.round((perWeek * workingWeeks) / 100) * 100,
    framingText:
      `About ${perWeek} sharp, high-focus hours a week — the ones where your best work lives. ` +
      `Most of them get spent on the inbox and other people's urgencies. The single highest-leverage ` +
      `move in your whole week is pointing those hours at what you actually chose.`,
    assumptions: [
      `Assumes ~${PEAK_HOURS_PER_DAY} genuinely sharp hours a day — protected by sleep, spent before noon for most people`,
      'Sleep is the multiplier: under-rest quietly shrinks this number more than any calendar does',
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
