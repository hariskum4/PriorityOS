import { describe, it, expect } from 'vitest';
import {
  freeTimeBudget,
  weekendsRemaining,
  careerWindow,
  bodyWindows,
  openBodyWindows,
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

  it('does not charge a homemaker the chores overhead on top of the household hours', () => {
    // Her stated hours ARE the cooking and errands; the 24h "commute, chores
    // and admin" tax would count the same washing-up twice. What stays out is
    // the personal slice: 168 - 52.5 sleep - 45 household - 8 own admin.
    const f = freeTimeBudget(45, 'homemaker');
    expect(f.freeHoursPerWeek).toBe(63);
    expect(f.detail).toMatch(/household/);
    expect(f.detail).not.toMatch(/commutes/);
  });

  it('an office life keeps the full overhead and the old numbers', () => {
    expect(freeTimeBudget(45, 'office_9_5').freeHoursPerWeek).toBe(47);
  });

  it('the assumptions name the household when the household is the work', () => {
    const w = lifeWindows({ age: 30, workHoursPerWeek: 45, workType: 'homemaker' });
    expect(w.assumptions.join(' ')).toMatch(/household hours count as the work/);
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
    expect(w.every((x) => x.state === 'open')).toBe(true);
    expect(w[0].yearsLeft).toBe(8);
  });

  /**
   * This test used to assert the opposite, under the name "passed windows
   * are silently absent — never shown as closed", and it pinned a design
   * decision that was wrong twice over. Silence read as "nothing here for
   * you", and it was substantively backwards: the windows close on easy
   * gains, not on the activity — strength at 58 is kept rather than found,
   * and keeping it still wants the session. A closed window now converts:
   * state flips, the framing says what the closure means today, and the
   * rhythm stays offerable.
   */
  it('a passed window converts instead of vanishing', () => {
    const w = bodyWindows(58);
    expect(w.map((x) => x.key)).toEqual([
      'peak_strength', 'endurance', 'adventure_travel', 'presence',
    ]);
    const strength = w.find((x) => x.key === 'peak_strength')!;
    expect(strength.state).toBe('closed');
    expect(strength.closedAround).toBe(40);
    expect(strength.yearsLeft).toBeNull();
    /* The second act, not the obituary: the framing changes to what the
       closure means now, and the action survives it. */
    expect(strength.framingText).toMatch(/kept, not found/);
    expect(strength.rhythmKey).toBe('health.strength');
    const travel = w.find((x) => x.key === 'adventure_travel')!;
    expect(travel.state).toBe('open');
    expect(travel.yearsLeft).toBe(12);
  });

  it('every age sees all four rows, and never fewer actions than before', () => {
    for (const age of [18, 25, 40, 41, 55, 56, 70, 71, 90]) {
      const w = bodyWindows(age);
      expect(w).toHaveLength(4);
      /* Three rhythms are offerable at every age — the card no longer
         decays to a single actionless row at 71. */
      expect(w.filter((x) => x.rhythmKey != null)).toHaveLength(3);
      expect(w.find((x) => x.key === 'presence')!.state).toBe('open');
    }
  });

  /**
   * The register rule, enforced rather than hoped for: a closed window is
   * the stake, never the scold. Same forbidden set the day shape uses.
   */
  it('closed framings never guilt', () => {
    const FORBIDDEN = /death|dying|lifespan|running out|too late|wasted|lazy|should have/i;
    for (const w of bodyWindows(90)) {
      expect(w.framingText).not.toMatch(FORBIDDEN);
    }
  });

  it('openBodyWindows is the old behaviour, for callers that only want doors', () => {
    expect(openBodyWindows(58).map((x) => x.key)).toEqual(['adventure_travel', 'presence']);
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
