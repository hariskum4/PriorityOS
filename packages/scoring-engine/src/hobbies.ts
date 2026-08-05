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
