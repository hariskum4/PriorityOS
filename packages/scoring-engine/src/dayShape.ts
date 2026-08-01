/**
 * The day, as a shape.
 *
 * Everything else in this engine answers *what* a life is short of and *how*
 * to serve two domains with one hour. Nothing answered *when*. The app could
 * say "family is 40 points short, here is a mission" and never say where in a
 * Tuesday that mission was supposed to go — which is most of the distance
 * between agreeing with a suggestion and doing it.
 *
 * Two things this deliberately is not:
 *
 *  - **Not a calendar.** Manual entry is what killed the personal-CRM
 *    generation (RESEARCH_NOTES §3); a plan somebody has to maintain is
 *    abandoned in about three months. Everything here is derived from four
 *    facts asked once — when work starts, when it ends, how long the commute
 *    is, and when the person sleeps — and three of those the profile either
 *    holds or approximates already.
 *
 *  - **Not today's plan.** It is the shape of a typical working day. The day
 *    this claims to know about a 6pm meeting is the day it becomes noise and
 *    stops being read, so it never claims that. It shows where the hours
 *    actually are and puts *one* thing in the biggest of them — the same
 *    discipline as the dashboard's single top mission, for the same reason
 *    (choice overload, §2).
 */

export type BlockKind = 'sleep' | 'commute' | 'work' | 'open' | 'suggested' | 'meal';

export interface DayBlock {
  /** Minutes from midnight of the waking day. May exceed 1440 near sleep. */
  startMinutes: number;
  endMinutes: number;
  kind: BlockKind;
  label: string;
  /** Domains this block feeds. Only ever populated for a suggestion. */
  domains?: string[];
  /** Why this block is here, when it is worth saying. */
  note?: string;
}

export interface DayShapeInput {
  /** Hour work begins, 0–23 in the person's own timezone. */
  workStartHour?: number | null;
  workEndHour?: number | null;
  /** One way, in minutes. Ignored when work is remote. */
  commuteMinutes?: number | null;
  workType?: string | null;
  /** From preferences: quietHoursStart / quietHoursEnd. */
  sleepHour?: number | null;
  wakeHour?: number | null;
  /** False for a rest day: no work, no commute, the whole day is open. */
  isWorkday?: boolean;
  /** The one thing to place, already chosen by the ranking engines. */
  suggestion?: {
    action: string;
    minutes: number;
    domains: string[];
    reason?: string;
  } | null;
}

export interface DayShape {
  blocks: DayBlock[];
  /** Waking minutes not already spoken for. */
  freeMinutes: number;
  /** The gap the suggestion went into, if one was placed. */
  placedIn: { startMinutes: number; endMinutes: number } | null;
  /** Whether the inputs were real or assumed. Same rule as everywhere. */
  basis: 'stated' | 'assumed';
  framingText: string;
  assumptions: string[];
}

const HOUR = 60;
const DAY_MINUTES = 24 * HOUR;

/** Defaults used only to draw *something*, and always declared as assumed. */
const ASSUMED = { workStart: 9, workEnd: 17, commute: 0, sleep: 22, wake: 7 };

/**
 * The smallest gap worth naming.
 *
 * Below this a "free block" is the walk from a desk to a kettle, and drawing
 * it as available time is the kind of arithmetic that makes a person feel
 * accused of wasting a life they are simply living.
 */
const MIN_USEFUL_GAP = 20;

/**
 * The shortest run of time in which something with a person in it can happen.
 *
 * Total free minutes is the wrong measure and says the comforting thing: two
 * half-hours either side of a fifteen-hour day sums to an hour and sounds
 * like an hour, when in truth there is nowhere in that day to put a walk with
 * anyone. What matters is the longest unbroken stretch.
 */
const MIN_MEANINGFUL_STRETCH = 45;

/**
 * Absent, as the database means it.
 *
 * `Number(null)` is 0, not NaN — so a null `workStartHour` read as midnight
 * rather than as "unknown", and the shape drew a person's work as running
 * from midnight to midnight. Every waking hour came back marked Work and the
 * card told them there was nothing left in their day at all. A guard against
 * NaN is not a guard against empty.
 */
function absent(v: unknown): boolean {
  return v == null || v === '' || !Number.isFinite(Number(v));
}

function clampHour(v: unknown, fallback: number): number {
  if (absent(v)) return fallback;
  return Math.min(Math.max(Math.floor(Number(v)), 0), 23);
}

function clampMinutes(v: unknown, fallback: number): number {
  if (absent(v) || Number(v) < 0) return fallback;
  return Math.min(Math.floor(Number(v)), 4 * HOUR);
}

/** "6:30 pm" — the way a person would say it, not the way a database stores it. */
export function formatClock(minutes: number): string {
  const m = ((Math.round(minutes) % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
  const h24 = Math.floor(m / HOUR);
  const mins = m % HOUR;
  const suffix = h24 < 12 ? 'am' : 'pm';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return mins === 0 ? `${h12} ${suffix}` : `${h12}:${String(mins).padStart(2, '0')} ${suffix}`;
}

export function formatSpan(startMinutes: number, endMinutes: number): string {
  return `${formatClock(startMinutes)}–${formatClock(endMinutes)}`;
}

function describeGap(minutes: number): string {
  if (minutes >= 2 * HOUR) return `${Math.round((minutes / HOUR) * 10) / 10} hours`;
  return `${Math.round(minutes)} minutes`;
}

export function dayShape(input: DayShapeInput = {}): DayShape {
  const isWorkday = input.isWorkday !== false;
  const remote = (input.workType ?? '').toLowerCase() === 'remote';

  const stated = input.workStartHour != null && input.workEndHour != null;
  const workStart = clampHour(input.workStartHour, ASSUMED.workStart) * HOUR;
  let workEnd = clampHour(input.workEndHour, ASSUMED.workEnd) * HOUR;
  /* A shift ending before it starts is a night shift, not bad data. */
  if (workEnd <= workStart) workEnd += DAY_MINUTES;

  const commute = remote ? 0 : clampMinutes(input.commuteMinutes, ASSUMED.commute);

  const wake = clampHour(input.wakeHour, ASSUMED.wake) * HOUR;
  let sleep = clampHour(input.sleepHour, ASSUMED.sleep) * HOUR;
  if (sleep <= wake) sleep += DAY_MINUTES;

  // ---- the blocks that are not negotiable -------------------------------
  const fixed: DayBlock[] = [];
  if (isWorkday) {
    if (commute > 0) {
      fixed.push({
        startMinutes: workStart - commute,
        endMinutes: workStart,
        kind: 'commute',
        label: 'Getting there',
      });
    }
    fixed.push({
      startMinutes: workStart,
      endMinutes: workEnd,
      kind: 'work',
      label: 'Work',
    });
    if (commute > 0) {
      fixed.push({
        startMinutes: workEnd,
        endMinutes: workEnd + commute,
        kind: 'commute',
        label: 'Getting home',
      });
    }
  }

  const inDay = (b: DayBlock) => b.endMinutes > wake && b.startMinutes < sleep;
  const bounded = fixed
    .filter(inDay)
    .map((b) => ({
      ...b,
      startMinutes: Math.max(b.startMinutes, wake),
      endMinutes: Math.min(b.endMinutes, sleep),
    }))
    .sort((a, b) => a.startMinutes - b.startMinutes);

  // ---- what is left ------------------------------------------------------
  const gaps: Array<{ startMinutes: number; endMinutes: number }> = [];
  let cursor = wake;
  for (const b of bounded) {
    if (b.startMinutes - cursor >= MIN_USEFUL_GAP) {
      gaps.push({ startMinutes: cursor, endMinutes: b.startMinutes });
    }
    cursor = Math.max(cursor, b.endMinutes);
  }
  if (sleep - cursor >= MIN_USEFUL_GAP) {
    gaps.push({ startMinutes: cursor, endMinutes: sleep });
  }

  const freeMinutes = gaps.reduce((n, g) => n + (g.endMinutes - g.startMinutes), 0);

  // ---- place the one thing ----------------------------------------------
  //
  // The largest gap, and only if the suggestion actually fits in it. Proposing
  // an hour into forty minutes is how a plan starts lying on its first day.
  let placedIn: DayShape['placedIn'] = null;
  const suggestion = input.suggestion ?? null;
  const evening = [...gaps].sort((a, b) => (
    (b.endMinutes - b.startMinutes) - (a.endMinutes - a.startMinutes)
  ))[0];
  const need = suggestion ? Math.max(Math.min(suggestion.minutes, 3 * HOUR), 10) : 0;
  const fits = !!suggestion && !!evening && (evening.endMinutes - evening.startMinutes) >= need;

  const blocks: DayBlock[] = [...bounded];
  for (const g of gaps) {
    if (fits && g === evening) {
      /* The suggestion sits at the *start* of the gap. Anything asked for
         "later, when there is time" is what gets postponed; the first hour
         after the fixed blocks end is the one that actually exists. */
      blocks.push({
        startMinutes: g.startMinutes,
        endMinutes: g.startMinutes + need,
        kind: 'suggested',
        label: suggestion!.action,
        domains: suggestion!.domains,
        note: suggestion!.reason,
      });
      placedIn = { startMinutes: g.startMinutes, endMinutes: g.startMinutes + need };
      const rest = g.endMinutes - (g.startMinutes + need);
      if (rest >= MIN_USEFUL_GAP) {
        blocks.push({
          startMinutes: g.startMinutes + need,
          endMinutes: g.endMinutes,
          kind: 'open',
          label: 'Yours',
        });
      }
    } else {
      blocks.push({
        startMinutes: g.startMinutes,
        endMinutes: g.endMinutes,
        kind: 'open',
        label: 'Yours',
      });
    }
  }

  blocks.push({
    startMinutes: sleep,
    endMinutes: wake + DAY_MINUTES,
    kind: 'sleep',
    label: 'Sleep',
  });
  blocks.sort((a, b) => a.startMinutes - b.startMinutes);

  // ---- what to say about it ---------------------------------------------
  const basis: DayShape['basis'] = stated ? 'stated' : 'assumed';
  const assumptions = [
    stated
      ? `Built from the hours you gave: work ${formatSpan(workStart, workEnd)}${commute ? `, ${commute} minutes each way` : ''}`
      : `No work hours set — this assumes ${formatSpan(ASSUMED.workStart * HOUR, ASSUMED.workEnd * HOUR)}`,
    'The shape of a typical working day, not a plan for today — nothing here knows about your meetings',
    'Sleep comes from your quiet hours',
  ];

  const longest = evening ? evening.endMinutes - evening.startMinutes : 0;

  let framingText: string;
  if (!isWorkday) {
    framingText =
      `A day off is ${describeGap(freeMinutes)} of your own. Nothing here is scheduled — ` +
      `it is only worth knowing how much there actually is.`;
  } else if (longest < MIN_MEANINGFUL_STRETCH) {
    /* Said about the longest stretch, not the total. An hour split into two
       half-hours around a fifteen-hour day sounds like an hour and is not
       one, and the person living it already knows that — what they need is
       the app agreeing rather than suggesting they try harder. */
    framingText = longest === 0
      ? `Between getting home and sleeping there is nothing left at all. That is worth ` +
        `seeing plainly: it is a scheduling problem, not a discipline one.`
      : `The longest unbroken stretch in this day is ${describeGap(longest)}. Adding up to ` +
        `${describeGap(freeMinutes)} across the day does not make it an hour you could ` +
        `spend with someone — it is a scheduling problem, not a discipline one.`;
  } else if (fits && placedIn) {
    framingText =
      `Your longest free stretch is ${formatSpan(evening.startMinutes, evening.endMinutes)} — ` +
      `${describeGap(evening.endMinutes - evening.startMinutes)}. The first ${need} minutes of it ` +
      `is enough for this, and the rest stays yours.`;
  } else {
    framingText =
      `About ${describeGap(freeMinutes)} of the day is not already spoken for, ` +
      `the longest run of it ${evening ? formatSpan(evening.startMinutes, evening.endMinutes) : 'after work'}. ` +
      `That is the hour worth deciding about on purpose.`;
  }

  return { blocks, freeMinutes, placedIn, basis, framingText, assumptions };
}
