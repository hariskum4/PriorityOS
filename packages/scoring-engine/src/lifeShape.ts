/**
 * Life shape — what a particular life actually contains.
 *
 * The stacking catalog learned this lesson once already, for people: a stack
 * naming a child is withheld from someone who has recorded no children,
 * because it would be the app describing a life they do not have. Nothing did
 * the same for the shape of the working day, so a homemaker was told to turn
 * her commute into an audiobook and to give the first thirty minutes of work
 * to the skill instead of the inbox — a commute she does not make, an inbox
 * she does not have.
 *
 * One resolver, so every surface answers "does this life contain X?" the same
 * way instead of each guessing from `workType` strings independently.
 */

export interface LifeShape {
  /** A regular trip to somewhere work happens. */
  hasCommute: boolean;
  /**
   * Whether there are grounds to say the words "your commute" out loud.
   *
   * `hasCommute` is a guess and is meant to be — `UNKNOWN` sets it true so an
   * unanswered profile keeps every suggestion it had before this module
   * existed. That is the right rule for deciding whether an idea is plausible
   * and the wrong one for asserting a fact about somebody's morning. A student
   * who had answered nothing at all was told to "turn your commute into an
   * audiobook or course", purely because the `student` default guesses that
   * students travel.
   *
   * True where the reader gave a commute, and where the work type itself names
   * a workplace: picking `office_9_5`, `shift` or `business` is already saying
   * you go somewhere. `student` is not — it names a stage of life, not a
   * journey, and plenty of them study from a bedroom. Stated minutes win in
   * either direction.
   *
   * So: `hasCommute` gates availability, this gates naming.
   */
  canNameCommute: boolean;
  /** Inbox, work calls, a desk — the employee-shaped working day. */
  hasDeskJob: boolean;
  /** Paid, structured work for someone else. */
  employmentLike: boolean;
  /**
   * The day answers to them, not an employer: business owners, freelancers,
   * students, homemakers, retirees. What "give the first hour to the thing
   * you are building" needs to be possible.
   */
  selfDirectedWork: boolean;
  /**
   * The stated work hours ARE the household: cooking, care, errands. The
   * free-time math must not subtract a chores overhead on top of them — that
   * would count the same washing-up twice.
   */
  careWorkIsWork: boolean;
}

/** Defaults per work type; hasCommute can be overridden by a stated commute. */
const SHAPES: Record<string, LifeShape> = {
  office_9_5: { hasCommute: true, canNameCommute: true, hasDeskJob: true, employmentLike: true, selfDirectedWork: false, careWorkIsWork: false },
  remote: { hasCommute: false, canNameCommute: false, hasDeskJob: true, employmentLike: true, selfDirectedWork: false, careWorkIsWork: false },
  shift: { hasCommute: true, canNameCommute: true, hasDeskJob: false, employmentLike: true, selfDirectedWork: false, careWorkIsWork: false },
  business: { hasCommute: true, canNameCommute: true, hasDeskJob: true, employmentLike: false, selfDirectedWork: true, careWorkIsWork: false },
  freelance: { hasCommute: false, canNameCommute: false, hasDeskJob: true, employmentLike: false, selfDirectedWork: true, careWorkIsWork: false },
  student: { hasCommute: true, canNameCommute: false, hasDeskJob: false, employmentLike: false, selfDirectedWork: true, careWorkIsWork: false },
  homemaker: { hasCommute: false, canNameCommute: false, hasDeskJob: false, employmentLike: false, selfDirectedWork: true, careWorkIsWork: true },
  retired: { hasCommute: false, canNameCommute: false, hasDeskJob: false, employmentLike: false, selfDirectedWork: true, careWorkIsWork: false },
  between_jobs: { hasCommute: false, canNameCommute: false, hasDeskJob: false, employmentLike: false, selfDirectedWork: true, careWorkIsWork: false },
  career_break: { hasCommute: false, canNameCommute: false, hasDeskJob: false, employmentLike: false, selfDirectedWork: true, careWorkIsWork: false },
  // The value the app stored before retired/between_jobs/career_break existed.
  not_working: { hasCommute: false, canNameCommute: false, hasDeskJob: false, employmentLike: false, selfDirectedWork: true, careWorkIsWork: false },
};

/**
 * Unknown is not "has nothing" — it is "has not said". The permissive shape
 * keeps every suggestion available, which is exactly the behaviour all users
 * had before this module existed. The one exception is `careWorkIsWork`,
 * which changes arithmetic rather than availability and must be earned by an
 * actual answer.
 */
const UNKNOWN: LifeShape = {
  hasCommute: true, canNameCommute: false, hasDeskJob: true, employmentLike: true,
  selfDirectedWork: false, careWorkIsWork: false,
};

export function lifeShape(
  workType?: string | null,
  commuteMinutes?: number | null,
): LifeShape {
  const base = SHAPES[(workType ?? '').toLowerCase()] ?? UNKNOWN;
  // A stated commute beats any assumption in either direction: a remote
  // worker with a weekly office day commutes; an office worker who moved
  // next door does not.
  const stated = typeof commuteMinutes === 'number';
  const hasCommute = stated ? commuteMinutes > 0 : base.hasCommute;
  return {
    ...base,
    hasCommute,
    canNameCommute: stated ? commuteMinutes > 0 : base.canNameCommute,
  };
}
