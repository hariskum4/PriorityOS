/**
 * The week, in one sentence, with no verdict attached.
 *
 * Marking a mission done is a single tap. It costs nothing, and if the app
 * treats it as the achievement then the record of a life becomes a record of
 * taps. The instinct is to detect that — score the plausibility, time the
 * gaps, flag what looks made up — and every version of it is wrong some of
 * the time. Being doubted by your own journal is a worse failure than the
 * problem it solves, and there is no source of truth for whether somebody
 * called their mother.
 *
 * So this does not judge. It counts two things the app genuinely knows — how
 * many were marked done, and how many left a moment behind — and prints them
 * in one line. Somebody who ticked eleven boxes and wrote nothing reads
 * "11 things done. Nothing kept from any of them", and draws their own
 * conclusion, which is the only conclusion that ever changes anything.
 *
 * What it will not do:
 *
 *   **No advice.** No "try writing one next week". The sentence ends where
 *   the fact ends; a suggestion would turn an observation into a chore.
 *
 *   **No praise either.** A full week reads as flatly as an empty one. Praise
 *   is a reward, rewards get chased, and chasing is the behaviour this line
 *   exists to not encourage.
 *
 *   **Nothing at all on an empty week.** Zero done gets `null`. Somebody who
 *   did nothing knows they did nothing, and a sentence about it is a scold.
 */

export interface KeptLineInput {
  /** Missions marked complete in the week. */
  done: number;
  /** How many of those have a kept moment in the archive. */
  kept: number;
}

/**
 * One sentence, or nothing.
 *
 * `kept` is clamped to `done` rather than trusted: the two numbers come from
 * different queries, and a stored count that drifted must not be able to
 * print "12 of 9".
 *
 * Anything that is not a number counts as none. A column added this week is
 * absent from every row written before it and arrives as `undefined` — which
 * printed "NaN left a moment behind" on the first real week this ran against,
 * a sentence about somebody's life assembled from a missing field. Callers
 * defaulting it themselves is not enough; the function that owns the wording
 * owns this too.
 */
function count(n: unknown): number {
  return typeof n === 'number' && Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

export function keptLine(input: KeptLineInput): string | null {
  const done = count(input?.done);
  const kept = Math.min(done, count(input?.kept));

  if (done === 0) return null;

  const things = done === 1 ? '1 thing done' : `${done} things done`;

  if (kept === 0) {
    return done === 1
      ? '1 thing done. Nothing kept from it.'
      : `${things}. Nothing kept from any of them.`;
  }

  if (kept === done) {
    return done === 1
      ? '1 thing done, and kept.'
      : `${things}, and a moment kept from every one.`;
  }

  return `${things}. ${kept} left a moment behind.`;
}
