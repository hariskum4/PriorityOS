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
  office_9_5: { hasCommute: true, hasDeskJob: true, employmentLike: true, selfDirectedWork: false, careWorkIsWork: false },
  remote: { hasCommute: false, hasDeskJob: true, employmentLike: true, selfDirectedWork: false, careWorkIsWork: false },
  shift: { hasCommute: true, hasDeskJob: false, employmentLike: true, selfDirectedWork: false, careWorkIsWork: false },
  business: { hasCommute: true, hasDeskJob: true, employmentLike: false, selfDirectedWork: true, careWorkIsWork: false },
  freelance: { hasCommute: false, hasDeskJob: true, employmentLike: false, selfDirectedWork: true, careWorkIsWork: false },
  student: { hasCommute: true, hasDeskJob: false, employmentLike: false, selfDirectedWork: true, careWorkIsWork: false },
  homemaker: { hasCommute: false, hasDeskJob: false, employmentLike: false, selfDirectedWork: true, careWorkIsWork: true },
  retired: { hasCommute: false, hasDeskJob: false, employmentLike: false, selfDirectedWork: true, careWorkIsWork: false },
  between_jobs: { hasCommute: false, hasDeskJob: false, employmentLike: false, selfDirectedWork: true, careWorkIsWork: false },
  career_break: { hasCommute: false, hasDeskJob: false, employmentLike: false, selfDirectedWork: true, careWorkIsWork: false },
  // The value the app stored before retired/between_jobs/career_break existed.
  not_working: { hasCommute: false, hasDeskJob: false, employmentLike: false, selfDirectedWork: true, careWorkIsWork: false },
};

/**
 * Unknown is not "has nothing" — it is "has not said". The permissive shape
 * keeps every suggestion available, which is exactly the behaviour all users
 * had before this module existed. The one exception is `careWorkIsWork`,
 * which changes arithmetic rather than availability and must be earned by an
 * actual answer.
 */
const UNKNOWN: LifeShape = {
  hasCommute: true, hasDeskJob: true, employmentLike: true,
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
  const hasCommute = typeof commuteMinutes === 'number'
    ? commuteMinutes > 0
    : base.hasCommute;
  return { ...base, hasCommute };
}
