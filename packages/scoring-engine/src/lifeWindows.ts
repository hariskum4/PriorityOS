/**
 * Life windows — the user's OWN time reality.
 *
 * Everything else in the engine counts time with other people; this
 * module counts the windows of the user's one life: free discretionary
 * hours (the number nobody knows about themselves), the working/earning
 * window, the post-career years, weekends remaining, and body windows
 * that are still open.
 *
 * Same invariants as timeReality.ts: planning horizons not lifespans,
 * no zeros, no closed-window shaming (windows that have passed are
 * simply not shown — the list is always about what is OPEN), agency
 * framing, assumptions attached.
 */

import { softRound } from './timeReality';
import { lifeShape } from './lifeShape';

// Generous by design: a 100-year horizon (people are living longer, and a
// tool that tells an 80-year-old their life is spent is both wrong and
// cruel). The horizon MOVES — nobody ever sees fewer than 15 years ahead,
// so at 90 the lens simply extends past 100. A planning lens, never a countdown.
export const PLANNING_HORIZON_AGE = 100;
const MIN_HORIZON_YEARS = 15;
const SLEEP_HOURS_PER_NIGHT = 7.5;
/** Commute, chores, errands, admin — the invisible tax on a week. */
const LIFE_OVERHEAD_HOURS_PER_WEEK = 24;
/**
 * When the stated hours ARE the household — a homemaker — the 24h overhead
 * would count the same cooking and errands twice. What is genuinely left
 * over is the personal slice: their own admin, appointments, upkeep.
 */
const CARE_WORK_OVERHEAD_HOURS_PER_WEEK = 8;
const WORKING_WEEKS_PER_YEAR = 48;

// ---------------------------------------------------------------------------
// Free time — the most confronting honest number
// ---------------------------------------------------------------------------

export interface FreeTimeBudget {
  freeHoursPerWeek: number;
  freeHoursPerYear: number;
  detail: string;
}

export function freeTimeBudget(workHoursPerWeek = 45, workType?: string | null): FreeTimeBudget {
  const careWork = lifeShape(workType).careWorkIsWork;
  const overhead = careWork ? CARE_WORK_OVERHEAD_HOURS_PER_WEEK : LIFE_OVERHEAD_HOURS_PER_WEEK;
  const perWeek = Math.max(
    Math.round(168 - SLEEP_HOURS_PER_NIGHT * 7 - workHoursPerWeek - overhead),
    4,
  );
  return {
    freeHoursPerWeek: perWeek,
    freeHoursPerYear: softRound(perWeek * 52),
    detail: careWork
      ? `168 hours a week, minus sleep, the ${workHoursPerWeek} hours the household takes, `
        + `and your own admin. What remains is the life part of your life.`
      : `168 hours a week, minus sleep, ${workHoursPerWeek} working hours, and the `
        + `invisible tax of commutes and chores. What remains is the life part of your life.`,
  };
}

// ---------------------------------------------------------------------------
// Horizon counts
// ---------------------------------------------------------------------------

export function yearsToHorizon(age: number): number {
  return Math.max(PLANNING_HORIZON_AGE - age, MIN_HORIZON_YEARS);
}

export function weekendsRemaining(age: number): number {
  return softRound(yearsToHorizon(age) * 52);
}

// ---------------------------------------------------------------------------
// Career window — "I want to work 10 more years"
// ---------------------------------------------------------------------------

export interface CareerWindow {
  workingYearsLeft: number;
  workingWeeksLeft: number;
  postCareerYears: number;
  postCareerFreeHours: number;
  framingText: string;
}

export function careerWindow(
  age: number,
  plannedWorkYearsMore: number,
  workHoursPerWeek = 45,
): CareerWindow {
  const years = Math.max(plannedWorkYearsMore, 1);
  const weeks = softRound(years * WORKING_WEEKS_PER_YEAR);
  const postYears = Math.max(yearsToHorizon(age) - years, MIN_HORIZON_YEARS);
  // Post-career weeks are nearly all free: no work, same overhead.
  const postFree = softRound(
    postYears * 52 * Math.max(168 - SLEEP_HOURS_PER_NIGHT * 7 - LIFE_OVERHEAD_HOURS_PER_WEEK, 8),
  );
  return {
    workingYearsLeft: years,
    workingWeeksLeft: weeks,
    postCareerYears: postYears,
    postCareerFreeHours: postFree,
    framingText:
      `~${weeks} working weeks left at ${workHoursPerWeek} hours — and then ` +
      `~${postYears} years that are almost entirely yours. The plan is for both halves.`,
  };
}

// ---------------------------------------------------------------------------
// Body windows — open AND closed, because closed is not the end of the story
// ---------------------------------------------------------------------------

export interface BodyWindow {
  key: string;
  label: string;
  /** Years until it closes; null for open-ended OR already closed — read
      `state` first. */
  yearsLeft: number | null;
  framingText: string;
  /**
   * Open, or closed with something to say. There is no "closing" state on
   * purpose: the chip already shows ~N yrs, and a third register between
   * "open" and "closed" would be the app performing urgency it cannot
   * measure.
   */
  state: 'open' | 'closed';
  /** The age it closed around, for the one line the card says about it. */
  closedAround: number | null;
  /**
   * The standing rhythm that uses this window, named by its catalog key the
   * way the healthspan levers name their twins. A window without one is
   * scenery — the same sentence for every person of the same age, read once
   * and never again. With one, a closing window is a reason to begin
   * something this week, which is the only register this app is allowed to
   * use scarcity in.
   *
   * Deliberately KEPT on a closed window. The window closing is a fact
   * about big gains coming easily; the rhythm behind it usually matters
   * more after the close, not less — strength at 55 is kept, not found,
   * and "kept" still needs the session.
   */
  rhythmKey: string | null;
  /** Where the habit belongs when it is begun from here. */
  domainType: string | null;
}

const BODY_WINDOWS: Array<{
  key: string; label: string; closesAround: number | null; framing: string;
  /**
   * What the closure means now — the second act, in the house voice.
   *
   * These exist because of what the filtered version of this list did to a
   * 71-year-old: one row, nothing to do, a card that gave the reader less
   * the older they got. Hiding a closed door was meant as kindness and
   * read as "nothing here for you" — and it was substantively wrong,
   * because every window here closes on the *easy gains*, not on the
   * activity. The line is written per window because the honest next move
   * differs: closed strength wants strength, closed endurance wants steady
   * movement, closed rough travel wants near places.
   *
   * Register rules, same as everywhere: the stake, never the scold. No
   * "should have", no time-running-out. The tone tests pin this.
   */
  closedFraming: string | null;
  rhythmKey: string | null; domainType: string | null;
}> = [
  {
    key: 'peak_strength',
    label: 'Peak strength building',
    closesAround: 40,
    framing: 'Muscle built now compounds for decades. The gym you join today is the mobility you keep at 70.',
    closedFraming:
      'The easy-gains window has passed — which is exactly why strength is now '
      + 'the biggest single lever you hold. From here muscle is kept, not found, '
      + 'and keeping it is the same one session a week.',
    rhythmKey: 'health.strength', domainType: 'health',
  },
  {
    key: 'endurance',
    label: 'Big endurance feats',
    closesAround: 55,
    framing: 'Marathons, treks, long rides — very trainable in this window at any starting fitness.',
    closedFraming:
      'The big-feats window has passed; the engine that powered them still '
      + 'wants using. Steady movement is what keeps every other row on this '
      + 'card open.',
    rhythmKey: 'health.move', domainType: 'health',
  },
  {
    key: 'adventure_travel',
    label: 'Rough-and-ready travel',
    closesAround: 70,
    framing: 'Overnight buses, mountain trails, sleeping anywhere. Comfort travel lasts far longer — this is the rough kind.',
    closedFraming:
      'The sleeping-anywhere kind has mostly had its day. Comfort travel is '
      + 'wide open, and the places within an hour of home never needed the '
      + 'rough version anyway.',
    rhythmKey: 'experiences.near', domainType: 'experiences',
  },
  {
    key: 'presence',
    label: 'Being fully present',
    closesAround: null,
    framing: 'The one window that never closes. Every other number here serves this one.',
    closedFraming: null,
    /* No action on purpose. Presence is what the whole app is for, and a
       button on it would be a habit called "be present", which is nothing. */
    rhythmKey: null, domainType: null,
  },
];

/**
 * Every window, honestly stated for this age.
 *
 * This used to filter — "only what is still OPEN" was the section heading —
 * and the result decayed monotonically with age: four rows and three actions
 * at 25, one row and no actions at 71. The reader with the least time to
 * waste got the least from the card, and no test could see it because the
 * function returned only survivors.
 *
 * Now a closed window converts instead of vanishing: state flips, the
 * framing becomes what the closure means *now*, and the rhythm stays
 * offerable — because the windows close on easy gains, never on the
 * activity. The card owes every age the same number of rows and at least
 * as many reasons to act; the persona sweep in personaSanity.test.ts pins
 * that for every age from 18 to 90.
 */
export function bodyWindows(age: number): BodyWindow[] {
  return BODY_WINDOWS.map((w) => {
    const open = w.closesAround === null || w.closesAround - age >= 1;
    return {
      key: w.key,
      label: w.label,
      state: (open ? 'open' : 'closed') as BodyWindow['state'],
      yearsLeft: open && w.closesAround !== null ? Math.round(w.closesAround - age) : null,
      closedAround: open ? null : w.closesAround,
      framingText: open ? w.framing : (w.closedFraming ?? w.framing),
      rhythmKey: w.rhythmKey,
      domainType: w.domainType,
    };
  });
}

/** The open ones alone, for callers that genuinely only want doors. */
export function openBodyWindows(age: number): BodyWindow[] {
  return bodyWindows(age).filter((w) => w.state === 'open');
}

// ---------------------------------------------------------------------------
// Aggregate
// ---------------------------------------------------------------------------

export interface LifeWindowsInput {
  age: number;
  workHoursPerWeek?: number;
  plannedWorkYearsMore?: number;
  workType?: string | null;
}

export interface LifeWindowsResult {
  yearsToHorizon: number;
  weekendsRemaining: number;
  freeTime: FreeTimeBudget;
  career: CareerWindow;
  body: BodyWindow[];
  assumptions: string[];
}

export function lifeWindows(input: LifeWindowsInput): LifeWindowsResult {
  const work = input.workHoursPerWeek ?? 45;
  const moreYears = input.plannedWorkYearsMore ?? Math.min(Math.max(60 - input.age, 5), 40);
  const careWork = lifeShape(input.workType).careWorkIsWork;
  return {
    yearsToHorizon: yearsToHorizon(input.age),
    weekendsRemaining: weekendsRemaining(input.age),
    freeTime: freeTimeBudget(work, input.workType),
    career: careerWindow(input.age, moreYears, work),
    body: bodyWindows(input.age),
    assumptions: [
      `A ${PLANNING_HORIZON_AGE}-year planning horizon that extends as you approach it — a lens for deciding, not a countdown`,
      careWork
        ? 'Free time assumes ~7.5h sleep; your household hours count as the work of the week, plus ~8h personal admin'
        : 'Free time assumes ~7.5h sleep and ~24h/week of commute, chores and admin',
      'Body windows are broad population patterns; individuals routinely beat them',
      'Every number moves the moment your patterns move',
    ],
  };
}
