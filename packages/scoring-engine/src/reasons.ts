/**
 * Why something is not being shown.
 *
 * The pattern this file names already exists in five places, and every one
 * of them was forced into existence by a bug: `foundTime.ruledOut` because a
 * strength session was offered to somebody at a desk, `blueprint`'s
 * `RejectionReason` because generated content needed an audit trail,
 * `allocation.unknownCommitments` because hand-written habits vanished from
 * the totals, `dayShape.assumptions` because a guessed nine-to-five read as
 * a fact, `energyBudget.overCommitted` because a warning with no cause reads
 * as a mood. The lesson, learned five separate times: **a surface that only
 * returns the survivors cannot explain itself, and a surface that cannot
 * explain itself decays silently.**
 *
 * The canonical example is the body-windows card. At 25 it showed four
 * windows and three actions; at 71 it showed one row and nothing to do —
 * a card that gave the reader less the older they got, which is exactly
 * backwards, and nothing in the code could see it happening because the
 * filter threw away everything it knew. The reasoning "strength closed at
 * 40, which is why it matters more now" is pure arithmetic the engine could
 * always have done. It was doing it — and keeping only the answer.
 *
 * So: any engine function that hides, filters, caps or declines SHOULD
 * return what it withheld alongside what it kept, tagged with a reason from
 * the closed set below. Closed, like `RejectionReason`, so rejections can
 * be logged, tested and narrated without ever carrying user content — and
 * so a new reason is a deliberate act rather than a stray string.
 *
 * What this is NOT: a model's job. Every reason here is deterministic
 * arithmetic. The AI layer may narrate these codes; it never decides them.
 */

/**
 * The closed set. Add deliberately; each code should name a *cause*, not a
 * feeling — "window-closed" is a fact about arithmetic, "not-for-you" would
 * be an editorial the engine has no business writing.
 */
export type WithheldReason =
  /** An age-bounded window whose bound has passed. */
  | 'window-closed'
  /** The place the reader is in does not allow it (see `Setting`). */
  | 'setting'
  /** Already held in substance — offering it again would be a duplicate. */
  | 'already-held'
  /** The week's target for it is already met. */
  | 'week-met'
  /** There is not enough open time for it to honestly fit. */
  | 'no-room'
  /** Asked about, answered, and the answer was no — retired, declined. */
  | 'declined'
  /** The inputs to decide are missing, so silence beats a guess. */
  | 'unknown';

/**
 * One withheld thing: what it was, why, and — when the arithmetic has one —
 * the honest next line. `instead` exists because "closed" is rarely the end
 * of the story: a strength window that shut is the *reason* strength
 * training matters now, and a card that says only "closed" has kept the
 * conclusion and dropped the point.
 */
export interface Withheld<T = unknown> {
  reason: WithheldReason;
  /** The thing itself, so callers can render or count it. */
  item: T;
  /** What the closure means now, in the house voice. Optional: not every
      withholding has a second act. */
  instead?: string;
}
