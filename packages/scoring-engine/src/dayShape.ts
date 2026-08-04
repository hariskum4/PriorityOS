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

import { lifeShape } from './lifeShape';

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
  /** Domains this block feeds. Only a suggestion or a boundary has any. */
  domains?: string[];
  /** Why this block is here, when it is worth saying. */
  note?: string;
}

export interface DaySuggestion {
  /** Stable identity, so a nudge survives a rewording. Falls back to action. */
  key?: string;
  action: string;
  minutes: number;
  domains: string[];
  reason?: string;
  /**
   * The minute of the day this one wants, when something knows better than
   * the front-of-the-gap rule — the hour this rhythm is observed to happen
   * at, or the part of the day the activity belongs to. Honoured only if a
   * free stretch has room around it; otherwise the ordinary rule applies.
   */
  at?: number | null;
}

/**
 * Something that happens at the edge of the day rather than inside it.
 *
 * A bedtime is the whole of this category so far, and it is here because it
 * was tried the other way: as an ordinary suggestion with five minutes on it,
 * which the shape dutifully placed in the free evening and drew as a block of
 * sleep at seven o'clock. The error was not the hour. A suggestion is a claim
 * on some of the time a person has left; a boundary is a claim about where
 * that time stops, and it costs none of it.
 *
 * So these are never placed, never counted into `committedMinutes`, and never
 * mentioned in the framing line — but they are not dropped either. They are
 * drawn on the sleep block, which is the only row on the card where a bedtime
 * means anything.
 */
export interface DayBoundary {
  key?: string;
  action: string;
  domains?: string[];
  reason?: string;
}

/** One thing, on the clock, with a record of how it got there. */
export interface Placement {
  startMinutes: number;
  endMinutes: number;
  key: string;
  action: string;
  domains: string[];
  reason?: string;
  /** Read from their own record, or the rule about where plans survive. */
  placedBy: 'observed' | 'preferred' | 'front-of-gap';
  /** How far the reader moved it from where the shape put it. */
  nudgedBy: number;
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
  /**
   * Time that was spoken for and is not any more — a cancelled meeting.
   *
   * Cut out of the fixed blocks rather than added to the free ones, so a
   * two-hour hole in the middle of the working day becomes what it really
   * is: an ordinary gap, splitting work either side of it, that the rest
   * of this function can place into without knowing why it appeared.
   *
   * The shape stays a typical day everywhere else. This is the one place
   * it is told about today in particular, and only because the reader
   * said so.
   */
  freed?: Array<{ startMinutes: number; endMinutes: number }> | null;
  /** The one thing to place, already chosen by the ranking engines. */
  suggestion?: DaySuggestion | null;
  /**
   * More than one, in the order the ranker put them.
   *
   * A day off is fifteen hours, and offering one fifteen-minute thing into it
   * was the single-thing rule applied where it does not belong. That rule
   * comes from choice overload and it is right for the dashboard, where the
   * question is "what now" — on a day with nothing in it the question is
   * different, and answering it with 0.2% of the available time is not
   * restraint, it is the card having nothing to say.
   *
   * How many actually land is decided by how much room there is; see
   * `capacityFor`. Whatever happens, most of the day stays theirs.
   */
  suggestions?: DaySuggestion[] | null;
  /**
   * Standing commitments that sit at the day's edge; see `DayBoundary`.
   *
   * Kept apart from `suggestions` rather than filtered out of them, so that
   * nothing downstream has to know the rule. A caller that hands a bedtime to
   * `suggestions` still gets it placed in the evening, which is the bug — the
   * separation is what makes the right thing the easy thing.
   */
  boundaries?: DayBoundary[] | null;
  /**
   * How far the reader has moved a placement, in minutes, keyed by its `key`
   * or its action.
   *
   * The shape puts things where the evidence says they go, and the reader is
   * the authority on their own Tuesday. A nudge big enough to reach another
   * free stretch moves it there; one that would push it into work or sleep is
   * clamped rather than refused, because a control that silently does nothing
   * is worse than one that stops at the edge.
   */
  nudges?: Record<string, number> | null;
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
  /** Everything that landed, in clock order. */
  placements: Placement[];
  /** The first of them, kept for callers that only ever wanted one. */
  placedIn: { startMinutes: number; endMinutes: number } | null;
  /** Minutes of the free time now spoken for. Always a minority of it. */
  committedMinutes: number;
  /**
   * How the hour was chosen — read from their own record, asked for by the
   * thing itself, or the rule about where plans survive. Null when nothing
   * was placed.
   */
  placedBy: 'observed' | 'preferred' | 'front-of-gap' | null;
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

/**
 * How many things a day can hold before it stops being a shape and becomes an
 * agenda.
 *
 * The one-thing rule is right where it came from — the dashboard, answering
 * "what now", where a list is choice overload (RESEARCH_NOTES §2). It was
 * being applied to a day off with fifteen hours in it, where one fifteen-minute
 * item is not restraint but an empty card. So the count follows the room.
 *
 * The ceiling is three whatever the arithmetic says. A free Saturday can hold
 * six things and a person who is shown six will do none of them.
 */
function capacityFor(freeMinutes: number): number {
  if (freeMinutes < 5 * HOUR) return 1;
  if (freeMinutes < 8 * HOUR) return 2;
  return 3;
}

/**
 * The most of a free day this may ever claim.
 *
 * Half, and it is a ceiling rather than a target. The promise the card makes
 * in its own copy — "the rest stays yours" — has to be true on the day with
 * the most to lose, which is the day someone has finally cleared.
 */
const MAX_SHARE_OF_FREE = 0.5;

/**
 * How far apart two placed things sit.
 *
 * A fixed half hour was right for the one case it was written for and wrong
 * for the one that mattered: three things on a fifteen-hour day off queued up
 * at 7am, 7:45am and 8:25am, leaving twelve untouched hours below them. Nobody
 * plans a free Saturday that way, and a card that does has not understood what
 * a free Saturday is.
 *
 * So the separation comes from the room. Divided by one more than the number
 * of things, which spreads them across the day rather than stacking them at
 * one end of it, and bounded so that neither a packed evening nor a fortnight
 * of leave produces something absurd.
 */
function spacingFor(freeMinutes: number, capacity: number): number {
  return Math.min(Math.max(Math.round(freeMinutes / (capacity + 1)), 30), 4 * HOUR);
}

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

/** "One thing is" / "3 things are" — so the sentence around it can agree. */
function countThings(n: number): string {
  return n === 1 ? 'One thing is' : `${n} things are`;
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
  /* The block is the same shape either way — hours that are spoken for — but
     calling a homemaker's day "Work" is the card describing a job she does
     not have, one word at a time. */
  const careWork = lifeShape(input.workType).careWorkIsWork;

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
      label: careWork ? 'The household' : 'Work',
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

  /**
   * Cut the freed time out of whatever claimed it.
   *
   * A block the hole sits inside becomes two, one either side; a block the
   * hole covers entirely disappears. Everything downstream then treats the
   * result as an ordinary day that simply has less work in it, which is
   * exactly what a cancelled meeting makes true.
   */
  const freed = (input.freed ?? []).filter(
    (f) => Number.isFinite(f?.startMinutes) && Number.isFinite(f?.endMinutes)
      && f.endMinutes > f.startMinutes,
  );
  const carved = freed.reduce<DayBlock[]>((blocks, hole) => blocks.flatMap((b) => {
    if (hole.endMinutes <= b.startMinutes || hole.startMinutes >= b.endMinutes) return [b];
    const left = hole.startMinutes > b.startMinutes
      ? [{ ...b, endMinutes: hole.startMinutes }] : [];
    const right = hole.endMinutes < b.endMinutes
      ? [{ ...b, startMinutes: hole.endMinutes }] : [];
    return [...left, ...right];
  }), fixed);

  const bounded = carved
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

  // ---- place things ------------------------------------------------------
  //
  // Only into room that actually holds them. Proposing an hour into forty
  // minutes is how a plan starts lying on its first day.
  const evening = [...gaps].sort(roomiest)[0];

  /* A travelling day still has hours in it, and they are still worth seeing.
     What it does not have is a known *where*, so nothing gets planted in them:
     an app that schedules a walk with your mother into a departure lounge has
     stopped describing the reader's life and started describing a template. */
  const wanted: DaySuggestion[] = travelling
    ? []
    : (input.suggestions?.length ? input.suggestions : [input.suggestion])
      .filter((s): s is DaySuggestion => !!s && typeof s.action === 'string' && !!s.action.trim());

  /* The hour they actually use, brought into this day's coordinates. Gaps run
     forward from waking and may cross midnight, so a reading of 1am belongs at
     the far end of tonight rather than before this morning. */
  const normalizeAt = (m: unknown): number | null => {
    if (m == null || !Number.isFinite(Number(m))) return null;
    let at = ((Math.floor(Number(m)) % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
    while (at < wake) at += DAY_MINUTES;
    return at;
  };
  const observedAt = normalizeAt(input.activeAt?.minutes);

  const capacity = capacityFor(freeMinutes);
  const spacing = spacingFor(freeMinutes, capacity);
  const ceiling = freeMinutes * MAX_SHARE_OF_FREE;
  const nudges = input.nudges ?? {};

  /* What is still available, shrunk as things land. Separate from `gaps`,
     which stays the truth about the day and is what `freeMinutes` reports —
     breathing room between two placements is not time taken away from the
     reader, it is only time this function will not put anything else into. */
  let open = gaps.map((g) => ({ ...g }));
  const placements: Placement[] = [];
  let committedMinutes = 0;

  for (const s of wanted) {
    if (placements.length >= capacity) break;
    const need = Math.max(Math.min(Number(s.minutes) || 0, 3 * HOUR), 10);
    if (placements.length && committedMinutes + need > ceiling) break;

    const roomy = open.filter((g) => g.endMinutes - g.startMinutes >= need);
    if (!roomy.length) break;

    /* Absent a reading, a thing sits at the *start* of the roomiest stretch
       left: anything asked for "later, when there is time" is what gets
       postponed, and the first hour after the fixed blocks end is the one that
       actually exists.

       A reading beats the rule, because the hour somebody has used a dozen
       times is not a hypothesis. Two kinds of reading, in order: the hour
       this particular thing asked for — the hour it is observed to happen at,
       or the part of the day it belongs to — and then the pooled reading of
       when this person acts at all. The pooled one still goes to the first
       placement only, since it is a claim about when they get to things and
       not about how many times a day they do. */
    const own = normalizeAt(s.at);
    const wantAt = own ?? (!placements.length ? observedAt : null);
    const wantRoom = wantAt != null
      ? roomy.find((g) => wantAt >= g.startMinutes && wantAt + need <= g.endMinutes)
      : undefined;
    let host = wantRoom ?? [...roomy].sort(roomiest)[0];
    let startAt = wantRoom ? wantAt! : host.startMinutes;
    let placedBy: Placement['placedBy'] = wantRoom
      ? (own != null ? 'preferred' : 'observed')
      : 'front-of-gap';

    /* Within a few minutes of the front, the front is the answer — a "Yours"
       row eight minutes long is a crumb drawn as an opportunity.

       Never against an hour the thing actually asked for, though. A rhythm
       moved to 7:15 in a stretch beginning at 7 would be tidied back to 7
       and the reader would press "later" and watch nothing move — which is
       the same failure as the nudge that silently clamped, arrived at from
       the other direction. A stated hour is worth more than a tidy edge. */
    if (own == null && startAt - host.startMinutes < MIN_USEFUL_GAP) {
      startAt = host.startMinutes;
      placedBy = 'front-of-gap';
    }

    /* Then the reader's own correction. A nudge large enough to reach another
       free stretch moves it there rather than stopping at the edge of this
       one; the day is theirs, and "later" sometimes means after work. */
    const key = (s.key ?? s.action).trim();
    /**
     * Where it would have gone unaided, kept before anything moves it.
     *
     * `nudgedBy` used to be measured against `host.startMinutes` *after* the
     * host had been reassigned, so a move that reached another free stretch
     * reported its offset within the new one. The number is the caller's only
     * way to ask "where is this actually sitting" — and a caller that adds its
     * next step to a wrong answer walks the thing somewhere neither of them
     * intended.
     */
    const naturalStart = startAt;
    const shift = Math.round(Number(nudges[key]) || 0);
    let nudgedBy = 0;
    if (shift) {
      const target = naturalStart + shift;
      const reachable = roomy.find(
        (g) => target >= g.startMinutes && target + need <= g.endMinutes,
      );
      if (reachable) {
        host = reachable;
        startAt = target;
      } else {
        startAt = Math.min(Math.max(target, host.startMinutes), host.endMinutes - need);
      }
      nudgedBy = startAt - naturalStart;
      if (nudgedBy !== 0) placedBy = 'front-of-gap';
    }

    placements.push({
      startMinutes: startAt,
      endMinutes: startAt + need,
      key,
      action: s.action,
      domains: Array.isArray(s.domains) ? s.domains : [],
      reason: s.reason,
      placedBy,
      nudgedBy,
    });
    committedMinutes += need;

    /* Carve it out, with breathing room either side, so the next thing does
       not land against it and the day reads as a day rather than a schedule. */
    const from = startAt - spacing;
    const to = startAt + need + spacing;
    open = open.flatMap((g) => {
      if (to <= g.startMinutes || from >= g.endMinutes) return [g];
      const parts: Array<{ startMinutes: number; endMinutes: number }> = [];
      if (from - g.startMinutes >= MIN_USEFUL_GAP) {
        parts.push({ startMinutes: g.startMinutes, endMinutes: from });
      }
      if (g.endMinutes - to >= MIN_USEFUL_GAP) {
        parts.push({ startMinutes: to, endMinutes: g.endMinutes });
      }
      return parts;
    });
  }

  placements.sort((a, b) => a.startMinutes - b.startMinutes);
  const placedIn = placements.length
    ? { startMinutes: placements[0].startMinutes, endMinutes: placements[0].endMinutes }
    : null;
  const placedBy: DayShape['placedBy'] = placements.length ? placements[0].placedBy : null;
  const fits = placements.length > 0;

  // ---- draw it -----------------------------------------------------------
  //
  // Free time is whatever the gaps hold minus whatever landed in them. Every
  // remainder is drawn however small: a hole in the middle of a column of
  // times reads as a rendering fault, and the reader has no way to know that
  // the four minutes between two things were deliberately not mentioned.
  const blocks: DayBlock[] = [...bounded];
  for (const p of placements) {
    blocks.push({
      startMinutes: p.startMinutes,
      endMinutes: p.endMinutes,
      kind: 'suggested',
      label: p.action,
      domains: p.domains,
      note: p.reason,
    });
  }
  for (const g of gaps) {
    const inside = placements
      .filter((p) => p.startMinutes >= g.startMinutes && p.endMinutes <= g.endMinutes);
    let at = g.startMinutes;
    for (const p of inside) {
      if (p.startMinutes > at) {
        blocks.push({ startMinutes: at, endMinutes: p.startMinutes, kind: 'open', label: 'Yours' });
      }
      at = p.endMinutes;
    }
    if (g.endMinutes > at) {
      blocks.push({ startMinutes: at, endMinutes: g.endMinutes, kind: 'open', label: 'Yours' });
    }
  }

  /* The edge of the day, and whatever the reader has committed to about it.
     A bedtime read against a sleep block starting at ten reads as the one
     true thing on that row: the hour is already on the screen, so the note
     only has to say what is being kept and why it is worth keeping. */
  const edge = (input.boundaries ?? []).filter(
    (b): b is DayBoundary => !!b && typeof b.action === 'string' && !!b.action.trim(),
  );
  blocks.push({
    startMinutes: sleep,
    endMinutes: wake + DAY_MINUTES,
    kind: 'sleep',
    label: 'Sleep',
    ...(edge.length
      ? {
        domains: [...new Set(edge.flatMap((b) => b.domains ?? []))],
        /* One gets its reason; several get only their names. Two "because"
           lines stacked under a dimmed row stop being a reason and start
           being a wall of text at the bottom of somebody's day. */
        note: edge.length === 1 && edge[0].reason?.trim()
          ? `${edge[0].action.trim()} — ${edge[0].reason.trim()}`
          : edge.map((b) => b.action.trim()).join(' · '),
      }
      : {}),
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

  const claimed = careWork ? 'the household day' : 'work';
  const workLine = stated
    ? `Built from the hours you gave: ${claimed} ${formatSpan(workStart, workEnd)}${commute ? `, ${commute} minutes each way` : ''}`
    : noWorkAtAll
      ? 'You said you are not working right now, so nothing here is blocked out for it'
      : derivedHours != null
        ? `Spread from the ~${Math.round(Number(input.workHoursPerWeek))}h ${careWork ? 'the household takes' : 'week you gave'} — about ${Math.round(derivedHours)}h a day, guessed to start at ${formatClock(ASSUMED.workStart * HOUR)}. Set the hours if that is wrong`
        : `No work hours set — this assumes ${formatSpan(ASSUMED.workStart * HOUR, ASSUMED.workEnd * HOUR)}`;

  const assumptions = [
    dayTypeNote[dayType],
    /* A rest day has no work hours to explain, and saying where work would
       have gone on a day there is none is noise pretending to be provenance. */
    restDay ? null : workLine,
    placedBy === 'observed' && input.activeAt && placedIn
      ? `The ${formatClock(placedIn.startMinutes)} is not a guess — it is where ${input.activeAt.sampleSize} things you finished across ${input.activeAt.days} days actually landed`
      : null,
    placements.some((p) => p.nudgedBy !== 0)
      ? 'You moved something here, so that is where it stays for today'
      : null,
    'The shape of a typical working day, not a plan for today — nothing here knows about your meetings',
    'Sleep comes from your quiet hours',
  ].filter((line): line is string => line != null);

  const longest = evening ? evening.endMinutes - evening.startMinutes : 0;

  /**
   * The stretch the single placement actually sits in.
   *
   * The framing used to describe the roomiest gap whatever happened, which
   * was harmless while everything landed there — a thing with no opinion
   * goes to the roomiest stretch by definition. A rhythm that asks for a
   * morning does not, and "your longest free stretch is 6pm–11pm, 40 minutes
   * of it is enough for this" printed under something sitting at 7am
   * describes a different day than the one drawn above it.
   */
  const hosting = (placedIn && gaps.find(
    (g) => placedIn.startMinutes >= g.startMinutes && placedIn.startMinutes < g.endMinutes,
  )) || evening;

  let framingText: string;
  if (!isWorkday) {
    /* "Nothing here is scheduled" was written when a rest day could not hold a
       suggestion, and it survived into a card that visibly puts one in your
       evening. A day off is now one tap away, so the contradiction went from
       unreachable to the second thing anybody tries. */
    framingText = placements.length
      ? `A day off is ${describeGap(freeMinutes)} of your own. ` +
        `${countThings(placements.length)} pencilled into ${describeGap(committedMinutes)} ` +
        `of it — move ${placements.length === 1 ? 'it' : 'them'} or ignore ` +
        `${placements.length === 1 ? 'it' : 'them'}; the rest is not a plan.`
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
      ? `Between ${careWork ? 'the day ending' : 'getting home'} and sleeping there is nothing left at all. That is worth ` +
        `seeing plainly: it is a scheduling problem, not a discipline one.`
      : `The longest unbroken stretch in this day is ${describeGap(longest)}. Adding up to ` +
        `${describeGap(freeMinutes)} across the day does not make it an hour you could ` +
        `spend with someone — it is a scheduling problem, not a discipline one.`;
  } else if (placements.length > 1) {
    framingText =
      `${countThings(placements.length)} pencilled into ${describeGap(committedMinutes)} of the ` +
      `${describeGap(freeMinutes)} you have left, starting ` +
      `${formatClock(placements[0].startMinutes)}. Move them to where they belong — ` +
      `the rest stays yours either way.`;
  } else if (fits && placedBy === 'observed') {
    framingText =
      `This is at ${formatClock(placedIn!.startMinutes)} because that is when you actually get to ` +
      `things — not at the front of the evening, where plans go to be postponed. ` +
      `The stretch runs ${formatSpan(hosting.startMinutes, hosting.endMinutes)} and the rest of it stays yours.`;
  } else if (fits && placedBy === 'preferred') {
    framingText =
      `This sits at ${formatClock(placedIn!.startMinutes)} because that is the part of the day it ` +
      `belongs to, and there is room for it there. The stretch runs ` +
      `${formatSpan(hosting.startMinutes, hosting.endMinutes)} — move it if the hour is wrong.`;
  } else if (fits) {
    framingText =
      `Your longest free stretch is ${formatSpan(hosting.startMinutes, hosting.endMinutes)} — ` +
      `${describeGap(hosting.endMinutes - hosting.startMinutes)}. ` +
      `${describeGap(committedMinutes)} of it is enough for this, and the rest stays yours.`;
  } else {
    framingText =
      `About ${describeGap(freeMinutes)} of the day is not already spoken for, ` +
      `the longest run of it ${evening ? formatSpan(evening.startMinutes, evening.endMinutes) : 'after work'}. ` +
      `That is the hour worth deciding about on purpose.`;
  }

  return {
    blocks, freeMinutes, placements, placedIn, committedMinutes,
    placedBy, basis, dayType, framingText, assumptions,
  };
}
