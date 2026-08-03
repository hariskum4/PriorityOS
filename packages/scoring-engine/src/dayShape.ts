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

/**
 * Which kind of day this is — the one thing the shape cannot derive.
 *
 * Everything else here comes from facts asked once, and that is deliberate.
 * But a shape that is the same every weekday is a shape that is wrong on the
 * days that matter most: it draws an evening at home for someone in an airport
 * and a commute for someone who has not left the house. This is the smallest
 * possible correction — four words, one tap, true only for today — and it is
 * the difference between a diagram and something that knows what day it is.
 */
export type DayType = 'usual' | 'remote' | 'travel' | 'off';

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
  /**
   * The week, as onboarding already collected it.
   *
   * Used to derive the length of a working day when nobody has said when work
   * starts and stops. Assuming a flat nine-to-five for a person who told us
   * they work sixty hours is the app ignoring an answer it already has — and
   * for someone who said zero it invents a job they do not have.
   */
  workHoursPerWeek?: number | null;
  /** One way, in minutes. Ignored when work is remote. */
  commuteMinutes?: number | null;
  workType?: string | null;
  /** From preferences: quietHoursStart / quietHoursEnd. */
  sleepHour?: number | null;
  wakeHour?: number | null;
  /** False for a rest day: no work, no commute, the whole day is open. */
  isWorkday?: boolean;
  /** What kind of day today is. Defaults to `usual`. */
  dayType?: DayType | null;
  /** The one thing to place, already chosen by the ranking engines. */
  suggestion?: {
    action: string;
    minutes: number;
    domains: string[];
    reason?: string;
  } | null;
  /**
   * When this person actually gets to things, read from what they have
   * finished rather than assumed about people in general.
   *
   * Carries its own provenance because the copy has to be able to say what the
   * claim rests on — an hour asserted without a count behind it is exactly the
   * kind of confident-sounding guess this app is built to avoid. Null until
   * there is enough to say, which is most of the first fortnight.
   */
  activeAt?: {
    /** Minutes from local midnight. */
    minutes: number;
    sampleSize: number;
    days: number;
  } | null;
}

export interface DayShape {
  blocks: DayBlock[];
  /** Waking minutes not already spoken for. */
  freeMinutes: number;
  /** The gap the suggestion went into, if one was placed. */
  placedIn: { startMinutes: number; endMinutes: number } | null;
  /**
   * How the hour was chosen — read from their own record, or the rule about
   * where plans survive. Null when nothing was placed.
   */
  placedBy: 'observed' | 'front-of-gap' | null;
  /** Whether the inputs were real or assumed. Same rule as everywhere. */
  basis: 'stated' | 'assumed';
  /** The kind of day this was drawn for. */
  dayType: DayType;
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
 * The floor a travelling day puts on getting about.
 *
 * Not a claim about anyone's itinerary — it is an admission that a day spent
 * moving has more of itself spoken for than a day spent arriving somewhere at
 * nine. Ninety minutes is the least it can honestly be.
 */
const TRAVEL_TRANSIT_MINUTES = 90;

const DAY_TYPES: readonly string[] = ['usual', 'remote', 'travel', 'off'];

function normalizeDayType(v: unknown): DayType {
  const s = String(v ?? '').toLowerCase();
  return DAY_TYPES.includes(s) ? (s as DayType) : 'usual';
}

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

/**
 * Roomiest first, and on a tie the later one.
 *
 * The tie is not rare — a twelve-hour working day with an hour either side of
 * it produces two gaps of exactly the same size, and a stable sort handed that
 * to the earlier one. Which is how "call your father" came to be proposed for
 * seven in the morning. Absent any evidence about this particular person, the
 * hour before work is the least likely one in the day to be honoured, and the
 * evening is what the whole card is named around. Evidence, when there is any,
 * overrules this anyway.
 */
function roomiest(
  a: { startMinutes: number; endMinutes: number },
  b: { startMinutes: number; endMinutes: number },
): number {
  const size = (b.endMinutes - b.startMinutes) - (a.endMinutes - a.startMinutes);
  return size !== 0 ? size : b.startMinutes - a.startMinutes;
}

function describeGap(minutes: number): string {
  if (minutes >= 2 * HOUR) return `${Math.round((minutes / HOUR) * 10) / 10} hours`;
  return `${Math.round(minutes)} minutes`;
}

/**
 * How long a working day is, when only the week is known.
 *
 * Spread over five days and capped at fourteen hours, because past that the
 * arithmetic stops describing a day and starts describing a spreadsheet. Zero
 * hours means no working day at all, which the shape then draws as free.
 */
function derivedWorkHours(perWeek: number | null | undefined): number | null {
  if (absent(perWeek)) return null;
  const n = Number(perWeek);
  if (n <= 0) return 0;
  return Math.min(Math.max(n / 5, 1), 14);
}

export function dayShape(input: DayShapeInput = {}): DayShape {
  const dayType = normalizeDayType(input.dayType);
  const travelling = dayType === 'travel';
  /* Today's answer outranks the standing one. Someone who normally goes in but
     said they are home today has no commute; someone who normally works from
     home but said they are travelling has more transit than usual, not less. */
  const remote = dayType === 'remote'
    || (dayType === 'usual' && (input.workType ?? '').toLowerCase() === 'remote');

  const stated = input.workStartHour != null && input.workEndHour != null;
  /* Their own week, before any house default. Someone who said sixty hours
     should not be shown a nine-to-five, and someone who said zero should not
     be shown a working day at all. */
  const derivedHours = stated ? null : derivedWorkHours(input.workHoursPerWeek);
  const noWorkAtAll = derivedHours === 0;
  const restDay = dayType === 'off' || input.isWorkday === false;
  const isWorkday = !restDay && !noWorkAtAll;

  const workStart = clampHour(input.workStartHour, ASSUMED.workStart) * HOUR;
  let workEnd = derivedHours != null && derivedHours > 0
    ? workStart + Math.round(derivedHours * HOUR)
    : clampHour(input.workEndHour, ASSUMED.workEnd) * HOUR;
  /* A shift ending before it starts is a night shift, not bad data. */
  if (workEnd <= workStart) workEnd += DAY_MINUTES;

  const stdCommute = clampMinutes(input.commuteMinutes, ASSUMED.commute);
  const commute = remote
    ? 0
    : travelling
      ? Math.max(stdCommute, TRAVEL_TRANSIT_MINUTES)
      : stdCommute;

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
        label: travelling ? 'In transit' : 'Getting there',
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
        label: travelling ? 'Still in transit' : 'Getting home',
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
  // Only into a gap that actually holds it. Proposing an hour into forty
  // minutes is how a plan starts lying on its first day.
  let placedIn: DayShape['placedIn'] = null;
  let placedBy: DayShape['placedBy'] = null;
  const suggestion = input.suggestion ?? null;
  const evening = [...gaps].sort(roomiest)[0];
  const need = suggestion ? Math.max(Math.min(suggestion.minutes, 3 * HOUR), 10) : 0;

  /* A travelling day still has hours in it, and they are still worth seeing.
     What it does not have is a known *where*, so nothing gets planted in them:
     an app that schedules a walk with your mother into a departure lounge has
     stopped describing the reader's life and started describing a template. */
  const roomy = suggestion && !travelling
    ? gaps.filter((g) => g.endMinutes - g.startMinutes >= need)
    : [];

  /* The hour they actually use, brought into this day's coordinates. Gaps run
     forward from waking and may cross midnight, so a reading of 1am belongs at
     the far end of tonight rather than before this morning. */
  const observedAt = (() => {
    const m = input.activeAt?.minutes;
    if (m == null || !Number.isFinite(Number(m))) return null;
    let at = ((Math.floor(Number(m)) % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
    while (at < wake) at += DAY_MINUTES;
    return at;
  })();
  const observedGap = observedAt != null
    ? roomy.find((g) => observedAt >= g.startMinutes && observedAt + need <= g.endMinutes)
    : undefined;

  const chosen = observedGap ?? [...roomy].sort(roomiest)[0];
  const fits = !!chosen;
  /* Within a few minutes of the front of the gap, the front is the answer —
     a "Yours" row eight minutes long is a crumb drawn as an opportunity. */
  const nudged = observedGap && observedAt! - observedGap.startMinutes >= MIN_USEFUL_GAP;
  const startAt = nudged ? observedAt! : chosen?.startMinutes ?? 0;

  const blocks: DayBlock[] = [...bounded];
  for (const g of gaps) {
    if (fits && g === chosen) {
      /* Absent a reading, the suggestion sits at the *start* of the gap:
         anything asked for "later, when there is time" is what gets
         postponed, and the first hour after the fixed blocks end is the one
         that actually exists. A reading beats the rule, because the hour
         somebody has used a dozen times is not a hypothesis. */
      if (startAt > g.startMinutes) {
        blocks.push({
          startMinutes: g.startMinutes,
          endMinutes: startAt,
          kind: 'open',
          label: 'Yours',
        });
      }
      blocks.push({
        startMinutes: startAt,
        endMinutes: startAt + need,
        kind: 'suggested',
        label: suggestion!.action,
        domains: suggestion!.domains,
        note: suggestion!.reason,
      });
      placedIn = { startMinutes: startAt, endMinutes: startAt + need };
      placedBy = nudged ? 'observed' : 'front-of-gap';
      const rest = g.endMinutes - (startAt + need);
      if (rest >= MIN_USEFUL_GAP) {
        blocks.push({
          startMinutes: startAt + need,
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

  const dayTypeNote: Record<DayType, string | null> = {
    usual: null,
    remote: 'You marked today as working from home, so there is no commute in this',
    travel: 'You marked today as travelling, so more of it is spoken for than usual',
    off: 'You marked today as a day off, so no work is drawn into it',
  };

  const workLine = stated
    ? `Built from the hours you gave: work ${formatSpan(workStart, workEnd)}${commute ? `, ${commute} minutes each way` : ''}`
    : noWorkAtAll
      ? 'You said you are not working right now, so nothing here is blocked out for it'
      : derivedHours != null
        ? `Spread from the ~${Math.round(Number(input.workHoursPerWeek))}h week you gave — about ${Math.round(derivedHours)}h a day, guessed to start at ${formatClock(ASSUMED.workStart * HOUR)}. Set the hours if that is wrong`
        : `No work hours set — this assumes ${formatSpan(ASSUMED.workStart * HOUR, ASSUMED.workEnd * HOUR)}`;

  const assumptions = [
    dayTypeNote[dayType],
    /* A rest day has no work hours to explain, and saying where work would
       have gone on a day there is none is noise pretending to be provenance. */
    restDay ? null : workLine,
    placedBy === 'observed' && input.activeAt
      ? `The ${formatClock(startAt)} is not a guess — it is where ${input.activeAt.sampleSize} things you finished across ${input.activeAt.days} days actually landed`
      : null,
    'The shape of a typical working day, not a plan for today — nothing here knows about your meetings',
    'Sleep comes from your quiet hours',
  ].filter((line): line is string => line != null);

  const longest = evening ? evening.endMinutes - evening.startMinutes : 0;

  let framingText: string;
  if (!isWorkday) {
    /* "Nothing here is scheduled" was written when a rest day could not hold a
       suggestion, and it survived into a card that visibly puts one in your
       evening. A day off is now one tap away, so the contradiction went from
       unreachable to the second thing anybody tries. */
    framingText = placedIn
      ? `A day off is ${describeGap(freeMinutes)} of your own. ${need} minutes of it is ` +
        `spoken for here and the rest is not a plan — it is only worth knowing how much ` +
        `there actually is.`
      : `A day off is ${describeGap(freeMinutes)} of your own. Nothing here is scheduled — ` +
        `it is only worth knowing how much there actually is.`;
  } else if (travelling) {
    /* Named as a limit rather than dressed up as a lighter day. The reader
       knows they are travelling; what they need is the app not pretending
       their evening is where it usually is. */
    framingText = longest >= MIN_MEANINGFUL_STRETCH
      ? `Travelling, so this only says how much of the day is left — about ` +
        `${describeGap(longest)} of it in one run, ${formatSpan(evening.startMinutes, evening.endMinutes)}. ` +
        `Nothing is placed in it, because nothing here knows where you will be. ` +
        `It is a good stretch for whatever works down a phone line.`
      : `Travelling, and there is no real stretch left in the day once the getting ` +
        `about is counted. That is worth seeing rather than planning around.`;
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
  } else if (fits && placedIn && placedBy === 'observed') {
    framingText =
      `This is at ${formatClock(startAt)} because that is when you actually get to things — ` +
      `not at the front of the evening, where plans go to be postponed. ` +
      `The stretch runs ${formatSpan(chosen.startMinutes, chosen.endMinutes)} and the rest of it stays yours.`;
  } else if (fits && placedIn) {
    framingText =
      `Your longest free stretch is ${formatSpan(chosen.startMinutes, chosen.endMinutes)} — ` +
      `${describeGap(chosen.endMinutes - chosen.startMinutes)}. The first ${need} minutes of it ` +
      `is enough for this, and the rest stays yours.`;
  } else {
    framingText =
      `About ${describeGap(freeMinutes)} of the day is not already spoken for, ` +
      `the longest run of it ${evening ? formatSpan(evening.startMinutes, evening.endMinutes) : 'after work'}. ` +
      `That is the hour worth deciding about on purpose.`;
  }

  return { blocks, freeMinutes, placedIn, placedBy, basis, dayType, framingText, assumptions };
}
