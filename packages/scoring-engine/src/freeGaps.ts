/**
 * The holes in a booked day.
 *
 * Asking somebody how long they are free works, and it only works when they
 * remember to ask. The moment a meeting is cancelled is the moment most
 * people open something else entirely, so the app that waits to be asked
 * will mostly not be. A calendar it can read turns the same feature from a
 * question into an observation.
 *
 * Deliberately pure. Everything about permissions, platforms and the shape
 * of a device calendar belongs in the caller; this takes busy blocks and
 * gives back the gaps, which is the only part worth testing and the only
 * part that has to be right.
 *
 * It never writes anything. A calendar the app maintains is the manual
 * entry that killed the personal-CRM generation (RESEARCH_NOTES §3);
 * reading one is not the same promise and does not carry the same cost.
 */

export interface BusyBlock {
  startMinutes: number;
  endMinutes: number;
  /** Ignored entirely, and present so a caller can pass its own rows. */
  title?: string;
}

export interface FreeGap {
  startMinutes: number;
  endMinutes: number;
  minutes: number;
}

export interface FreeGapsInput {
  busy: BusyBlock[];
  /** The bounds worth looking inside — usually the working day. */
  fromMinutes: number;
  toMinutes: number;
  /** Shorter than this is not a found hour, it is a corridor. */
  minMinutes?: number;
  /** Minutes already gone. Nothing before it can be spent. */
  nowMinutes?: number;
}

/** Below this a "free window" is the walk between two meetings. */
const MIN_GAP_MINUTES = 20;

/**
 * Merge overlapping and touching blocks.
 *
 * Real calendars double-book constantly — a standup inside a working
 * session, three declined invitations stacked on one hour. Treating those
 * as separate would invent gaps between them that nobody actually has.
 */
function merge(busy: BusyBlock[]): BusyBlock[] {
  const sorted = [...busy]
    .filter((b) => Number.isFinite(b?.startMinutes) && Number.isFinite(b?.endMinutes)
      && b.endMinutes > b.startMinutes)
    .sort((a, b) => a.startMinutes - b.startMinutes);

  const out: BusyBlock[] = [];
  for (const b of sorted) {
    const last = out[out.length - 1];
    if (last && b.startMinutes <= last.endMinutes) {
      last.endMinutes = Math.max(last.endMinutes, b.endMinutes);
    } else {
      out.push({ ...b });
    }
  }
  return out;
}

/**
 * What is left of a window once the meetings are taken out of it.
 *
 * Anything already past is not free time, whatever the calendar says: an
 * hour that was released at nine this morning is not on offer at four in
 * the afternoon, and showing it would be the app failing to know what
 * time it is.
 */
export function freeGaps(input: FreeGapsInput): FreeGap[] {
  const min = input.minMinutes ?? MIN_GAP_MINUTES;
  const from = Math.max(input.fromMinutes, input.nowMinutes ?? input.fromMinutes);
  const to = input.toMinutes;
  if (!(to > from)) return [];

  const gaps: FreeGap[] = [];
  let cursor = from;
  for (const b of merge(input.busy ?? [])) {
    if (b.endMinutes <= cursor) continue;
    if (b.startMinutes >= to) break;
    if (b.startMinutes - cursor >= min) {
      gaps.push({
        startMinutes: cursor,
        endMinutes: b.startMinutes,
        minutes: b.startMinutes - cursor,
      });
    }
    cursor = Math.max(cursor, b.endMinutes);
  }
  if (to - cursor >= min) {
    gaps.push({ startMinutes: cursor, endMinutes: to, minutes: to - cursor });
  }
  return gaps;
}

/**
 * The one worth offering, when there is one.
 *
 * The longest rather than the soonest: a found afternoon is worth more
 * than the twenty minutes before the next call, and offering the nearer
 * scrap first is how a good hour gets spent on an errand.
 */
export function bestGap(gaps: FreeGap[]): FreeGap | null {
  return [...gaps].sort(
    (a, b) => b.minutes - a.minutes || a.startMinutes - b.startMinutes,
  )[0] ?? null;
}
