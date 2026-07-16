import { describe, it, expect } from 'vitest';
import {
  freeTimeBudget,
  weekendsRemaining,
  careerWindow,
  bodyWindows,
  lifeWindows,
} from './lifeWindows';

const FORBIDDEN = /death|die|dying|lifespan|running out|too late|closed|missed|wasted/i;

describe('free time budget', () => {
  it('computes the honest weekly remainder for a 45-hour week', () => {
    const f = freeTimeBudget(45);
    // 168 - 52.5 sleep - 45 work - 24 overhead = 46.5 → 47
    expect(f.freeHoursPerWeek).toBe(47);
    expect(f.freeHoursPerYear).toBe(2440); // 47*52=2444 → nearest 10
  });

  it('never returns zero even for brutal schedules', () => {
    expect(freeTimeBudget(100).freeHoursPerWeek).toBeGreaterThanOrEqual(4);
  });
});

describe('weekends remaining', () => {
  it('a 35-year-old has ~3380 weekends to the 100-year horizon', () => {
    expect(weekendsRemaining(35)).toBe(3380); // 65*52
  });

  it('the horizon moves — an 85-year-old still sees 15 years ahead', () => {
    expect(weekendsRemaining(85)).toBeGreaterThanOrEqual(15 * 52);
  });
});

describe('career window', () => {
  it('turns "10 more years" into working weeks and the after', () => {
    const c = careerWindow(35, 10, 50);
    expect(c.workingWeeksLeft).toBe(480); // 10*48
    expect(c.postCareerYears).toBe(55);   // 65 horizon years - 10
    expect(c.postCareerFreeHours).toBeGreaterThan(100_000);
    expect(c.framingText).toMatch(/both halves/);
  });

  it('floors planned years at 1', () => {
    expect(careerWindow(59, 0).workingYearsLeft).toBe(1);
  });
});

describe('body windows', () => {
  it('a 32-year-old sees all four windows open', () => {
    const w = bodyWindows(32);
    expect(w.map((x) => x.key)).toEqual([
      'peak_strength', 'endurance', 'adventure_travel', 'presence',
    ]);
    expect(w[0].yearsLeft).toBe(8);
  });

  it('passed windows are silently absent — never shown as closed', () => {
    const w = bodyWindows(58);
    expect(w.map((x) => x.key)).toEqual(['adventure_travel', 'presence']);
  });

  it('presence keeps the list non-empty at any age', () => {
    const w = bodyWindows(90);
    expect(w.length).toBe(1);
    expect(w[0].key).toBe('presence');
    expect(w[0].yearsLeft).toBeNull();
  });
});

describe('aggregate life windows', () => {
  it('assembles the user scenario: 32yo IT, 10 more working years', () => {
    const r = lifeWindows({ age: 32, workHoursPerWeek: 50, plannedWorkYearsMore: 10 });
    expect(r.yearsToHorizon).toBe(68);
    expect(r.weekendsRemaining).toBe(3540); // 3536 → nearest 10
    expect(r.career.workingWeeksLeft).toBe(480);
    expect(r.assumptions.length).toBeGreaterThanOrEqual(4);
  });

  it('uses no doom vocabulary anywhere', () => {
    for (const age of [25, 40, 60, 85]) {
      const r = lifeWindows({ age });
      const text = [
        r.freeTime.detail, r.career.framingText,
        ...r.body.map((b) => b.framingText), ...r.assumptions,
      ].join(' ');
      expect(text).not.toMatch(FORBIDDEN);
    }
  });
});
