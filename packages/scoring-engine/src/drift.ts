/**
 * What is drifting — derived from the scores, never asked twice.
 *
 * Onboarding used to ask the same question on two consecutive screens:
 * "how are you living Health?" (1–5), and then "is Health drifting?"
 * (a chip). They are the same statement, and nothing reconciled them —
 * so a person could rate a domain 5/5 and flag it as drifting, and the
 * Life Reveal would print "you rated yourself 5/5 … that distance is the
 * whole story" directly above "you flagged health as drifting".
 *
 * A low score IS the drift. Deriving it makes the contradiction
 * unrepresentable, and upgrades the signal the engine gets from a binary
 * flag to a 1–5 answer the person actually thought about.
 */

/** At or below this, a domain is drifting. 3 is "the middle", not a problem. */
export const DRIFT_SCORE_MAX = 2;

/**
 * How many drifting domains are worth carrying forward.
 *
 * Not a display cap — everything downstream treats this list as "the
 * places that need first attention", and a list where a person has
 * marked all twelve says the same thing as a list of none. The chip
 * version enforced the same limit; keeping it means no behaviour change
 * for anyone who answered the old screens.
 */
export const DRIFT_LIMIT = 4;

export interface DriftInput {
  /** Domains in the order the person ranked them. */
  ranking: string[];
  /** 1–5 self-scores, keyed by domain. */
  reality: Record<string, number>;
  /** Domains they never ranked but named as slipping anyway. */
  alsoSlipping?: string[];
}

/**
 * Ranked domains scoring at or below the threshold, worst gap first,
 * followed by anything they named as slipping without ranking it.
 *
 * Ordering is by the gap between what they said and what they live, not
 * by raw score: a #1 priority lived at 2/5 is a bigger story than a #6
 * lived at 1/5, and `neglected[0]` is what the drift warning, the weekly
 * review and the first mission all reach for.
 */
export function driftFromReality(input: DriftInput): string[] {
  const { ranking, reality } = input;
  const n = ranking.length;

  const ranked = ranking
    .map((domain, i) => ({ domain, score: reality[domain], i }))
    .filter((d) => typeof d.score === 'number' && d.score <= DRIFT_SCORE_MAX)
    .map((d) => ({
      domain: d.domain,
      // Both normalised 0..1 so the subtraction means something: share of
      // stated importance by rank position, against share of a 5-point life.
      gap: (n - d.i) / n - d.score / 5,
    }))
    .sort((a, b) => b.gap - a.gap)
    .map((d) => d.domain);

  // Never ranked, so there is no gap to measure — they go after the
  // measured ones, in the order they were named.
  const extra = (input.alsoSlipping ?? []).filter((d) => !ranked.includes(d));

  return [...ranked, ...extra].slice(0, DRIFT_LIMIT);
}
