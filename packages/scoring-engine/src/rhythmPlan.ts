/**
 * When a standing commitment actually happens.
 *
 * A rhythm carries a frequency and nothing else: "move three times a week"
 * says how often and never says which days, or at what hour. So the app
 * could hold a commitment somebody had agreed to and still leave them with
 * the whole question — three times a week *when?* — which is the question
 * that decides whether it happens.
 *
 * Meanwhile every tick of that habit was already being read for its
 * timestamp (see `activeHour`), and that reading was spent placing other
 * things. The habits teaching the app when this person acts never appeared
 * in the day themselves.
 *
 * This module answers both halves, deterministically:
 *
 *   - **Which weekdays** — observed if there is enough history to earn it,
 *     otherwise spread as evenly as seven days allow, offset per rhythm so
 *     two commitments do not pile onto the same Monday.
 *   - **What hour** — the hour they are observed to do THIS thing, else the
 *     part of the day the activity belongs to, else nothing at all and the
 *     day shape keeps its own honest guess.
 *
 * Three rules it will not break:
 *
 *   **Placed is not scheduled.** A habit's target is per week and its streak
 *   is forgiving on purpose. Nothing here may turn a missed Tuesday into a
 *   failure — the week counts to n, and a planned day that passes unused
 *   costs nothing and is never mentioned.
 *
 *   **Never nag a finished week.** Once the target is met the rhythm stops
 *   being due, however many planned days are left.
 *
 *   **Refuse rather than guess.** Work-shaped rhythms get no hour, because
 *   an uninterrupted block belongs inside a working day and placing one at
 *   nine at night is worse than placing nothing.
 */

import type { TimeOfDay } from './rhythms';

/** Sunday is 0, matching `Date.prototype.getDay`. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

const SATURDAY = 6;
const SUNDAY = 0;

/**
 * The hour each part of the day is anchored to.
 *
 * A single minute rather than a range because the day shape already owns
 * the hard part: it takes a preferred minute, finds a free stretch with room
 * around it, and falls back to its own rule when none contains it. An anchor
 * inside somebody's sleep simply never matches, which is the correct outcome
 * without this module needing to know when they wake.
 */
const ANCHOR: Record<Exclude<TimeOfDay, 'work' | 'any'>, number> = {
  morning: 7 * 60,
  midday: 12 * 60 + 30,
  evening: 19 * 60,
};

// ---------------------------------------------------------------------------
// Which weekdays
// ---------------------------------------------------------------------------

/** Below this there is no weekday pattern, only a few occasions. */
const MIN_WEEKDAY_OBSERVATIONS = 4;
/** Four ticks in one week is one good week, not a standing choice of day. */
const MIN_DISTINCT_WEEKS = 2;
/** Older than this and it describes a routine that has since changed. */
const LOOKBACK_DAYS = 120;

/**
 * A small stable number from a rhythm's key.
 *
 * Without it every 1x-a-week rhythm starts on the same weekday and a person
 * who takes on four of them gets all four on Monday and an empty Thursday.
 */
function seedOf(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) % 997;
  return h;
}

function toDate(v: unknown): Date | null {
  if (v == null || v === '') return null;
  const d = v instanceof Date ? v : new Date(v as string | number);
  return Number.isFinite(d.getTime()) ? d : null;
}

/**
 * The Monday of the week containing this date, local time.
 *
 * Counted from a real week boundary rather than from the first of January:
 * seven-day buckets measured from Jan 1 fall wherever they fall, so four
 * consecutive days could land in two of them and one good week would read
 * as the two separate weeks this guard exists to demand.
 */
function weekKey(d: Date): string {
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return `${monday.getFullYear()}-${monday.getMonth()}-${monday.getDate()}`;
}

export interface WeekdayPlanInput {
  key: string;
  perWeek: number;
  /** Every recorded completion of THIS rhythm. */
  history?: Array<string | number | Date | null | undefined>;
  prefersWeekend?: boolean;
  now?: Date;
}

export interface WeekdayPlan {
  days: Weekday[];
  /** Whether the days came from what they do or from an even spread. */
  basis: 'observed' | 'spread';
}

/**
 * The weekdays a rhythm lands on.
 *
 * Observed wins when it is earned: the weekdays somebody has actually used,
 * across enough separate weeks that it is a routine rather than one good
 * week. Otherwise the days are spread as evenly as seven allows — which for
 * three a week is a two-three-two rhythm, not Monday-Tuesday-Wednesday and
 * four days off.
 */
export function rhythmWeekdays(input: WeekdayPlanInput): WeekdayPlan {
  const perWeek = Math.max(1, Math.min(Math.round(input.perWeek) || 1, 7));
  if (perWeek >= 7) return { days: [0, 1, 2, 3, 4, 5, 6], basis: 'spread' };

  const now = input.now ?? new Date();
  const floor = now.getTime() - LOOKBACK_DAYS * 86_400_000;
  const sample = (input.history ?? [])
    .map(toDate)
    .filter((d): d is Date => d != null && d.getTime() >= floor && d.getTime() <= now.getTime() + 86_400_000);

  if (
    sample.length >= Math.max(MIN_WEEKDAY_OBSERVATIONS, perWeek * 2) &&
    new Set(sample.map(weekKey)).size >= MIN_DISTINCT_WEEKS
  ) {
    const tally = new Array<number>(7).fill(0);
    for (const d of sample) tally[d.getDay()] += 1;
    const ranked = tally
      .map((count, day) => ({ count, day }))
      .filter((t) => t.count > 0)
      /* Ties break by weekday so the answer never depends on sort stability. */
      .sort((a, b) => b.count - a.count || a.day - b.day)
      .slice(0, perWeek)
      .map((t) => t.day as Weekday)
      .sort((a, b) => a - b);
    if (ranked.length === perWeek) return { days: ranked, basis: 'observed' };
  }

  const offset = input.prefersWeekend
    ? (perWeek === 1 ? SATURDAY : SUNDAY)
    : seedOf(input.key) % 7;
  const days = Array.from(
    { length: perWeek },
    (_, i) => ((offset + Math.round((i * 7) / perWeek)) % 7) as Weekday,
  ).sort((a, b) => a - b);
  return { days: [...new Set(days)] as Weekday[], basis: 'spread' };
}

// ---------------------------------------------------------------------------
// Due today
// ---------------------------------------------------------------------------

export interface DueInput {
  days: Weekday[];
  perWeek: number;
  /** Ticks already recorded in the current week. */
  doneThisWeek: number;
  today: Weekday;
  /** 0 = Sunday, 1 = Monday. The product counts weeks Monday to Sunday. */
  weekStartsOn?: 0 | 1;
}

/**
 * Whether this rhythm wants a slot today.
 *
 * A finished week is finished — the fourth offer of something asked for
 * three times is the app failing to keep count. The one exception is a week
 * running out with the target unmet: when there are no longer enough planned
 * days left, every remaining day counts, so somebody who missed Monday is
 * quietly offered Tuesday rather than told about Monday.
 */
export function rhythmDueToday(input: DueInput): boolean {
  const needed = Math.max(0, input.perWeek - Math.max(0, input.doneThisWeek));
  if (needed === 0) return false;
  if (input.days.includes(input.today)) return true;

  const start = input.weekStartsOn ?? 1;
  /* Days into the week, so "what is left" means the same thing on a Sunday
     as it does on a Wednesday. */
  const pos = (d: Weekday) => (d - start + 7) % 7;
  const plannedLeft = input.days.filter((d) => pos(d) > pos(input.today)).length;
  return plannedLeft < needed;
}

// ---------------------------------------------------------------------------
// What hour
// ---------------------------------------------------------------------------

export interface PreferredTimeInput {
  when?: TimeOfDay;
  /** Minutes from midnight this rhythm is observed to happen at, if known. */
  observedMinutes?: number | null;
}

/**
 * The minute of the day to aim for, or null to leave it to the day shape.
 *
 * What somebody does beats what the activity usually wants: a reader whose
 * ticks say nine at night gets nine at night for their walk, because that is
 * a fact about them and `morning` is only a fact about walks.
 */
export function preferredMinutes(input: PreferredTimeInput): number | null {
  if (input.when === 'work') return null;
  if (typeof input.observedMinutes === 'number' && Number.isFinite(input.observedMinutes)) {
    return ((Math.round(input.observedMinutes) % 1440) + 1440) % 1440;
  }
  const when = input.when ?? 'any';
  if (when === 'any') return null;
  return ANCHOR[when];
}

/** Whether this rhythm should be offered a slot in the day's free time. */
export function isPlaceable(when?: TimeOfDay): boolean {
  return when !== 'work';
}
