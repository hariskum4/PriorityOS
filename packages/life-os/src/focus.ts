/**
 * Focus — a declared season, and what it costs.
 *
 * `suggestSeason` in the scoring engine already picked a 90-day emphasis, but
 * it was a sentence with a button: the app chose it, nothing downstream read
 * it, and it had no end. This is the version a person declares and the system
 * actually obeys.
 *
 * The naive version of this feature — pick a domain, grey out the other
 * eleven — is the app endorsing exactly the imbalance it exists to detect.
 * Someone who greys out family for a job hunt and loses six months with a
 * parent who was already 79 has been failed by the tool, not served by it. So
 * a Focus here has four properties that a filter does not:
 *
 *   1. **It re-weights, it never zeroes.** Every other domain keeps a floor.
 *      `weeklyAllocation` has always had `MIN_HOURS` for the same reason;
 *      focus turns that dial rather than removing it.
 *   2. **It ends.** A season with no end date is neglect with a nicer name,
 *      so `until` is required and the system counts it down.
 *   3. **It says what is being traded, in advance.** Not "career is now
 *      priority" but "friends drops from about five hours a week to one, for
 *      twelve weeks". Priced before it is agreed to, never discovered later.
 *   4. **It cannot postpone what will not wait.** The time engine names the
 *      closing windows and this module refuses to dim them, whatever the
 *      person chose. That refusal is the entire difference between this and a
 *      to-do list with a filter.
 *
 * Pure. The host persists the choice; everything here is arithmetic over a
 * graph and a list of windows.
 */

import { Domain } from './contract';
import { LifeGraph } from './lifeGraph';
import { ClosingWindow, nonPostponable } from './time';

export interface FocusChoice {
  domain: Domain;
  startedAt: Date;
  /** Required. A season without an end is not a season. */
  until: Date;
  /** Their words for why, shown back verbatim and never rewritten. */
  reason?: string;
}

export interface FocusWeight {
  domain: Domain;
  /** 0..1 multiplier applied to this domain's share while the focus runs. */
  weight: number;
  /** True when this domain is being deliberately quietened. */
  dimmed: boolean;
  /** True when it is exempt — something here will not wait. */
  protected: boolean;
  /** Why it is protected, when it is. Shown verbatim. */
  protectedBecause?: string;
}

export interface FocusPlan {
  domain: Domain;
  daysRemaining: number;
  expired: boolean;
  weights: FocusWeight[];
  /** The people and parts of life this season is not permitted to postpone. */
  floor: ClosingWindow[];
  /** What the person is agreeing to give up, in their own numbers. */
  trades: Array<{ domain: Domain; fromHours: number; toHours: number }>;
  headline: string;
  /** Said before agreeing, not discovered afterwards. */
  costText: string;
  assumptions: string[];
}

/**
 * The share a dimmed domain keeps.
 *
 * Not zero, and not a token. Around a third is enough to keep a rhythm alive
 * and honest about being reduced — below roughly this, a weekly commitment
 * stops being a commitment and the person quietly loses it rather than
 * pausing it.
 */
const DIMMED_SHARE = 0.35;
/** What the chosen domain gets. Generous, but it cannot take the whole week. */
const FOCUS_SHARE = 1.6;

/**
 * The ratio between those two is the load-bearing number, and it is small on
 * purpose: about 4.5×. Set wider — 1.9 against 0.2 was the first attempt —
 * something nine times more urgent in a quietened domain still lost to a
 * routine task in the chosen one, which is silencing wearing the word
 * "quietening". A season should change the odds, not decide the outcome in
 * advance. Anything genuinely five times more pressing still reaches the top.
 */
/** A protected domain is reduced slightly or not at all — never dimmed. */
const PROTECTED_SHARE = 0.85;

const DAY_MS = 86_400_000;

export function daysRemaining(focus: FocusChoice, now: Date): number {
  return Math.ceil((focus.until.getTime() - now.getTime()) / DAY_MS);
}

/**
 * Build the plan: what gets quietened, what is exempt, and what it costs.
 *
 * `currentHours` is the weekly allocation as it stands today, so the trade can
 * be stated in the hours this person actually has rather than in percentages
 * nobody can picture.
 */
export function focusPlan(input: {
  focus: FocusChoice;
  now: Date;
  domains: Domain[];
  currentHours?: Partial<Record<Domain, number>>;
  closingWindows?: ClosingWindow[];
  graph?: LifeGraph;
}): FocusPlan {
  const { focus, now, domains } = input;
  const remaining = daysRemaining(focus, now);
  const expired = remaining <= 0;

  const floor = nonPostponable(input.closingWindows ?? []);
  const protectedDomains = new Map<Domain, string>();
  for (const w of floor) protectedDomains.set(w.domain, w.because);

  /**
   * Anything the chosen domain is known to damage stays protected too.
   *
   * The graph already holds the signed couplings — career→relationships at
   * −0.5, career→health at −0.45 — so the cost of a season is readable rather
   * than guessed. A focus that is known to take from somewhere should not also
   * be allowed to quieten the warning about it.
   */
  if (input.graph) {
    for (const inf of input.graph.propagate(focus.domain, 20)) {
      if (inf.delta < -1 && domains.includes(inf.nodeId as Domain)) {
        const d = inf.nodeId as Domain;
        if (!protectedDomains.has(d)) {
          const path = input.graph.explain(focus.domain, d);
          protectedDomains.set(d, path?.hops[0]?.rationale
            ?? `${focus.domain} is known to take from ${d}.`);
        }
      }
    }
  }

  const weights: FocusWeight[] = domains.map((domain) => {
    if (domain === focus.domain) {
      return { domain, weight: FOCUS_SHARE, dimmed: false, protected: false };
    }
    const because = protectedDomains.get(domain);
    if (because) {
      return {
        domain, weight: PROTECTED_SHARE, dimmed: false, protected: true, protectedBecause: because,
      };
    }
    return { domain, weight: DIMMED_SHARE, dimmed: true, protected: false };
  });

  const trades = weights
    .filter((w) => w.dimmed)
    .map((w) => {
      const from = input.currentHours?.[w.domain] ?? 0;
      return {
        domain: w.domain,
        fromHours: Math.round(from * 10) / 10,
        toHours: Math.round(from * DIMMED_SHARE * 10) / 10,
      };
    })
    .filter((t) => t.fromHours > 0)
    .sort((a, b) => (b.fromHours - a.fromHours) || a.domain.localeCompare(b.domain));

  const weeks = Math.max(Math.round(remaining / 7), 0);
  const headline = expired
    ? `Your ${focus.domain} season has run its course.`
    : `${focus.domain} for ${weeks === 1 ? 'one more week' : `${weeks} more weeks`}.`;

  const biggest = trades[0];
  const costText = expired
    ? 'Seasons end so they can be chosen again rather than drifted through. Pick the next one, or let everything come back up.'
    : trades.length === 0
      ? `Nothing else is being quietened — there is nothing here that would not survive the wait.`
      : `${biggest.domain} goes from about ${biggest.fromHours}h a week to ${biggest.toHours}h`
        + (trades.length > 1 ? `, and ${trades.length - 1} other ${trades.length === 2 ? 'area' : 'areas'} the same way` : '')
        + `. For ${weeks === 1 ? 'a week' : `${weeks} weeks`}, deliberately.`;

  const assumptions = [
    'Nothing is switched off — everything quietened keeps about a third of its usual place, and anything genuinely urgent still comes through.',
    'A season ends on its own date. Nothing here renews itself.',
    ...(floor.length
      ? [`${floor.length} ${floor.length === 1 ? 'thing' : 'things'} cannot be postponed by any season and stay at full strength.`]
      : []),
  ];

  return {
    domain: focus.domain,
    daysRemaining: Math.max(remaining, 0),
    expired,
    weights,
    floor,
    trades,
    headline,
    costText,
    assumptions,
  };
}

/**
 * Re-rank anything domain-tagged for the season, without silencing anything.
 *
 * Used for missions and proposals. A dimmed domain's items still appear; they
 * simply stop winning the top slot against the thing the person said this
 * season was for.
 */
export function focusScore(
  baseScore: number,
  domain: Domain | null,
  plan: FocusPlan | null,
): number {
  if (!plan || plan.expired || !domain) return baseScore;
  const w = plan.weights.find((x) => x.domain === domain);
  return baseScore * (w?.weight ?? 1);
}
