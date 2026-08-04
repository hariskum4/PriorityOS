/**
 * The hour a person actually gets to things.
 *
 * The day shape places its one suggestion at the front of the longest free
 * stretch, on the reasoning that anything asked for "later, when there is
 * time" is what gets postponed. That reasoning is sound and the hour it picks
 * is still a guess — a guess about the person, made from a rule about people.
 * Somebody whose evening genuinely starts at nine is told six every day, and
 * an app that keeps proposing an hour its reader has never once used is asking
 * to be ignored.
 *
 * The app already holds the answer. Every finished mission and every ticked
 * rhythm carries the moment it happened. This reads that back.
 *
 * Two limits are worth stating plainly, because the copy built on this must
 * not overstate it:
 *
 *  - It knows when things were **marked**, not when they were done. Someone
 *    who walks at seven and ticks it at ten reads as ten. That is still the
 *    hour they are in the app and reachable, which is what a placement needs.
 *
 *  - It refuses to answer on thin evidence. Below the thresholds here it
 *    returns null and the day shape keeps its honest guess, rather than
 *    dressing three data points up as a pattern.
 */

export interface ActiveHour {
  /** Minutes from local midnight, rounded to the nearest half hour. */
  minutes: number;
  hour: number;
  /** How many finished things this reading stands on. */
  sampleSize: number;
  /** How many distinct days they fall across. */
  days: number;
  /** Share of the weighted sample inside the winning band, 0..1. */
  share: number;
}

const HOUR = 60;
const DAY_MINUTES = 24 * HOUR;

/**
 * Below five completions there is no pattern, only a few afternoons.
 *
 * Deliberately a small number: this is choosing between two reasonable hours,
 * not diagnosing anything, and the cost of being wrong is a suggestion placed
 * an hour off. The stronger guard is the one below it.
 */
const MIN_OBSERVATIONS = 5;

/**
 * Five things finished in one sitting is one occasion, not a habit.
 *
 * A person catching up on a Sunday evening ticks a week of rhythms in four
 * minutes, and without this the app would conclude they do everything at 8pm
 * on the strength of a single Sunday.
 */
const MIN_DISTINCT_DAYS = 3;

/**
 * How concentrated the sample has to be before it is a time of day.
 *
 * Completions scattered evenly across a waking day score about 0.08 here, so
 * this is a real bar. Someone whose life genuinely has no shape gets no claim
 * that it does.
 */
const MIN_SHARE = 0.3;

/** Older than this and it describes a life that has since changed. */
const LOOKBACK_DAYS = 120;

/** Enough to see a pattern; recent enough that a new one can overtake an old. */
const MAX_SAMPLE = 80;

function toDate(v: unknown): Date | null {
  if (v == null || v === '') return null;
  const d = v instanceof Date ? v : new Date(v as string | number);
  return Number.isFinite(d.getTime()) ? d : null;
}

/** Local, not UTC: 11pm on the 3rd and 1am on the 4th are two days here. */
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** A difference in minutes brought into (-720, 720] — the short way round. */
function wrap(delta: number): number {
  let d = ((delta % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
  if (d > DAY_MINUTES / 2) d -= DAY_MINUTES;
  return d;
}

/**
 * The same reading, per thing rather than for the whole life.
 *
 * One hour for everything is right for "when is this person reachable" and
 * wrong for "when does this person walk" — a morning run and a call to a
 * parent have different homes, and pooling them reports an afternoon that
 * belongs to neither. Each group is held to exactly the same thresholds, so
 * a rhythm with a thin history simply returns null and the caller falls back
 * to the pooled reading or to the shape's own rule.
 */
export function activeHourByKey(
  groups: Record<string, Array<string | number | Date | null | undefined>>,
  now: Date = new Date(),
): Record<string, ActiveHour> {
  const out: Record<string, ActiveHour> = {};
  for (const [key, times] of Object.entries(groups ?? {})) {
    const reading = activeHour(times, now);
    if (reading) out[key] = reading;
  }
  return out;
}

export function activeHour(
  times: Array<string | number | Date | null | undefined>,
  now: Date = new Date(),
): ActiveHour | null {
  const floor = now.getTime() - LOOKBACK_DAYS * 86_400_000;
  /* A day's grace on the ceiling: a device an hour ahead of the server should
     not silently drop everything finished this morning. */
  const ceiling = now.getTime() + 86_400_000;

  const sample = (times ?? [])
    .map(toDate)
    .filter((d): d is Date => d != null && d.getTime() >= floor && d.getTime() <= ceiling)
    .sort((a, b) => b.getTime() - a.getTime())
    .slice(0, MAX_SAMPLE);

  if (sample.length < MIN_OBSERVATIONS) return null;

  const days = new Set(sample.map(dayKey)).size;
  if (days < MIN_DISTINCT_DAYS) return null;

  const minutes = sample.map((d) => d.getHours() * HOUR + d.getMinutes());

  /* Each completion counts fully for its own hour and half for the two either
     side, so 8:55 and 9:05 read as the same time of day rather than as two
     unrelated hours — which is what a plain histogram would say. */
  const weight = new Array<number>(24).fill(0);
  for (const m of minutes) {
    const h = Math.floor(m / HOUR) % 24;
    weight[h] += 1;
    weight[(h + 23) % 24] += 0.5;
    weight[(h + 1) % 24] += 0.5;
  }

  let best = 0;
  for (let h = 1; h < 24; h++) if (weight[h] > weight[best]) best = h;

  /* Every completion contributes 2 in total, so this is a share of the sample
     and not of some arbitrary scale. Ties go to the earlier hour, which keeps
     the whole function deterministic. */
  const share = weight[best] / (sample.length * 2);
  if (share < MIN_SHARE) return null;

  /* Then the middle of that band, so a cluster sitting at twenty past does not
     get reported as the top of the hour. Unwrapped around the winning hour
     first — otherwise 11:50pm and 12:10am average to midday. */
  const centre = best * HOUR;
  const inBand = minutes.map((m) => wrap(m - centre)).filter((o) => Math.abs(o) <= HOUR);
  const mean = centre + inBand.reduce((n, o) => n + o, 0) / inBand.length;
  const rounded = ((Math.round(mean / 30) * 30) % DAY_MINUTES + DAY_MINUTES) % DAY_MINUTES;

  return {
    minutes: rounded,
    hour: Math.floor(rounded / HOUR),
    sampleSize: sample.length,
    days,
    share: Math.round(share * 100) / 100,
  };
}
