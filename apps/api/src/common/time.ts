/**
 * Day boundaries belong to the person, not to the server.
 *
 * Every "today" in this app used `new Date(); setHours(0,0,0,0)` — the day as
 * the machine in the datacentre experiences it. For a user in Bengaluru on a
 * server in Oregon that is wrong by twelve and a half hours: an act logged at
 * 09:00 IST files under yesterday, a habit done this morning does not count,
 * a streak breaks that was never broken.
 *
 * That matters more here than in most apps, because this record is meant to
 * be read in forty years. A misfiled act is not a glitch that clears on
 * refresh — it is a permanent, unverifiable error in someone's history. And
 * it gets worse the moment they move country, which over a life they will.
 *
 * These helpers take the user's own zone. No dependency: `Intl` has carried
 * the IANA database since Node 14.
 */

/** Milliseconds to add to a UTC instant to read it as wall-clock in `tz`. */
function offsetMs(tz: string, at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(at);

  const f: Record<string, number> = {};
  for (const p of parts) if (p.type !== 'literal') f[p.type] = Number(p.value);

  const asIfUtc = Date.UTC(
    f.year, f.month - 1, f.day,
    f.hour % 24, f.minute, f.second,
  );
  return asIfUtc - at.getTime();
}

/**
 * Falls back to UTC rather than to the server's zone. An unknown zone should
 * degrade to something stable and explainable, not to wherever we happen to
 * be hosting this month.
 */
function safeZone(tz?: string | null): string {
  if (!tz) return 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return tz;
  } catch {
    return 'UTC';
  }
}

/** The user's calendar date as numbers, in their zone. */
function localParts(zone: string, at: Date): { y: number; m: number; d: number } {
  const [y, m, d] = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(at).split('-').map(Number);
  return { y, m, d };
}

/**
 * The instant when a given local calendar date began.
 *
 * Two passes: guess using the offset at that date, then re-measure at the
 * candidate, because the offset can differ across a DST boundary. The one case
 * this cannot represent is a zone that skips midnight itself (Cuba, Chile in
 * some years) — there the day starts at 01:00 local and the second pass lands
 * on that hour, which is the closest true answer available.
 */
function instantOfLocalMidnight(zone: string, y: number, m: number, d: number): Date {
  const wall = Date.UTC(y, m - 1, d);
  const first = offsetMs(zone, new Date(wall));
  const candidate = wall - first;
  const second = offsetMs(zone, new Date(candidate));
  return new Date(second === first ? candidate : wall - second);
}

/** The instant at which the user's day began. */
export function startOfDayIn(tz: string | null | undefined, at: Date = new Date()): Date {
  const zone = safeZone(tz);
  const { y, m, d } = localParts(zone, at);
  return instantOfLocalMidnight(zone, y, m, d);
}

/** The user's calendar day as YYYY-MM-DD — the right key for a day cache. */
export function dayKeyIn(tz: string | null | undefined, at: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: safeZone(tz),
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(at);
}

/**
 * Start of the user's week. Monday by default: this product's weekly review
 * is a working ritual, and a week that starts on Sunday splits the weekend
 * across two reviews.
 */
export function startOfWeekIn(
  tz: string | null | undefined,
  at: Date = new Date(),
  weekStartsOn = 1,
): Date {
  const zone = safeZone(tz);
  const { y, m, d } = localParts(zone, at);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return shiftDays(zone, y, m, d, -((dow - weekStartsOn + 7) % 7));
}

/**
 * N days before the start of the user's today.
 *
 * Counted on the calendar, not in milliseconds. Subtracting 7 × 86,400,000 ms
 * from a local midnight lands at 23:00 the day before whenever a DST boundary
 * falls in between, which silently shifts a whole week of results by one day —
 * a test caught exactly that here.
 */
export function daysAgoIn(
  tz: string | null | undefined,
  days: number,
  at: Date = new Date(),
): Date {
  const zone = safeZone(tz);
  const { y, m, d } = localParts(zone, at);
  return shiftDays(zone, y, m, d, -days);
}

function shiftDays(zone: string, y: number, m: number, d: number, delta: number): Date {
  const moved = new Date(Date.UTC(y, m - 1, d + delta));
  return instantOfLocalMidnight(
    zone, moved.getUTCFullYear(), moved.getUTCMonth() + 1, moved.getUTCDate(),
  );
}
