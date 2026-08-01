/**
 * Countables — the user's own rituals, counted honestly.
 *
 * The tile that shows these had four faults, and they are the same four
 * faults this engine has had to fix everywhere else:
 *
 *   It quoted a pace nobody had verified. `perYear` came from tapping 1/2/4/12
 *   once at creation and never moved again, so "~150 more treks at your
 *   current pace" was printed over an archive holding zero treks. A number
 *   that looks personal and is actually a constant is the specific thing this
 *   product cannot afford (RESEARCH_NOTES §4).
 *
 *   It made twins. "treks" and "Went to trek" sat as two rows with identical
 *   numbers and identical sentences, because nothing compared a new name to
 *   the ones already there.
 *
 *   It threw away the people. The one logged Diwali carried
 *   `peoplePresent: ["Amma", "Appa"]` and the tile rendered "1 already in your
 *   archive" — discarding the only fact on the row that would make anyone act.
 *
 *   It said one sentence four times. Four rows, one template, and the eye
 *   stops reading at the first.
 *
 * Everything here is pure arithmetic over data the app already holds.
 */

import { softRound } from './timeReality';
import { yearsToHorizon } from './lifeWindows';

// ---------------------------------------------------------------------------
// Naming — one ritual, one row
// ---------------------------------------------------------------------------

/**
 * Words that carry no ritual in them. Dropping these is what lets "Went to
 * trek" and "treks" recognise each other; keeping the list short is what
 * stops "dinner with Amma" and "dinner with Arjun" from collapsing into one.
 */
const NOISE = new Set([
  'a', 'an', 'the', 'to', 'at', 'in', 'on', 'of', 'for', 'and', 'with',
  'my', 'our', 'your', 'their', 'his', 'her',
  'went', 'go', 'going', 'gone', 'did', 'do', 'doing', 'done',
  'some', 'more', 'another', 'one', 'time', 'times',
]);

/** Crude singular. Deliberately not a stemmer: over-stemming merges rituals. */
function singular(word: string): string {
  if (word.length > 3 && word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (word.length > 3 && (word.endsWith('ches') || word.endsWith('shes') || word.endsWith('sses'))) {
    return word.slice(0, -2);
  }
  if (word.length > 2 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

/** The meaningful words in a ritual's name, normalised and deduplicated. */
export function ritualTokens(label: string): string[] {
  const words = label
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map(singular)
    .filter((w) => !NOISE.has(w));
  return [...new Set(words)];
}

/** The storage key for a ritual. Stable across "Treks" / "went to treks". */
export function countKeyOf(label: string): string {
  const tokens = ritualTokens(label);
  const basis = tokens.length ? tokens.sort() : [label.toLowerCase()];
  return basis.join('_').replace(/[^a-z0-9_]+/g, '').slice(0, 40) || 'count';
}

export type RitualMatch = 'same' | 'similar';

/**
 * Whether a name someone just typed is a ritual they are already counting.
 *
 *   same    — the same words in some order. One row, not two.
 *   similar — one name's words contain the other's ("treks" vs "treks with
 *             Appa"). Worth asking about; never merged silently, because the
 *             longer one may genuinely be a different, narrower ritual.
 */
export function matchRitual(
  label: string,
  existing: Array<{ key: string; label: string }>,
): { match: RitualMatch; against: { key: string; label: string } } | null {
  const a = ritualTokens(label);
  if (!a.length) return null;
  const setA = new Set(a);

  for (const e of existing) {
    const b = ritualTokens(e.label);
    if (!b.length) continue;
    const setB = new Set(b);
    if (setA.size === setB.size && a.every((t) => setB.has(t))) {
      return { match: 'same', against: e };
    }
  }
  for (const e of existing) {
    const b = ritualTokens(e.label);
    if (!b.length) continue;
    const setB = new Set(b);
    const subset = a.every((t) => setB.has(t)) || b.every((t) => setA.has(t));
    if (subset) return { match: 'similar', against: e };
  }
  return null;
}

export interface RitualGroup<T> {
  /** The row to show. */
  item: T;
  /** Every stored key that turned out to be this same ritual. */
  keys: string[];
  /** The other names it was saved under, for the row to own out loud. */
  aliasLabels: string[];
}

/**
 * Collapse rituals that are the same thing saved twice.
 *
 * Preventing new twins is not enough on its own: the twins already exist.
 * "treks" and "Went to trek" were both written before anything compared
 * names, and they sit there as two rows with identical numbers and identical
 * sentences until something groups them.
 *
 * Grouping is done at read time rather than by deleting a row, because the
 * archive on each key is real — collapsing the display costs nothing and
 * loses nothing, whereas deleting the wrong one of a pair loses moments. The
 * caller sums the lived counts across `keys`.
 *
 * `weightOf` picks which name survives — pass how much archive each key has,
 * so the row keeps the name the evidence is actually filed under.
 */
export function dedupeRituals<T extends { key: string; label: string }>(
  counts: T[],
  weightOf: (c: T) => number = () => 0,
): Array<RitualGroup<T>> {
  const groups = new Map<string, T[]>();
  for (const c of counts) {
    const k = countKeyOf(c.label);
    groups.set(k, [...(groups.get(k) ?? []), c]);
  }
  return [...groups.values()].map((members) => {
    const [item, ...rest] = [...members].sort((a, b) => weightOf(b) - weightOf(a));
    return {
      item,
      keys: members.map((m) => m.key),
      aliasLabels: rest.map((m) => m.label),
    };
  });
}

// ---------------------------------------------------------------------------
// Pace — what was declared, and what actually happened
// ---------------------------------------------------------------------------

/**
 * A rhythm claimed from one occurrence is not a rhythm — the same floor the
 * domain sky uses. Below it the archive can say how many, never how often.
 */
const MIN_OBSERVATIONS_FOR_PACE = 2;
/** However long the archive is, one year is the shortest honest denominator. */
const MIN_SPAN_YEARS = 1;

export interface CountableObservation {
  /** How many are in the archive against this ritual. */
  count: number;
  /** Oldest and newest, ISO or Date. Absent when nothing is logged. */
  firstAt?: string | Date | null;
  lastAt?: string | Date | null;
}

export interface ObservedPace {
  count: number;
  /** Occurrences a year as actually recorded, or null when too few to say. */
  perYear: number | null;
  /** The window the rate was measured over, in years. */
  spanYears: number;
}

export function observedPace(
  obs: CountableObservation | undefined,
  now = Date.now(),
): ObservedPace {
  const count = obs?.count ?? 0;
  if (count < MIN_OBSERVATIONS_FOR_PACE || !obs?.firstAt) {
    return { count, perYear: null, spanYears: 0 };
  }
  const first = new Date(obs.firstAt).getTime();
  const spanYears = Math.max((now - first) / (365.25 * 86_400_000), MIN_SPAN_YEARS);
  return {
    count,
    perYear: Math.round((count / spanYears) * 10) / 10,
    spanYears: Math.round(spanYears * 10) / 10,
  };
}

// ---------------------------------------------------------------------------
// The count itself
// ---------------------------------------------------------------------------

/** A person this ritual is with, and the window they are in it for. */
export interface CountablePerson {
  name: string;
  /**
   * Years this person is realistically present for the ritual — from
   * `estimateTimeReality().qualityYears`, which already accounts for their
   * age, health and distance. The caller does that lookup; this module only
   * does the arithmetic, so the person math has exactly one implementation.
   */
  qualityYears: number;
}

export interface CountableShare {
  name: string;
  /** How many of the remaining are with them, at the pace in use. */
  remaining: number;
  /** And at one more a year — the agency counterpart, never omitted. */
  upliftRemaining: number;
}

export interface Countable {
  label: string;
  /** What they said they wanted. Intent, and labelled as intent. */
  declaredPerYear: number;
  /** What the archive shows, when it can show anything. */
  observedPerYear: number | null;
  /** The pace the headline number is actually computed from. */
  pacePerYear: number;
  paceBasis: 'observed' | 'declared';
  remaining: number;
  upliftRemaining: number;
  lived: number;
  shares: CountableShare[];
  headlineText: string;
  /** The line under it. Says something different in each situation. */
  detailText: string;
}

export interface CountableInput {
  age: number;
  label: string;
  declaredPerYear: number;
  observation?: CountableObservation;
  people?: CountablePerson[];
  now?: number;
}

export function countable(input: CountableInput): Countable {
  const years = yearsToHorizon(input.age);
  const obs = observedPace(input.observation, input.now);

  /* The observed pace wins whenever there is one. It is the difference
     between a number about this person and a number about the button they
     tapped once — and where they disagree, the sentence says so rather than
     quietly picking a side. */
  const pacePerYear = obs.perYear ?? input.declaredPerYear;
  const paceBasis: 'observed' | 'declared' = obs.perYear != null ? 'observed' : 'declared';

  const remaining = Math.max(softRound(pacePerYear * years), 1);
  const upliftRemaining = Math.max(softRound((pacePerYear + 1) * years), remaining);

  const shares: CountableShare[] = (input.people ?? []).map((p) => ({
    name: p.name,
    remaining: Math.max(Math.min(softRound(pacePerYear * p.qualityYears), remaining), 1),
    upliftRemaining: Math.max(
      Math.min(softRound((pacePerYear + 1) * p.qualityYears), upliftRemaining),
      1,
    ),
  }));

  return {
    label: input.label,
    declaredPerYear: input.declaredPerYear,
    observedPerYear: obs.perYear,
    pacePerYear,
    paceBasis,
    remaining,
    upliftRemaining,
    lived: obs.count,
    shares,
    headlineText: `${remaining} more ${input.label}`,
    detailText: detailFor({
      label: input.label,
      declared: input.declaredPerYear,
      obs,
      pacePerYear,
      remaining,
      upliftRemaining,
      shares,
    }),
  };
}

// ---------------------------------------------------------------------------
// What to suggest counting — from this life, not from a list
// ---------------------------------------------------------------------------

/**
 * The card offered the same five starters to everyone: ocean swims, Diwalis
 * at home, concerts, treks, movie nights with the kids. Nice words, and a
 * stranger's. Meanwhile the app was already holding, for this person:
 *
 *   - the moments they named as mattering with each person they track
 *     (`meaningfulMomentTypes` — "home-cooked meals" with Amma, "date nights"
 *     with Priya). Their own words, already attached to a name.
 *   - an archive of things they actually did, most of it untagged
 *   - who they said they want more time with, and how often
 *   - which domains they rate highly and have nothing countable in
 *
 * A suggestion drawn from any of those is worth ten from a list, and every
 * one of them carries why it was offered — a suggestion someone cannot
 * account for is the same failure as a number they cannot explain.
 */
export type SuggestionSource = 'moment-type' | 'archive' | 'person' | 'domain';

export interface CountableSuggestion {
  label: string;
  perYear: number;
  /** Relationship ids this ritual would be with, when it is with anyone. */
  peopleIds: string[];
  /** Said back to them, always grounded in something they told the app. */
  because: string;
  source: SuggestionSource;
  score: number;
}

export interface SuggestPerson {
  id: string;
  name: string;
  relationType: string;
  closenessScore?: number | null;
  wantsMoreTime?: boolean | null;
  desiredCallFrequency?: string | null;
  /** Their own words for what matters with this person. */
  meaningfulMomentTypes?: string[] | null;
}

export interface ArchiveTheme {
  /** A word that keeps recurring in untagged moments, already pluralised. */
  label: string;
  count: number;
  /** Names most often present, for binding the suggestion to them. */
  people?: string[];
}

export interface SuggestCountablesInput {
  existing: Array<{ key: string; label: string }>;
  people?: SuggestPerson[];
  domains?: Array<{ domainType: string; importance: number }>;
  archiveThemes?: ArchiveTheme[];
  limit?: number;
}

/** Cadence words → a countable pace the tile can actually offer. */
const CADENCE_PER_YEAR: Record<string, number> = {
  daily: 12, weekly: 12, biweekly: 12, monthly: 4, quarterly: 4, yearly: 1,
};

/**
 * What a ritual with this kind of person tends to be. Only reached when
 * someone named no moments of their own, and deliberately plain — a
 * suggestion is a starting point they will rename, not a description of
 * their relationship.
 */
const RITUAL_BY_RELATION: Record<string, string> = {
  mother: 'meals with', father: 'meals with', parent: 'meals with',
  spouse: 'evenings out with', partner: 'evenings out with',
  child: 'days out with', son: 'days out with', daughter: 'days out with',
  sibling: 'trips with', brother: 'trips with', sister: 'trips with',
  friend: 'catch-ups with', mentor: 'long conversations with',
};

/** A countable a domain tends to hold, for domains rated highly and empty. */
const RITUAL_BY_DOMAIN: Record<string, { label: string; perYear: number }> = {
  experiences: { label: 'trips somewhere new', perYear: 2 },
  health: { label: 'long walks outdoors', perYear: 12 },
  growth: { label: 'books finished', perYear: 4 },
  purpose: { label: 'things you shipped', perYear: 4 },
  reflection: { label: 'days off the grid', perYear: 4 },
  friends: { label: 'evenings with friends', perYear: 4 },
  family: { label: 'family gatherings', perYear: 2 },
  impact: { label: 'people you helped', perYear: 4 },
  finance: { label: 'money reviews you actually sat through', perYear: 4 },
  career: { label: 'work you were proud of', perYear: 4 },
};

export function suggestCountables(input: SuggestCountablesInput): CountableSuggestion[] {
  const out: CountableSuggestion[] = [];
  const people = input.people ?? [];

  // 1. Their own words for what matters, with the person it matters with.
  for (const p of people) {
    for (const moment of p.meaningfulMomentTypes ?? []) {
      if (!moment?.trim()) continue;
      out.push({
        label: `${moment.trim()} with ${p.name}`,
        perYear: CADENCE_PER_YEAR[p.desiredCallFrequency ?? ''] ?? 4,
        peopleIds: [p.id],
        because: `You said ${moment.trim()} are what matter with ${p.name}`,
        source: 'moment-type',
        score: 100 + (p.closenessScore ?? 0),
      });
    }
  }

  // 2. Things they keep doing that nothing is counting.
  for (const t of input.archiveThemes ?? []) {
    const withWhom = (t.people ?? []).slice(0, 1);
    out.push({
      label: t.label,
      perYear: Math.min(Math.max(t.count, 1), 12),
      peopleIds: withWhom
        .map((n) => people.find((p) => p.name === n)?.id)
        .filter(Boolean) as string[],
      because: `${t.count} already in your archive, counted against nothing`,
      source: 'archive',
      score: 80 + t.count * 5,
    });
  }

  // 3. People they said they want more of.
  for (const p of people) {
    if (!p.wantsMoreTime) continue;
    const verb = RITUAL_BY_RELATION[p.relationType];
    if (!verb) continue;
    out.push({
      label: `${verb} ${p.name}`,
      perYear: CADENCE_PER_YEAR[p.desiredCallFrequency ?? ''] ?? 4,
      peopleIds: [p.id],
      because: `You said you want more time with ${p.name}`,
      source: 'person',
      score: 50 + (p.closenessScore ?? 0),
    });
  }

  // 4. A domain they rate highly and count nothing in.
  for (const d of input.domains ?? []) {
    const ritual = RITUAL_BY_DOMAIN[d.domainType];
    if (!ritual || d.importance <= 0) continue;
    out.push({
      label: ritual.label,
      perYear: ritual.perYear,
      peopleIds: [],
      because: `You rate ${d.domainType} ${Math.round(d.importance)} and count nothing in it`,
      source: 'domain',
      score: 20 + d.importance / 10,
    });
  }

  /* Nothing already counted, and nothing twice — a suggester that offers
     what someone already has is the bug this card shipped with. Each kept
     suggestion joins the taken set, so two sources cannot both offer it.

     One per person, too. Amma naming two moments she loves would otherwise
     take two of the three slots and a third of a life would be represented
     by one relationship — a spread across the life is the whole point of
     drawing from it. A second pass relaxes the rule rather than returning a
     short list, because for someone who tracks one person it is the only
     material there is. */
  const limit = input.limit ?? 4;
  const taken = [...input.existing];
  const kept: CountableSuggestion[] = [];
  const spokenFor = new Set<string>();
  const ranked = out.sort((a, b) => b.score - a.score);

  for (const pass of [0, 1]) {
    for (const s of ranked) {
      if (kept.length >= limit) break;
      if (kept.includes(s)) continue;
      const owner = s.peopleIds[0];
      if (pass === 0 && owner && spokenFor.has(owner)) continue;
      if (matchRitual(s.label, taken)) continue;
      taken.push({ key: countKeyOf(s.label), label: s.label });
      if (owner) spokenFor.add(owner);
      kept.push(s);
    }
  }
  // Back into score order: which pass admitted a suggestion is bookkeeping,
  // and should not decide what someone reads first.
  return kept.sort((a, b) => b.score - a.score);
}

/**
 * The line under the number.
 *
 * Five situations, five sentences. The tile printed one template for all of
 * them, four times down the card, and four identical sentences read as none.
 * People come first where there are any: "~75 more Diwalis" is a statistic,
 * "~20 of them with Amma" is the reason anybody moves.
 */
function detailFor(x: {
  label: string;
  declared: number;
  obs: ObservedPace;
  pacePerYear: number;
  remaining: number;
  upliftRemaining: number;
  shares: CountableShare[];
}): string {
  const uplift = `One more a year makes it ~${x.upliftRemaining}.`;

  if (x.shares.length) {
    const named = x.shares.length === 1
      ? `~${x.shares[0].remaining} of them with ${x.shares[0].name}`
      : x.shares.map((s) => `~${s.remaining} with ${s.name}`).join(', ');
    // Their window is the shorter one, and it is the whole point of naming
    // them — said as arithmetic, with the lever attached, and never as a
    // warning. See RESEARCH_NOTES §4.
    const lift = x.shares[0].upliftRemaining > x.shares[0].remaining
      ? ` At one more a year, ~${x.shares[0].upliftRemaining} with ${x.shares[0].name}.`
      : '';
    return `${named} — their window is the shorter one.${lift}`;
  }

  if (x.obs.count === 0) {
    return `Nothing logged against this yet, so ~${x.remaining} is what ${x.declared} a year would give you — a plan, not a pace. Log one and this number starts telling the truth.`;
  }
  if (x.obs.perYear == null) {
    return `One kept so far, which is a start and not yet a rhythm. ~${x.remaining} assumes the ${x.declared} a year you asked for. ${uplift}`;
  }
  if (x.obs.perYear >= x.declared) {
    return `You are running at ~${x.obs.perYear} a year — at or above the ${x.declared} you set. ~${x.remaining} is your real pace, not your intended one. ${uplift}`;
  }
  return `You aimed at ${x.declared} a year and are managing ~${x.obs.perYear}, so ~${x.remaining} is the honest count. ${uplift}`;
}
