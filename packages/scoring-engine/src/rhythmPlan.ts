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
 *
 * `bedtime` has no entry, and could not have one. Every hour here is a fact
 * about the activity — walks want mornings for everybody — and the hour a
 * person goes to bed is a fact about the person, which this module has never
 * been told. Writing an average bedtime in here would be exactly the kind of
 * confident guess about somebody's life that the app refuses elsewhere. The
 * day shape knows their sleep hour; it draws boundaries against it.
 */
const ANCHOR: Record<Exclude<TimeOfDay, 'work' | 'bedtime' | 'any'>, number> = {
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
  /**
   * Days the reader picked themselves. Beats both the reading and the
   * spread — an app that recalculates over somebody's own answer has
   * asked them a question and then ignored it.
   */
  override?: Weekday[] | null;
  now?: Date;
}

export interface WeekdayPlan {
  days: Weekday[];
  /** Where the days came from: their choice, their record, or the spread. */
  basis: 'chosen' | 'observed' | 'spread';
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

  /* Their own answer, before any arithmetic gets a say. Deduped and sorted
     so a caller cannot hand us Tuesday twice and get a week with two of it. */
  if (input.override?.length) {
    const chosen = [...new Set(input.override)]
      .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
      .sort((a, b) => a - b) as Weekday[];
    if (chosen.length) return { days: chosen, basis: 'chosen' };
  }

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
  /**
   * The hour they moved it to themselves. Beats the reading for the same
   * reason a chosen weekday does: a correction the app then recalculates
   * over is a question it asked and ignored.
   */
  chosenMinutes?: number | null;
}

/** Where an hour came from, so copy above this can say it without guessing. */
export type TimeSource = 'chosen' | 'observed' | 'catalog' | 'none';

export interface PreferredTime {
  minutes: number | null;
  source: TimeSource;
}

const intoDay = (m: number) => ((Math.round(m) % 1440) + 1440) % 1440;
const usable = (m: unknown): m is number =>
  typeof m === 'number' && Number.isFinite(m);

/**
 * The minute of the day to aim for, and why.
 *
 * Three tiers, most personal first. What they chose beats what they do,
 * and what they do beats what the activity usually wants: a reader whose
 * ticks say nine at night gets nine at night for their walk, because that
 * is a fact about them and `morning` is only a fact about walks.
 */
export function preferredTime(input: PreferredTimeInput): PreferredTime {
  if (input.when === 'work') return { minutes: null, source: 'none' };
  if (usable(input.chosenMinutes)) {
    return { minutes: intoDay(input.chosenMinutes), source: 'chosen' };
  }
  if (usable(input.observedMinutes)) {
    return { minutes: intoDay(input.observedMinutes), source: 'observed' };
  }
  /* `bedtime` falls through to here rather than refusing at the top the way
     `work` does, and the asymmetry is deliberate. Work refuses outright
     because an uninterrupted block at nine at night is worse than no hour at
     all. A bedtime has no *catalog* hour — see ANCHOR — but somebody who has
     kept lights-out at half eleven for a fortnight has told us when their day
     ends, and that reading is worth more than silence. */
  const when = input.when ?? 'any';
  if (when === 'any' || when === 'bedtime') return { minutes: null, source: 'none' };
  return { minutes: ANCHOR[when], source: 'catalog' };
}

/** The hour alone, for callers with nothing to say about where it came from. */
export function preferredMinutes(input: PreferredTimeInput): number | null {
  return preferredTime(input).minutes;
}

/**
 * Whether this rhythm should be offered a slot in the day's free time.
 *
 * Two things are refused, for opposite reasons. A `work` rhythm belongs
 * inside a working day, which is the one part of the day this app does not
 * get to spend. A `bedtime` one belongs at the edge of the day and costs
 * none of the hours in it.
 *
 * Every surface that hands out a piece of somebody's free time has to ask
 * this — the day card and the found-time sheet both — or the same rhythm is
 * refused a slot in one place and offered one in the other.
 */
export function isPlaceable(when?: TimeOfDay): boolean {
  return when !== 'work' && when !== 'bedtime';
}

/**
 * Whether this rhythm marks where the day ends rather than filling part of it.
 *
 * The complement of `isPlaceable` for the sleep-shaped case only: not placed,
 * but not hidden either. Something asked for seven times a week that vanished
 * from the day entirely would be a commitment with nowhere to keep it, which
 * is worse than the wrong hour. It is drawn against the sleep block, where a
 * bedtime is the one thing on the screen that can honestly be said about it.
 */
export function isBoundary(when?: TimeOfDay): boolean {
  return when === 'bedtime';
}

// ---------------------------------------------------------------------------
// The week, seen at once
// ---------------------------------------------------------------------------

/**
 * Weekday columns in the order a week is read, Monday first.
 *
 * The product counts weeks Monday to Sunday everywhere else — the Sunday
 * Session sits at the end of one — and a strip that opened on Sunday would
 * put the review before the week it reviews.
 */
export const WEEK_COLUMNS: Weekday[] = [1, 2, 3, 4, 5, 6, 0];
export const WEEKDAY_INITIALS: Record<Weekday, string> = {
  1: 'M', 2: 'T', 3: 'W', 4: 'T', 5: 'F', 6: 'S', 0: 'S',
};
export const WEEKDAY_NAMES: Record<Weekday, string> = {
  0: 'Sunday', 1: 'Monday', 2: 'Tuesday', 3: 'Wednesday',
  4: 'Thursday', 5: 'Friday', 6: 'Saturday',
};

export interface WeekPlanEntry {
  key: string;
  perWeek: number;
  history?: Array<string | number | Date | null | undefined>;
  /** Completions inside the current week, for the ticks. */
  thisWeek?: Array<string | number | Date | null | undefined>;
  prefersWeekend?: boolean;
  override?: Weekday[] | null;
}

export interface WeekPlanRow {
  key: string;
  perWeek: number;
  days: Weekday[];
  basis: WeekdayPlan['basis'];
  /** Weekdays already kept this week — ticks, not obligations met. */
  doneDays: Weekday[];
  doneThisWeek: number;
  /** How many are still wanted. Never negative: extra is not a debt. */
  remaining: number;
}

/**
 * Every standing rhythm laid across one week.
 *
 * Deliberately says nothing about whether a passed day was "missed". A
 * planned day that went unused is simply not ticked — the week counts to
 * the target and a target already met leaves `remaining` at zero, which is
 * the only state any copy above this should be reading.
 */
export function weekPlan(entries: WeekPlanEntry[], now: Date = new Date()): WeekPlanRow[] {
  return (entries ?? []).map((e) => {
    const perWeek = Math.max(1, Math.min(Math.round(e.perWeek) || 1, 7));
    const { days, basis } = rhythmWeekdays({
      key: e.key,
      perWeek,
      history: e.history,
      prefersWeekend: e.prefersWeekend,
      override: e.override,
      now,
    });
    const done = (e.thisWeek ?? [])
      .map(toDate)
      .filter((d): d is Date => d != null);
    const doneDays = [...new Set(done.map((d) => d.getDay() as Weekday))]
      .sort((a, b) => a - b);
    return {
      key: e.key,
      perWeek,
      days,
      basis,
      doneDays,
      doneThisWeek: done.length,
      remaining: Math.max(0, perWeek - done.length),
    };
  });
}
