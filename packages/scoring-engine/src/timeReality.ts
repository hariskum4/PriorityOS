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
/**
 * `same_home` is a real value, not an alias.
 *
 * It used to normalise into `same_city` at the door, so "lives in my house"
 * was stored as "lives in my town" and every server-side reader lost the
 * difference — which is a large difference: the onboarding picker offers
 * "same home" as its own choice, the sanity rules skip call questions for it,
 * and the first mission for somebody's live-in partner should not be "one
 * message is enough". The visit arithmetic still treats it as same_city —
 * seeing somebody is not harder for sharing a roof — but storage keeps the
 * word that was said.
 */
export type LocationType = 'same_home' | 'same_city' | 'different_city' | 'abroad';

export interface TimeRealityInput {
  personAge: number;
  personLabel: string;
  /** Default 'good' — absence of information must not darken the estimate. */
  personHealthStatus?: HealthStatus;
  personLocationType?: LocationType;
  /**
   * The user's own age, when known. A visit needs both people.
   *
   * The window used to be the other person's alone, which is invisible when
   * the user is the younger one — the usual case, a 34-year-old asking about
   * their mother — and wildly wrong the moment they are not. An 87-year-old
   * with a 58-year-old son was told "~14 meaningful visits ahead", his son's
   * window, an arithmetic that quietly assumed he would be there at 101. For
   * a product whose whole claim is honest finite numbers, overcounting shared
   * time at the far end of a life is the worst possible place to be wrong.
   * The shared window is the shorter of the two.
   */
  userAge?: number;
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
  /**
   * Visits a year the improved trajectory actually assumes — which is not
   * always the two it was asked for.
   *
   * `desiredPace` is capped by what the location and the working week can
   * really hold, so someone whose parent lives abroad and who already visits at
   * that ceiling gains nothing from "two more a year". A caller offering that
   * sentence needs to know when it has become untrue, and the only honest
   * source is the pace the arithmetic used. Zero means the ceiling was already
   * reached: say nothing rather than promise a change that cannot happen.
   */
  visitsAddedPerYear: number;
  /** Realistic ceiling given location + work constraints. */
  maxPossible: number;
  /** Display-safe string, e.g. "~95". */
  display: string;
  framingText: string;
  urgencyLevel: 'low' | 'medium' | 'high';
  assumptions: string[];
}

/**
 * At-birth expectancy by country, WHO-order figures rounded to whole years.
 *
 * Four countries for a long time, with everyone else silently handed the
 * default — tolerable while nothing ever knew a user's country, and not once
 * `countryFromTimezone` started supplying one: a mapping that can say "Japan"
 * is only worth having if Japan then means 84 and not 75. Still a floor, not
 * a forecast — the conditional-survival rule below lifts everyone who has
 * already lived past the average, whatever their row here says.
 */
const LIFE_EXPECTANCY: Record<string, number> = {
  IN: 70, INDIA: 70,
  US: 79, USA: 79, 'UNITED STATES': 79,
  UK: 81, GB: 81, 'UNITED KINGDOM': 81,
  AU: 83, AUSTRALIA: 83,
  JP: 84, SG: 83, KR: 83, HK: 85, TW: 80, CN: 78,
  CA: 82, NZ: 82, IE: 82,
  FR: 82, DE: 81, ES: 83, IT: 83, NL: 81, SE: 83, NO: 83, DK: 81,
  CH: 84, AT: 81, BE: 81, PT: 81, FI: 81, GR: 80, PL: 78, CZ: 79,
  AE: 78, SA: 76, QA: 80, IL: 82, TR: 77,
  PK: 66, BD: 72, LK: 76, NP: 68,
  TH: 76, MY: 74, VN: 74, PH: 69, ID: 68,
  BR: 75, MX: 75, AR: 76, CL: 79, CO: 77, PE: 76,
  EG: 70, NG: 63, KE: 66, ZA: 66, GH: 64, ET: 65, MA: 74,
  RU: 73, UA: 71,
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
  // A shared roof caps nothing a shared city does not; the pair stay equal
  // so keeping the word changes no arithmetic anywhere.
  same_home: 52,
  same_city: 52,
  different_city: 24,
  abroad: 4,
};

/**
 * Words this engine has seen in the wild that mean one of the three it knows.
 *
 * `healthStatus` and `locationType` are plain nullable strings in the database
 * and were written straight through from whatever a client sent. Anything
 * outside the three keys indexed to `undefined`, `undefined * years` is NaN,
 * and NaN reached two places it must never reach: the copy — "~NaN meaningful
 * visits ahead with Lakshmi" — and a Float column, where Prisma threw and took
 * the whole of `/onboarding/complete` down with it.
 *
 * So this maps what it can and defaults what it cannot. Unknown health reads
 * as `good`, never as worse: an app that darkens an estimate because it did
 * not recognise a word is guessing about somebody's mother.
 */
const HEALTH_ALIASES: Record<string, HealthStatus> = {
  good: 'good', excellent: 'good', great: 'good', well: 'good', healthy: 'good', fine: 'good',
  declining: 'declining', fair: 'declining', ok: 'declining', okay: 'declining',
  poor: 'declining', frail: 'declining', unwell: 'declining',
  // The words people actually type about a parent. "aging" once normalised to
  // 'good' — the default for unknowns — which quietly LOWERED the urgency of
  // exactly the person the user was worried about.
  aging: 'declining', ageing: 'declining', elderly: 'declining', old: 'declining',
  sick: 'declining', ill: 'declining', unhealthy: 'declining', weak: 'declining',
  recovering: 'declining', fragile: 'declining',
  serious: 'serious', critical: 'serious', severe: 'serious', terminal: 'serious',
  cancer: 'serious', hospice: 'serious', bedridden: 'serious', hospitalised: 'serious',
  hospitalized: 'serious',
};

const LOCATION_ALIASES: Record<string, LocationType> = {
  same_home: 'same_home', same_house: 'same_home',
  same_city: 'same_city',
  same_town: 'same_city', local: 'same_city', nearby: 'same_city',
  different_city: 'different_city', another_city: 'different_city',
  same_country: 'different_city', different_state: 'different_city',
  abroad: 'abroad', different_country: 'abroad', overseas: 'abroad', international: 'abroad',
};

/** Normalise a stored string to a key the arithmetic actually has. */
export function normalizeHealthStatus(value?: string | null): HealthStatus {
  if (!value) return 'good';
  return HEALTH_ALIASES[value.trim().toLowerCase().replace(/[\s-]+/g, '_')] ?? 'good';
}

export function normalizeLocationType(value?: string | null): LocationType {
  if (!value) return 'different_city';
  return LOCATION_ALIASES[value.trim().toLowerCase().replace(/[\s-]+/g, '_')] ?? 'different_city';
}

/** Last line of defence: a number that is not a number never leaves here. */
function finite(n: number, fallback: number): number {
  return Number.isFinite(n) ? n : fallback;
}

export function lifeExpectancyForRegion(region?: string): number {
  if (!region) return DEFAULT_LIFE_EXPECTANCY;
  return LIFE_EXPECTANCY[region.trim().toUpperCase()] ?? DEFAULT_LIFE_EXPECTANCY;
}

/**
 * The keys this table answers for — alpha-2 codes only, not the spelled-out
 * aliases. Exported so the country picker can be tested against it rather
 * than drifting away from it, which is how "Japan" came to mean 84 in the
 * engine and be unreachable in the interface.
 */
export function lifeExpectancyRegions(): string[] {
  return Object.keys(LIFE_EXPECTANCY).filter((k) => /^[A-Z]{2}$/.test(k)).sort();
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
  /* Not "this changes how every visit feels — in a good way": shown under a
   * headline that already says the count, that body repeated the number's
   * message and then prescribed a feeling about it. The reader decides how
   * it feels; the app's job is what to do with the fact. */
  return `Precious time with ${personLabel} — few enough to plan each one on purpose.`;
}

export function estimateTimeReality(input: TimeRealityInput): TimeRealityResult {
  /* Normalised, not trusted. These arrive as free strings from the database. */
  const health = normalizeHealthStatus(input.personHealthStatus);
  const location = normalizeLocationType(input.personLocationType);
  /* An age that is not a number would carry NaN through every line below. */
  const personAge = finite(Number(input.personAge), 0);

  const expectancy = lifeExpectancyForRegion(input.region);
  /** One person's remaining window, by the same arithmetic for either of them. */
  const windowFor = (age: number, mod: number): number => {
    const conditional = (CONDITIONAL_HORIZON_AGE - age) * CONDITIONAL_SURVIVAL_FACTOR;
    const remaining = Math.max(expectancy - age, conditional, MIN_YEARS_REMAINING);
    return Math.max((remaining - QUALITY_CUTOFF_YEARS) * mod, MIN_QUALITY_YEARS);
  };

  const yearsRemaining = Math.max(
    expectancy - personAge,
    (CONDITIONAL_HORIZON_AGE - personAge) * CONDITIONAL_SURVIVAL_FACTOR,
    MIN_YEARS_REMAINING,
  );
  /* The shared window is the shorter of the two. The user's own health is
     not asked about anywhere, so their window uses the neutral modifier —
     absence of information must not darken the estimate, on either side. */
  const userAge = Number(input.userAge);
  const qualityYears = Number.isFinite(userAge) && userAge > 0
    ? Math.min(windowFor(personAge, HEALTH_MODIFIER[health]), windowFor(userAge, 1.0))
    : windowFor(personAge, HEALTH_MODIFIER[health]);

  const capacityPerYear = LOCATION_CAPACITY[location] * workConstraintModifier(input.userWorkHoursPerWeek);

  const currentPace = Math.max(finite(Number(input.currentVisitsPerYear), 1), 1);
  const desiredPace = Math.min(
    Math.max(finite(Number(input.desiredVisitsPerYear ?? currentPace + 2), currentPace + 2), currentPace),
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
    visitsAddedPerYear: Math.max(Math.round(desiredPace - currentPace), 0),
    maxPossible,
    display: `~${currentTrajectory}`,
    framingText: framingFor(currentTrajectory, input.personLabel),
    urgencyLevel,
    assumptions,
  };
}
