/**
 * Time Reality engine — the heart of Priority.
 *
 * Implements the full calculation from the product blueprint (§9.1):
 * regional life expectancy, quality-years cutoff, health modifier,
 * location capacity, work constraint, and dual trajectories (current
 * pace vs. what small changes make possible).
 *
 * Psychological safety invariants (reviewed with a clinician's lens —
 * mortality-salience research shows finite-time framing helps only when
 * paired with agency and never with fear):
 *  1. NEVER outputs zero or negative remaining anything.
 *  2. NEVER mentions death, dying, lifespan, or "time running out" in copy.
 *  3. Every result carries an improved trajectory — the agency counterpart.
 *  4. Every result carries explicit assumptions — estimates, not verdicts.
 *  5. Numbers are rounded and "~"-prefixed: soft precision, because false
 *     precision reads as a countdown clock.
 *  6. Serious-health situations get the gentlest framing tier and no
 *     urgency pressure — pressure on top of grief is harm, not help.
 */

export type HealthStatus = 'good' | 'declining' | 'serious';
export type LocationType = 'same_city' | 'different_city' | 'abroad';

export interface TimeRealityInput {
  personAge: number;
  personLabel: string;
  /** Default 'good' — absence of information must not darken the estimate. */
  personHealthStatus?: HealthStatus;
  personLocationType?: LocationType;
  userWorkHoursPerWeek?: number;
  /** Visits (or meaningful in-person moments) per year at current pace. */
  currentVisitsPerYear: number;
  /** What the user says they want; capped by realistic capacity. */
  desiredVisitsPerYear?: number;
  /** ISO country code or name; drives life expectancy. */
  region?: string;
}

export interface TimeRealityResult {
  yearsRemaining: number;
  qualityYears: number;
  /** Meaningful visits at the current pace. Floored at 1. */
  currentTrajectory: number;
  /** Visits if the user moves to their desired (capacity-capped) pace. */
  improvedTrajectory: number;
  additionalPossible: number;
  /** Realistic ceiling given location + work constraints. */
  maxPossible: number;
  /** Display-safe string, e.g. "~95". */
  display: string;
  framingText: string;
  urgencyLevel: 'low' | 'medium' | 'high';
  assumptions: string[];
}

const LIFE_EXPECTANCY: Record<string, number> = {
  IN: 70, INDIA: 70,
  US: 79, USA: 79, 'UNITED STATES': 79,
  UK: 81, GB: 81, 'UNITED KINGDOM': 81,
  AU: 83, AUSTRALIA: 83,
};
const DEFAULT_LIFE_EXPECTANCY = 75;

/** Beyond statistical expectancy, conditional expectancy keeps rising —
 * and telling someone their parent is "out of years" is both wrong and
 * cruel. At-birth expectancy systematically understates the remaining
 * years of anyone who has already reached older age, so we also apply a
 * simple conditional-survival approximation (45% of the distance to 95)
 * and take whichever horizon is longer. */
const MIN_YEARS_REMAINING = 5;
const MIN_QUALITY_YEARS = 2;
const QUALITY_CUTOFF_YEARS = 3;
const CONDITIONAL_HORIZON_AGE = 95;
const CONDITIONAL_SURVIVAL_FACTOR = 0.45;

const HEALTH_MODIFIER: Record<HealthStatus, number> = {
  good: 1.0,
  declining: 0.7,
  serious: 0.4,
};

const LOCATION_CAPACITY: Record<LocationType, number> = {
  same_city: 52,
  different_city: 24,
  abroad: 4,
};

export function lifeExpectancyForRegion(region?: string): number {
  if (!region) return DEFAULT_LIFE_EXPECTANCY;
  return LIFE_EXPECTANCY[region.trim().toUpperCase()] ?? DEFAULT_LIFE_EXPECTANCY;
}

export function workConstraintModifier(hoursPerWeek?: number): number {
  if (hoursPerWeek == null || hoursPerWeek < 40) return 1.0;
  if (hoursPerWeek <= 50) return 0.8;
  if (hoursPerWeek <= 60) return 0.6;
  return 0.4;
}

/** Soft rounding: nearest 10 above 100, nearest 5 above 20, else exact. */
export function softRound(n: number): number {
  if (n > 100) return Math.round(n / 10) * 10;
  if (n > 20) return Math.round(n / 5) * 5;
  return Math.round(n);
}

/** Framing tiers from the blueprint — possibility language only. */
export function framingFor(estimate: number, personLabel: string): string {
  if (estimate > 200) {
    return `You have meaningful time ahead with ${personLabel}. Every visit adds to something beautiful.`;
  }
  if (estimate > 100) {
    return `Around a hundred moments and more with ${personLabel}. Each one is its own gift.`;
  }
  if (estimate > 50) {
    return `Less than a hundred — and more than enough to make each one with ${personLabel} count.`;
  }
  if (estimate > 20) {
    return `Each visit with ${personLabel} now carries the weight of real meaning.`;
  }
  return `Precious time with ${personLabel}. This changes how every visit feels — in a good way.`;
}

export function estimateTimeReality(input: TimeRealityInput): TimeRealityResult {
  const health = input.personHealthStatus ?? 'good';
  const location = input.personLocationType ?? 'different_city';

  const expectancy = lifeExpectancyForRegion(input.region);
  const conditionalYears =
    (CONDITIONAL_HORIZON_AGE - input.personAge) * CONDITIONAL_SURVIVAL_FACTOR;
  const yearsRemaining = Math.max(
    expectancy - input.personAge,
    conditionalYears,
    MIN_YEARS_REMAINING,
  );
  const qualityYears = Math.max(
    (yearsRemaining - QUALITY_CUTOFF_YEARS) * HEALTH_MODIFIER[health],
    MIN_QUALITY_YEARS,
  );

  const capacityPerYear = LOCATION_CAPACITY[location] * workConstraintModifier(input.userWorkHoursPerWeek);

  const currentPace = Math.max(input.currentVisitsPerYear, 1);
  const desiredPace = Math.min(
    Math.max(input.desiredVisitsPerYear ?? currentPace + 2, currentPace),
    Math.max(capacityPerYear, currentPace),
  );

  const currentTrajectory = Math.max(softRound(currentPace * qualityYears), 1);
  const improvedTrajectory = Math.max(softRound(desiredPace * qualityYears), currentTrajectory);
  const maxPossible = Math.max(softRound(capacityPerYear * qualityYears), improvedTrajectory);

  // Urgency guides *product* behavior (how often to nudge), never copy tone.
  // Serious health is deliberately capped at medium: urgency pressure on top
  // of a family health crisis reads as guilt, not help.
  let urgencyLevel: 'low' | 'medium' | 'high' =
    currentTrajectory > 100 ? 'low' : currentTrajectory > 30 ? 'medium' : 'high';
  if (health === 'serious' && urgencyLevel === 'high') urgencyLevel = 'medium';

  const assumptions = [
    `Current pace of about ${softRound(currentPace)} visit(s) a year continues unchanged`,
    `A regional life-expectancy average is used as a planning horizon — it is a statistic, not a prediction about ${input.personLabel}`,
    'Quality-time window uses a conservative cutoff; many people stay active well beyond it',
    ...(health !== 'good'
      ? ['Health situations change — this estimate adjusts as things change, in both directions']
      : []),
  ];

  return {
    yearsRemaining: Math.round(yearsRemaining),
    qualityYears: Math.round(qualityYears * 10) / 10,
    currentTrajectory,
    improvedTrajectory,
    additionalPossible: Math.max(improvedTrajectory - currentTrajectory, 0),
    maxPossible,
    display: `~${currentTrajectory}`,
    framingText: framingFor(currentTrajectory, input.personLabel),
    urgencyLevel,
    assumptions,
  };
}
