/**
 * What a domain's numbers mean, apart from how they are drawn.
 *
 * This lived inside `Constellation.tsx`, which made it untestable — that file
 * needs a native runtime, and the vitest config here is deliberately limited
 * to plain modules. The arithmetic is not rendering, and keeping it in a
 * component is how the bug below went unnoticed through every screen that
 * displays it.
 */

export interface DomainDatum {
  domainType: string;
  importance: number;   // 0-100, declared
  attention: number;    // 0-100, observed
  neglectRisk?: number; // 0-100, engine-computed
}

/**
 * How far a domain has drifted, 0 (fed) → 1 (starved). Prefers the engine's
 * own neglect score and falls back to the raw say/do gap when it's absent.
 */
export function driftOf(d: DomainDatum): number {
  const gap = Math.max(0, d.importance - d.attention) / 60;
  const risk = (d.neglectRisk ?? 0) / 100;
  return Math.max(0, Math.min(1, Math.max(gap, risk)));
}

/** Whether this domain is part of the plan at all. */
export const isPlanned = (d: DomainDatum): boolean => d.importance > 0;

/**
 * The "held" figure, and `null` where there is no honest one to give.
 *
 * `held` is `(1 - drift) * 100`, and drift is the gap between what you said a
 * part of your life was worth and what you actually gave it. Say nothing and
 * the gap is zero, so a domain nobody ever mentioned scored a perfect 100 —
 * in the domain's own colour, directly beneath the words "not in your plan
 * yet".
 *
 * Found by building an account that had done nothing at all. Every domain
 * had attention 0; the scores were not equal, they were inverted:
 *
 *     family   imp 60  att 0  →   0 held
 *     children imp 45  att 0  →  25 held
 *     career   imp 15  att 0  →  75 held
 *     impact   imp  0  att 0  → 100 held   ← never mentioned
 *
 * Identical behaviour, opposite verdicts. The ranking was decided by how much
 * the person admitted to caring, and the parts of life they had never claimed
 * came out on top. For an app whose promise is that the numbers are honest
 * about where a life is going, this was the number flattering hardest exactly
 * where there was least to show.
 *
 * `verdictFor` on the domain screen already refuses to grade an unrated
 * domain — "Never rated is not the same as balanced". This is that rule,
 * applied to the score the label sits under.
 */
export function heldPercent(d: DomainDatum): number | null {
  if (!isPlanned(d)) return null;
  return Math.round((1 - driftOf(d)) * 100);
}

/**
 * The star that most deserves the opening glance.
 *
 * Null when nothing is planned — which the caller must handle rather than
 * reaching for the first domain in the list. See `openingDomain`.
 */
export function mostAdrift(domains: DomainDatum[]): DomainDatum | null {
  const live = domains.filter(isPlanned);
  if (!live.length) return null;
  return live.reduce((worst, d) =>
    driftOf(d) * d.importance > driftOf(worst) * worst.importance ? d : worst);
}

/**
 * Which domain the Today read-out opens on.
 *
 * The reader's own tap always wins. Otherwise the most adrift *planned*
 * domain — and when nothing is planned at all, the first one, because the
 * read-out is also the way into the domain screen and an account with no plan
 * is exactly the one that needs the way in.
 *
 * What it must not do is present that fallback as an achievement, which is
 * the other half of this file: `heldPercent` returns null for it, so the
 * screen shows a dash where the flattering 100 used to be.
 */
export function openingDomain(
  domains: DomainDatum[],
  picked?: string | null,
): string | null {
  if (picked) return picked;
  return mostAdrift(domains)?.domainType ?? domains[0]?.domainType ?? null;
}
