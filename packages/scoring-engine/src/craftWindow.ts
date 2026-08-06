import { formatRun, formatSpan } from './dayShape';
import { estimateCreativeCompounding } from './timeWindows';

/**
 * The thirty-minute argument, made about a real day.
 *
 * `estimateCreativeCompounding` takes one integer and says "30 minutes, 5 days
 * a week is ~130 hours a year". True, and it says exactly that to a person
 * whose day — as drawn by this same app, on this same screen — has no free
 * half-hour anywhere in it, and the identical sentence to someone with ninety
 * clear minutes after dinner. A calculator that cannot be wrong about anybody
 * is not telling anybody anything.
 *
 * The day was always right there. `dayShape` already returns the open blocks
 * with their minutes and their names, computed a couple of thousand lines
 * above the card that ignored them. So this asks the day first: is there a
 * stretch this would fit in, where, and how long is it. The arithmetic is
 * unchanged — it was never the weak part.
 *
 * When the day cannot hold the ask, it says so and reports what the day
 * *does* hold, rather than repeating a number about a life somebody is not
 * living. That is the same rule the rest of this engine follows: an honest
 * smaller claim beats a confident larger one.
 *
 * ## On naming the craft
 *
 * `craft` is what they already do for themselves, and it is optional. It is
 * deliberately never the *lapsed* list, however much better "enough to get
 * back to the guitar" would read. Onboarding asks "anything you used to do
 * and miss?" under a promise — "Priority will only ever offer it, once" — and
 * a sentence printed on a tab every time it is opened is not once. The list
 * that carries no promise is the one that gets used here.
 */

export interface CraftStretch {
  startMinutes: number;
  endMinutes: number;
  /** How the day card names it — "95 min after work". */
  note?: string;
}

export interface CraftWindowInput {
  /** The day's open blocks, as `dayShape` returns them. */
  stretches?: CraftStretch[];
  minutesPerDay: number;
  daysPerWeek?: number;
  /** Something they already do. Never the lapsed list — see above. */
  craft?: string | null;
}

export interface CraftWindow {
  /** Whether the day, as drawn, has a stretch long enough to hold the ask. */
  fits: boolean;
  /** The stretch it would come out of — the longest one. Null on a full day. */
  from: (CraftStretch & { minutes: number }) | null;
  /** Minutes in the longest open stretch. 0 when the day has none. */
  longestMinutes: number;
  hoursPerYear: number;
  milestone: string;
  /** What the day holds, or plainly that it holds nothing. */
  dayText: string;
  /** The arithmetic, about the minutes the day can actually give. */
  framingText: string;
  /** Minutes the arithmetic was run on — the ask, or what the day allows. */
  minutesUsed: number;
}

/**
 * Whether a day was drawn at all.
 *
 * A screen that has not loaded the profile yet passes no stretches, which is
 * not the same fact as a day with nothing free in it — and saying "nothing in
 * this day is clear" to somebody whose day has not been read would be the app
 * inventing a verdict out of its own loading state.
 */
export function craftWindow(input: CraftWindowInput): CraftWindow {
  const ask = Math.max(1, Math.round(input.minutesPerDay || 0));
  const daysPerWeek = input.daysPerWeek ?? 5;
  const stretches = (input.stretches ?? [])
    .map((b) => ({ ...b, minutes: Math.round(b.endMinutes - b.startMinutes) }))
    .filter((b) => Number.isFinite(b.minutes) && b.minutes > 0);

  const longest = stretches.reduce<(CraftStretch & { minutes: number }) | null>(
    (best, b) => (!best || b.minutes > best.minutes ? b : best),
    null,
  );
  const longestMinutes = longest?.minutes ?? 0;
  const fits = longestMinutes >= ask;

  /* The arithmetic runs on what is available, not on what was asked for.
     Quoting 130 hours a year at somebody whose longest gap is twenty minutes
     is the whole defect this replaces. With no day drawn there is nothing to
     cut the ask down to, so the ask stands and the sentence says so. */
  const minutesUsed = fits || !longest ? ask : longestMinutes;
  const sums = estimateCreativeCompounding(Math.max(1, minutesUsed), daysPerWeek);

  const worth = input.craft?.trim()
    ? `${sums.milestone}, or that much of ${input.craft.trim()}`
    : sums.milestone;

  let dayText: string;
  let framingText: string;

  if (!longest) {
    /* No day drawn, or a day with nothing open in it. Either way there is no
       stretch to point at, so the arithmetic is offered as arithmetic and
       says out loud that it is not about their day. */
    return {
      fits: false,
      from: null,
      longestMinutes: 0,
      hoursPerYear: sums.hoursPerYear,
      milestone: sums.milestone,
      dayText: 'No clear stretch in this day to point at.',
      framingText:
        `${ask} minutes, ${daysPerWeek} days a week is ~${sums.hoursPerYear} hours a year — `
        + `enough for ${worth}. Wherever in the day you find them.`,
      minutesUsed: ask,
    };
  }

  const where = longest.note?.trim()
    /* The note already reads "95 min after work" — the length is in it, so
       repeating it would print the number twice in one line. */
    ? longest.note.trim()
    : `${formatRun(longest.minutes)} clear`;
  const span = formatSpan(longest.startMinutes, longest.endMinutes);

  if (fits) {
    dayText = `Your longest clear stretch: ${where}, ${span}.`;
    framingText =
      `${ask} of those minutes, ${daysPerWeek} days a week, is ~${sums.hoursPerYear} hours a year `
      + `— enough for ${worth}. Not someday. Arithmetic.`;
  } else {
    dayText = `The longest clear stretch in this day is ${formatRun(longest.minutes)} — ${where}, ${span}.`;
    framingText =
      `${ask} a day is not in this day as drawn. The ${formatRun(longest.minutes)} that is there, `
      + `${daysPerWeek} days a week, is ~${sums.hoursPerYear} hours a year — enough for ${worth}.`;
  }

  return {
    fits,
    from: longest,
    longestMinutes,
    hoursPerYear: sums.hoursPerYear,
    milestone: sums.milestone,
    dayText,
    framingText,
    minutesUsed,
  };
}
