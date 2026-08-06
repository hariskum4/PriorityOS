import { describe, it, expect } from 'vitest';
import { NORMS, allNorms, softestNorms, normNote } from './norms';
import { freeTimeBudget, PLANNING_HORIZON_AGE, yearsToHorizon } from './lifeWindows';
import { estimateCostOfWaiting } from './timeWindows';

/**
 * The table is only worth having if the engine reads from it. A norms file
 * that documents 7.5 hours while `lifeWindows` hardcodes 8 is worse than no
 * file at all — it is a citation for a number nobody uses.
 */
describe('the numbers the app asserts about people in general', () => {
  it('is what the horizon arithmetic actually runs on', () => {
    expect(PLANNING_HORIZON_AGE).toBe(NORMS.planningHorizonAge.value);
    expect(yearsToHorizon(40)).toBe(NORMS.planningHorizonAge.value - 40);
  });

  it('is what the free-week arithmetic actually runs on', () => {
    const sleep = NORMS.sleepHoursPerNight.value;
    const overhead = NORMS.lifeOverheadHoursPerWeek.value;
    const work = 40;
    expect(freeTimeBudget(work, 'office_9_5').freeHoursPerWeek)
      .toBe(Math.round(168 - sleep * 7 - work - overhead));
  });

  it('is what the compounding calculator actually runs on', () => {
    /* Same inputs, once with the rate left to the default and once with the
       table's value passed explicitly. */
    const base = { monthlyAmount: 10_000, currentAge: 40, targetAge: 60 };
    expect(estimateCostOfWaiting(base).corpusStartingNow)
      .toBe(estimateCostOfWaiting({ ...base, annualReturnPct: NORMS.annualReturnPct.value }).corpusStartingNow);
  });

  it('gives every entry a source specific enough to check', () => {
    for (const n of allNorms()) {
      expect(n.source.length).toBeGreaterThan(40);
      expect(n.label.trim()).not.toBe('');
      expect(n.unit.trim()).not.toBe('');
      /* None of these are about the reader. That is the whole distinction
         RESEARCH_NOTES §4 turns on, so it is not optional per entry. */
      expect(n.personal).toBe(false);
    }
  });

  it('is honest about which of them are choices rather than findings', () => {
    expect(NORMS.planningHorizonAge.grade).toBe('convention');
    expect(NORMS.workingWeeksPerYear.grade).toBe('convention');
    /* The ones worth revisiting first, and the reason the grade exists. */
    expect(softestNorms().map((n) => n.key)).toContain('annualReturnPct');
    expect(softestNorms().map((n) => n.key)).not.toContain('sleepHoursPerNight');
  });

  it('writes a note that never claims the figure is about the reader', () => {
    for (const n of allNorms()) {
      const note = normNote(n.key)!;
      expect(note).toContain('same for every reader');
      expect(note).not.toMatch(/your |you are|we measured/i);
    }
    expect(normNote('nothing-by-this-name')).toBeNull();
  });

  it('says nothing in the register this app does not use', () => {
    const FORBIDDEN = /death|dying|lifespan|too late|running out|you failed/i;
    for (const n of allNorms()) {
      expect(`${n.label} ${n.source} ${n.caveat ?? ''}`).not.toMatch(FORBIDDEN);
      expect(normNote(n.key)!).not.toMatch(FORBIDDEN);
    }
  });
});
