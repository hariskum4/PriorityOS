/**
 * Time arithmetic — the countable life.
 *
 * Two patterns with documented public resonance:
 *  - "Four Thousand Weeks" (Burkeman) / "Your Life in Weeks" (Urban):
 *    a whole life fits in ~4,000 weeks; seeing lived-vs-ahead moves people.
 *  - Screen-time trades: hours/day × horizon = waking YEARS — always
 *    paired with the reclaim math, never with shame.
 *
 * The "Tail End" activity counts used to live here too, as `booksRemaining`
 * and `tripsRemaining`: pace × years, where the pace came from a chip. They
 * are gone. `countables.ts` does the same arithmetic over a pace the archive
 * actually observed, for rituals this person named, with the people they named
 * them with — which is the same idea with the constant taken out of it. Two
 * fixed categories offered to everyone were the weaker half of a feature that
 * already existed one card below.
 *
 * Invariants as everywhere: planning horizon not lifespan, no zeros,
 * agency counterpart attached, soft rounding.
 */

import { softRound } from './timeReality';
import { yearsToHorizon } from './lifeWindows';

// ---------------------------------------------------------------------------
// Life in weeks
// ---------------------------------------------------------------------------

export interface LifeInWeeks {
  weeksLived: number;
  weeksAhead: number;
  totalWeeks: number;      // ~5,200 on the generous 100-year horizon
  yearsLived: number;
  yearsAhead: number;
  framingText: string;
}

export function lifeInWeeks(age: number): LifeInWeeks {
  const yearsAhead = yearsToHorizon(age);
  const weeksLived = Math.max(Math.round(age * 52.18), 1);
  const weeksAhead = Math.max(Math.round(yearsAhead * 52.18), 52);
  return {
    weeksLived,
    weeksAhead,
    totalWeeks: weeksLived + weeksAhead,
    yearsLived: Math.floor(age),
    yearsAhead,
    framingText:
      `The famous count is four thousand weeks — Priority plans on a longer, kinder horizon. ` +
      `You have ~${softRound(weeksAhead).toLocaleString()} ahead — enough to build almost anything, if they're spent on purpose.`,
  };
}

// ---------------------------------------------------------------------------
// The screen trade — reclaim framing only
// ---------------------------------------------------------------------------

/**
 * Where the daily hours came from.
 *
 * `unknown` is not a rounding case, it is the honest majority case: this
 * number was a `useState(5)` for the entire life of the card, rendered with a
 * selection ring around it, and read back as "at 5h a day" to people who had
 * never been asked. Same rule as sleep on the energy card — where the
 * direction is known and the magnitude is not, say the direction.
 */
export type ScreenBasis = 'stated' | 'unknown';

export interface ScreenTrade {
  basis: ScreenBasis;
  /** Null until they say what a day actually looks like. */
  wakingYearsOnScreens: number | null;
  /**
   * What one hour a day is worth, per year. True of an hour regardless of
   * whose hour it is — this is arithmetic on the offer, not a claim about
   * the reader, so it survives `unknown`.
   */
  reclaimedDaysPerYear: number;
  reclaimedYearsToHorizon: number;
  framingText: string;
  assumptions: string[];
}

const WAKING_HOURS_PER_DAY = 16.5;

export function screenTrade(age: number, hoursPerDay?: number | null): ScreenTrade {
  const years = yearsToHorizon(age);
  const reclaimedDaysPerYear = Math.round((1 * 365) / WAKING_HOURS_PER_DAY); // ≈22 waking days
  const reclaimedYears = Math.round(((years * reclaimedDaysPerYear) / 365) * 10) / 10;
  const reclaimed = {
    reclaimedDaysPerYear,
    reclaimedYearsToHorizon: Math.max(reclaimedYears, 0.1),
  };

  if (hoursPerDay == null || !(hoursPerDay > 0)) {
    return {
      basis: 'unknown',
      wakingYearsOnScreens: null,
      ...reclaimed,
      framingText:
        `One hour a day is ~${reclaimedDaysPerYear} full waking days a year — a family visit, ` +
        `a first draft, a training season. How many of yours go to a screen is the part only ` +
        `you can say. Say it and this stops being a general fact.`,
      assumptions: [
        'No screen figure is assumed for you until you set one',
        'A waking day here is ~16.5 hours',
      ],
    };
  }

  const wakingYears =
    Math.round(((hoursPerDay * 365 * years) / (WAKING_HOURS_PER_DAY * 365)) * 10) / 10;
  return {
    basis: 'stated',
    wakingYearsOnScreens: Math.max(wakingYears, 0.1),
    ...reclaimed,
    framingText:
      `At ${hoursPerDay}h a day, screens take ~${Math.max(wakingYears, 0.1)} waking years of the road ahead. ` +
      `No judgment — some of it is life. But one hour less a day hands you back ` +
      `~${reclaimedDaysPerYear} full waking days a year. That's a family visit, a first draft, a training season. Every year.`,
    assumptions: [
      `Uses the ${hoursPerDay}h a day you set, and a ~16.5-hour waking day`,
      'Nothing here says screens are wasted — it prices the hour so you can choose it',
    ],
  };
}
