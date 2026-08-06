/**
 * What somebody actually does, and what they used to do and miss.
 *
 * Three prompts in `@priority/ai-prompts` say "never invent a hobby". That
 * rule is right and it has been doing half a job: the model was forbidden to
 * guess, and nothing ever told it the answer. So every generated suggestion
 * was assembled from work, family and a domain ranking — a life described
 * entirely by its obligations. The app knew somebody was a designer in Ranchi
 * with two children and a neglected growth score, and had no idea they play
 * the guitar.
 *
 * Two questions, not one, because they are used for opposite things:
 *
 *   **What you do now** is grounding — the same shelf as age, city and
 *   `personIsRemote`. It stops a suggestion being generic without ever
 *   becoming a suggestion itself.
 *
 *   **What you used to do and miss** is an intervention with a receipt.
 *   "Put one thing you used to enjoy back in the week" is the behavioural
 *   activation rung, Grade A as a mechanism, and it is currently generic.
 *   Named, it stops being advice and becomes their own sentence read back.
 *
 * Splitting them is not tidiness. Asked as one question, the answers merge
 * and the app starts telling somebody to play the guitar they gave up when
 * the second child arrived — which reads as an accusation, and is exactly the
 * shape the tone rules exist to forbid. What you have lost and what you have
 * kept deserve different handling, and the only way to handle them
 * differently is to ask them separately.
 *
 * Nothing here becomes a catalog entry. The catalogs are capped at around a
 * hundred and fifty on purpose — restraint is the feature, and a hobby list
 * that grew into offers would be the graveyard research ignored in one move.
 */

/** A hobby, as a person wrote it. */
export interface Hobbies {
  /** Kept now. Grounding for anything generated. */
  current: string[];
  /** Kept once, missed now. Feeds the behavioural-activation rung. */
  lapsed: string[];
}

/** Nothing asked, or nothing answered — both behave as before this existed. */
export const NO_HOBBIES: Hobbies = { current: [], lapsed: [] };

/**
 * The commonest answers, offered as taps.
 *
 * Not a taxonomy and not trying to be — a starting shelf so the question
 * costs a tap rather than a sentence, with free text beside it because no
 * list of hobbies has ever been complete and being absent from one is a
 * small insult. Ordered roughly by how many people keep them, which is also
 * roughly the order somebody scans.
 */
export const COMMON_HOBBIES = [
  'Reading', 'Music', 'Cooking', 'Walking', 'Gardening', 'Photography',
  'Writing', 'Painting', 'Cycling', 'Running', 'Swimming', 'Yoga',
  'Football', 'Cricket', 'Badminton', 'Chess', 'Gaming', 'Films',
  'Dancing', 'Singing', 'Guitar', 'Fishing', 'Hiking', 'Baking',
  'Woodwork', 'Knitting', 'Birdwatching', 'Languages', 'Volunteering',
] as const;

const MAX_EACH = 8;
const MAX_LENGTH = 40;

/**
 * Clean a list somebody typed or tapped.
 *
 * Trimmed, de-duplicated case-insensitively, capped in count and length. The
 * cap is not a storage worry — it is that a person who lists twenty hobbies
 * has told the model nothing, and a prompt that carries twenty is a prompt
 * that will pick the wrong one. Eight is more than anybody keeps.
 */
export function cleanHobbies(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const value = item.trim().replace(/\s+/g, ' ').slice(0, MAX_LENGTH);
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
    if (out.length >= MAX_EACH) break;
  }
  return out;
}

/**
 * Both lists, cleaned, with anything kept removed from the missed list.
 *
 * Somebody who taps "Guitar" in both is saying they play and wish they played
 * more, which is a real feeling and the wrong input for behavioural
 * activation — that rung is for the thing that has actually stopped. Kept
 * wins, because it is the one the app can see evidence of either way.
 */
export function readHobbies(current: unknown, lapsed: unknown): Hobbies {
  const kept = cleanHobbies(current);
  const heldKeys = new Set(kept.map((h) => h.toLowerCase()));
  return {
    current: kept,
    lapsed: cleanHobbies(lapsed).filter((h) => !heldKeys.has(h.toLowerCase())),
  };
}

/**
 * The one to name in "put something you used to enjoy back in the week".
 *
 * The first they listed, which is the one they thought of first. No ranking,
 * no cleverness — a person asked what they miss answers in order of how much
 * they miss it, and second-guessing that with a scoring function would be
 * the app assuming it knows their own list better than they do.
 *
 * Null when nothing was said, and the rung stays generic. Generic is a
 * perfectly good rung; it was one for its whole life before this.
 */
export function missedMost(hobbies: Hobbies): string | null {
  return hobbies.lapsed[0] ?? null;
}

// ---------------------------------------------------------------------------
// Finding one, without reading all of them
// ---------------------------------------------------------------------------

/**
 * The shelf, as twenty-nine buttons, rendered twice.
 *
 * `COMMON_HOBBIES` was written to make the question cost a tap, and it does —
 * for the person whose answer is in the first row. For everybody else it is a
 * wall: fifty-eight controls between "what do you do for yourself" and "what
 * do you miss", scanned twice, on a screen that also holds a profession, a
 * country, a theme and a partner invite. A list stops being a shortcut at
 * about the point it stops fitting on the screen, and this one passed that a
 * long way back.
 *
 * So the shelf stays as the source of truth and stops being the interface.
 * What a reader gets instead is a few they might plausibly say yes to, and a
 * box that finds the rest as they type.
 */

/** Loose, per-domain associations. Never offered as advice — only as options. */
const BY_DOMAIN: Record<string, string[]> = {
  health: ['Walking', 'Swimming', 'Yoga', 'Cycling', 'Running', 'Badminton'],
  growth: ['Reading', 'Languages', 'Writing', 'Chess'],
  reflection: ['Reading', 'Writing', 'Walking', 'Birdwatching'],
  experiences: ['Hiking', 'Photography', 'Fishing', 'Dancing'],
  friends: ['Films', 'Dancing', 'Gaming', 'Badminton'],
  family: ['Cooking', 'Baking', 'Gardening', 'Films'],
  children: ['Gaming', 'Baking', 'Cooking', 'Cricket'],
  partner: ['Cooking', 'Dancing', 'Films', 'Walking'],
  purpose: ['Writing', 'Woodwork', 'Painting', 'Volunteering'],
  impact: ['Volunteering', 'Languages', 'Writing'],
  career: ['Reading', 'Languages', 'Writing'],
  finance: ['Reading', 'Chess'],
};

/**
 * The ones that need a body that will co-operate.
 *
 * Withheld from a reader who told us their movement is limited, for the same
 * reason the rhythm catalog withholds a strength session: an option list is
 * quieter than a suggestion, but offering a 71-year-old with `ask_doctor`
 * "Running" as one of four hand-picked ideas is still the app deciding that
 * is a reasonable thing for them to take up. They can still type it, and if
 * they do it is theirs and the app believes them.
 */
const VIGOROUS = new Set(['Running', 'Football', 'Cricket', 'Cycling', 'Badminton', 'Swimming']);

export interface SuggestHobbiesInput {
  /** Their ranking, highest importance first — only the order is used. */
  domains?: Array<{ domainType: string; importance?: number | null }>;
  /** From the profile. `low_impact` and `ask_doctor` narrow the offer. */
  movementLimits?: string | null;
  /** Already chosen here or in the other list — never offered twice. */
  exclude?: string[];
  limit?: number;
}

/**
 * A few they might plausibly say yes to, from what they have already said.
 *
 * Drawn from the domains they ranked highest, in that order, so the four are
 * about the life they described rather than the first four somebody typed
 * into an array. Falls back to the head of the shelf when nothing is ranked
 * yet, which is the onboarding case and is exactly as good as what it
 * replaces.
 */
export function suggestHobbies(input: SuggestHobbiesInput = {}): string[] {
  const limit = input.limit ?? 4;
  const skip = new Set((input.exclude ?? []).map((h) => h.toLowerCase()));
  const limited = input.movementLimits && input.movementLimits !== 'none';

  const ranked = [...(input.domains ?? [])]
    .sort((a, b) => (b.importance ?? 0) - (a.importance ?? 0))
    .map((d) => d.domainType);

  const pool = [
    ...ranked.flatMap((d) => BY_DOMAIN[d] ?? []),
    ...COMMON_HOBBIES,
  ];

  const out: string[] = [];
  for (const h of pool) {
    if (out.length >= limit) break;
    if (skip.has(h.toLowerCase())) continue;
    if (limited && VIGOROUS.has(h)) continue;
    if (out.some((x) => x.toLowerCase() === h.toLowerCase())) continue;
    out.push(h);
  }
  return out;
}

/**
 * The shelf, filtered by what somebody is typing.
 *
 * Prefix matches first: a reader typing "wa" means Walking long before they
 * mean Woodwork, and a plain `includes` puts them in list order instead. An
 * empty query returns nothing rather than everything — the caller shows
 * `suggestHobbies` in that state, and returning all twenty-nine here would
 * rebuild the wall this exists to remove.
 */
export function searchHobbies(query: string, exclude: string[] = [], limit = 6): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const skip = new Set(exclude.map((h) => h.toLowerCase()));
  const available = COMMON_HOBBIES.filter((h) => !skip.has(h.toLowerCase()));
  const starts = available.filter((h) => h.toLowerCase().startsWith(q));
  const contains = available.filter(
    (h) => !h.toLowerCase().startsWith(q) && h.toLowerCase().includes(q),
  );
  return [...starts, ...contains].slice(0, limit);
}
