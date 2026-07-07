/**
 * Forgiving streaks + XP.
 *
 * Research: rigid daily streaks trigger the "what-the-hell effect" —
 * one miss and users abandon the app entirely. Priority streaks are
 * frequency-based (did you hit this week's target?) and one missed
 * period consumes a grace token instead of resetting.
 */

export interface StreakState {
  current: number;        // consecutive periods hit
  best: number;
  graceRemaining: number; // free passes left in the rolling window
}

export interface PeriodResult {
  targetCompletions: number; // e.g. habit target: 3x/week
  actualCompletions: number;
}

export const DEFAULT_GRACE_PER_MONTH = 1;

export function advanceStreak(
  state: StreakState,
  period: PeriodResult,
): StreakState {
  const hit = period.actualCompletions >= period.targetCompletions;
  if (hit) {
    const current = state.current + 1;
    return { ...state, current, best: Math.max(state.best, current) };
  }
  if (state.graceRemaining > 0) {
    // Missed period forgiven: streak survives, grace consumed.
    return { ...state, graceRemaining: state.graceRemaining - 1 };
  }
  return { ...state, current: 0 };
}

export function refillGrace(state: StreakState): StreakState {
  return { ...state, graceRemaining: DEFAULT_GRACE_PER_MONTH };
}

// ---------------------------------------------------------------------------
// XP
// ---------------------------------------------------------------------------

export type XpEvent =
  | 'mission_completed'
  | 'relationship_mission_completed'
  | 'habit_completed'
  | 'journal_entry'
  | 'weekly_review_completed'
  | 'memory_logged';

export const XP_TABLE: Record<XpEvent, number> = {
  mission_completed: 25,
  relationship_mission_completed: 40, // relationship actions are the point of the product
  habit_completed: 10,
  journal_entry: 10,
  weekly_review_completed: 50,
  memory_logged: 30, // preserving a moment is a real-life act, not app usage
};

/** Level curve: level n requires 100 * n^1.5 cumulative XP. */
export function levelForXp(totalXp: number): number {
  let level = 1;
  while (totalXp >= xpForLevel(level + 1)) level += 1;
  return level;
}

export function xpForLevel(level: number): number {
  return Math.round(100 * Math.pow(level - 1, 1.5));
}

export function xpProgress(totalXp: number): {
  level: number;
  intoLevel: number;
  neededForNext: number;
} {
  const level = levelForXp(totalXp);
  const base = xpForLevel(level);
  const next = xpForLevel(level + 1);
  return { level, intoLevel: totalXp - base, neededForNext: next - base };
}
