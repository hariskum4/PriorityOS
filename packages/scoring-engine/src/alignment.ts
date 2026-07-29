/**
 * Life alignment — one number for "am I living what I said matters?"
 *
 * The obvious formula is wrong, and it was shipped: subtract an
 * importance-weighted average of the say/do gap from 100. Run it over a real
 * life and it returns 98.8 for someone whose `purpose` is declared 12 and
 * lived 0. Two faults, both structural.
 *
 *   1. Weighting the gap by importance means the domains most likely to be
 *      starved — the ones you rated low precisely *because* you have been
 *      neglecting them — contribute almost nothing. The measure is quietest
 *      exactly where the problem is.
 *
 *   2. It counts only under-attention. Someone pouring 100 into a domain they
 *      rated 6 scores as perfectly aligned, when that is the textbook
 *      misalignment: the life going somewhere its owner never chose.
 *
 * The fix is to stop comparing levels and compare **shares**. Importance and
 * attention are each normalised into a distribution over domains, and
 * alignment is one minus the total variation distance between them:
 *
 *     alignment = 100 · (1 − ½ Σ |importanceShare − attentionShare|)
 *
 * This is scale-free (a person who rates everything 90 and one who rates
 * everything 30 are treated the same), symmetric (over-attention costs exactly
 * what under-attention costs), and it spans the full 0–100 range instead of
 * bunching against the ceiling. 100 means your attention is distributed
 * exactly as you said it should be. 0 means the two have nothing in common.
 *
 * It deliberately says nothing about *how much* you are doing. A quiet life
 * and a frantic one are both perfectly alignable; this measures direction, not
 * volume, and the product has other numbers for volume.
 */

export interface DomainBalance {
  domainType: string;
  /** What the person said this is worth, 0–100. */
  importance: number;
  /** Where their attention actually went, 0–100. */
  attention: number;
}

export interface AlignmentReading {
  /** 0–100. Higher means attention is distributed the way you said it should be. */
  score: number;
  /** The domain paying the most for the mismatch — starved relative to its claim. */
  starved: DomainBalance | null;
  /** The domain taking more than its share. Never framed as a fault on its own. */
  fed: DomainBalance | null;
  /**
   * Share points the starved domain is short by. This is the honest unit: "your
   * friends are getting 4% of your attention and you asked for 11%".
   */
  worstGapPoints: number;
}

const EMPTY: AlignmentReading = { score: 0, starved: null, fed: null, worstGapPoints: 0 };

/** One domain's claim on a life, against what it actually got. */
export interface DomainShare {
  domainType: string;
  /** Percentage of the person's stated priorities this domain represents. */
  claimed: number;
  /** Percentage of their actual attention it received. */
  received: number;
  /** Claimed minus received, in share points. Positive means starved. */
  shortfall: number;
}

/**
 * The share table this whole module is built on, unrounded.
 *
 * Kept private and shared so that anything ranking by "what is short" is
 * ranking by the same definition the alignment score uses. Two different
 * answers to "which domain is starving" is how a product ends up telling
 * someone their life is 98.8% aligned while a domain sits at zero.
 */
function rawShares(domains: DomainBalance[]) {
  const live = domains.filter((d) => d.importance > 0);
  const totalImportance = live.reduce((s, d) => s + Math.max(0, d.importance), 0);
  const totalAttention = live.reduce((s, d) => s + Math.max(0, d.attention), 0);
  return live.map((d) => ({
    domain: d,
    want: totalImportance > 0 ? Math.max(0, d.importance) / totalImportance : 0,
    // Attention nowhere at all leaves every domain short by its whole claim,
    // which is the truth, rather than a divide-by-zero or an even split.
    got: totalAttention > 0 ? Math.max(0, d.attention) / totalAttention : 0,
  }));
}

/**
 * Where each domain stands: what it was promised, and what it received.
 *
 * Levels cannot answer this — "importance 18, attention 5" means nothing until
 * you know what the other domains got. Shares can, and they are what makes a
 * suggestion sayable in a sentence: *friends is getting 1% of your attention
 * and you asked for 4%.*
 */
export function domainShares(domains: DomainBalance[]): DomainShare[] {
  return rawShares(domains).map(({ domain, want, got }) => ({
    domainType: domain.domainType,
    claimed: round(want * 100),
    received: round(got * 100),
    shortfall: round((want - got) * 100),
  }));
}

/**
 * Alignment across the domains a person has actually declared.
 *
 * Domains with zero declared importance are excluded rather than counted as
 * perfectly-neglected: a domain you never claimed is not a failure, and
 * including it would drag every score toward the floor.
 */
export function lifeAlignment(domains: DomainBalance[]): AlignmentReading {
  const live = domains.filter((d) => d.importance > 0);
  if (!live.length) return EMPTY;

  const totalImportance = live.reduce((s, d) => s + Math.max(0, d.importance), 0);
  const totalAttention = live.reduce((s, d) => s + Math.max(0, d.attention), 0);
  if (totalImportance <= 0) return EMPTY;

  // Attention nowhere at all is total misalignment, not a divide-by-zero.
  if (totalAttention <= 0) {
    const worst = live.reduce((a, b) => (a.importance >= b.importance ? a : b));
    return { score: 0, starved: worst, fed: null, worstGapPoints: 100 };
  }

  let divergence = 0;
  let starved: DomainBalance | null = null;
  let fed: DomainBalance | null = null;
  let worstShort = 0;
  let worstOver = 0;

  for (const { domain, want, got } of rawShares(domains)) {
    divergence += Math.abs(want - got);

    const short = want - got;
    if (short > worstShort) { worstShort = short; starved = domain; }
    if (-short > worstOver) { worstOver = -short; fed = domain; }
  }

  return {
    score: round(100 * (1 - divergence / 2)),
    starved,
    fed,
    worstGapPoints: round(worstShort * 100),
  };
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}
