/**
 * Time arithmetic — the countable life.
 *
 * Three patterns with documented public resonance:
 *  - "Four Thousand Weeks" (Burkeman) / "Your Life in Weeks" (Urban):
 *    a whole life fits in ~4,000 weeks; seeing lived-vs-ahead moves people.
 *  - "The Tail End" activity counts: pace × remaining years turns vague
 *    "plenty of time" into "~300 more books, choose accordingly."
 *  - Screen-time trades: hours/day × horizon = waking YEARS — always
 *    paired with the reclaim math, never with shame.
 *
 * Invariants as everywhere: planning horizon not lifespan, no zeros,
 * agency counterpart attached, soft rounding.
 */

import { softRound } from './timeReality';
import { yearsToHorizon, PLANNING_HORIZON_AGE } from './lifeWindows';

// ---------------------------------------------------------------------------
// Life in weeks
// ---------------------------------------------------------------------------

export interface LifeInWeeks {
  weeksLived: number;
  weeksAhead: number;
  totalWeeks: number;      // ~4,160 for the 80-year horizon — "the 4,000"
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
      `A whole life is about four thousand weeks. You have ~${softRound(weeksAhead).toLocaleString()} ` +
      `of them ahead — enough to build almost anything, if they're spent on purpose.`,
  };
}

// ---------------------------------------------------------------------------
// Activity counts — The Tail End pattern
// ---------------------------------------------------------------------------

export interface ActivityCount {
  remaining: number;
  upliftRemaining: number;
  framingText: string;
}

export function booksRemaining(age: number, booksPerYear: number): ActivityCount {
  const years = yearsToHorizon(age);
  const remaining = Math.max(softRound(booksPerYear * years), 1);
  const uplift = Math.max(softRound((booksPerYear + 12) * years), remaining);
  return {
    remaining,
    upliftRemaining: uplift,
    framingText:
      `~${remaining} more books at your pace. Choose them like they're numbered — they are. ` +
      `One more book a month makes it ~${uplift}.`,
  };
}

export function tripsRemaining(age: number, tripsPerYear: number): ActivityCount {
  const years = yearsToHorizon(age);
  const remaining = Math.max(softRound(tripsPerYear * years), 1);
  const uplift = Math.max(softRound((tripsPerYear + 1) * years), remaining);
  return {
    remaining,
    upliftRemaining: uplift,
    framingText:
      `~${remaining} more real trips at your pace — and the rough-travel window is shorter ` +
      `than the list. One more trip a year makes it ~${uplift}.`,
  };
}

/**
 * User-defined counts — the deepest Tail End cut: not our presets but
 * THEIR ritual ("ocean swims", "Diwalis at home", "treks with Arjun")
 * at THEIR pace. Personal counts are the ones that change behavior.
 */
export function customCountRemaining(
  age: number,
  label: string,
  timesPerYear: number,
): ActivityCount {
  const years = yearsToHorizon(age);
  const remaining = Math.max(softRound(timesPerYear * years), 1);
  const uplift = Math.max(softRound((timesPerYear + 1) * years), remaining);
  return {
    remaining,
    upliftRemaining: uplift,
    framingText:
      `~${remaining} more ${label} at your current pace. ` +
      `Once more a year makes it ~${uplift} — that lever is yours.`,
  };
}

export interface AnnualMoments {
  summers: number;
  birthdays: number;
  fullMoons: number;
}

export function annualMoments(age: number): AnnualMoments {
  const years = yearsToHorizon(age);
  return {
    summers: years,
    birthdays: years,
    fullMoons: softRound(years * 12.4),
  };
}

// ---------------------------------------------------------------------------
// The screen trade — reclaim framing only
// ---------------------------------------------------------------------------

export interface ScreenTrade {
  wakingYearsOnScreens: number;   // at current pace, to the horizon
  reclaimedDaysPerYear: number;   // for one hour less per day
  reclaimedYearsToHorizon: number;
  framingText: string;
  assumptions: string[];
}

const WAKING_HOURS_PER_DAY = 16.5;

export function screenTrade(age: number, hoursPerDay: number): ScreenTrade {
  const years = yearsToHorizon(age);
  const wakingYears =
    Math.round(((hoursPerDay * 365 * years) / (WAKING_HOURS_PER_DAY * 365)) * 10) / 10;
  const reclaimedDaysPerYear = Math.round((1 * 365) / WAKING_HOURS_PER_DAY); // ≈22 waking days
  const reclaimedYears = Math.round((years * reclaimedDaysPerYear / 365) * 10) / 10;
  return {
    wakingYearsOnScreens: Math.max(wakingYears, 0.1),
    reclaimedDaysPerYear,
    reclaimedYearsToHorizon: Math.max(reclaimedYears, 0.1),
    framingText:
      `At ${hoursPerDay}h a day, screens take ~${Math.max(wakingYears, 0.1)} waking years of the road ahead. ` +
      `No judgment — some of it is life. But one hour less a day hands you back ` +
      `~${reclaimedDaysPerYear} full waking days a year. That's a family visit, a first draft, a training season. Every year.`,
    assumptions: [
      'Uses your stated daily screen hours and a ~16.5-hour waking day',
      'Nothing here says screens are wasted — it prices the hour so you can choose it',
    ],
  };
}
