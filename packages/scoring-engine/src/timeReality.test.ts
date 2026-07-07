import { describe, it, expect } from 'vitest';
import {
  estimateTimeReality,
  lifeExpectancyForRegion,
  workConstraintModifier,
  softRound,
  framingFor,
  TimeRealityInput,
} from './timeReality';

const base: TimeRealityInput = {
  personAge: 67,
  personLabel: 'Appa',
  personHealthStatus: 'good',
  personLocationType: 'different_city',
  userWorkHoursPerWeek: 45,
  currentVisitsPerYear: 6,
  desiredVisitsPerYear: 10,
  region: 'IN',
};

describe('time reality engine', () => {
  it('computes the blueprint example: 67yo parent in India, different city', () => {
    const r = estimateTimeReality(base);
    // Conditional horizon: (95-67)*0.45 = 12.6y beats at-birth (70-67).
    // Quality: (12.6-3)*1.0 = 9.6y. Current: 6*9.6 = 57.6 → ~60.
    expect(r.yearsRemaining).toBe(13);
    expect(r.qualityYears).toBe(9.6);
    expect(r.currentTrajectory).toBe(60);
    expect(r.improvedTrajectory).toBe(95); // 10 * 9.6 = 96 → nearest 5
  });

  it('younger parent gets a larger window', () => {
    const r = estimateTimeReality({ ...base, personAge: 55 });
    // years = max(15, (95-55)*0.45=18) = 18; quality = 15; current = 6*15 = 90
    expect(r.currentTrajectory).toBe(90);
    expect(r.improvedTrajectory).toBe(150); // 10 * 15 → nearest 10
    expect(r.additionalPossible).toBe(60);
  });

  it('NEVER returns zero or negative trajectories, even at extreme age', () => {
    const r = estimateTimeReality({ ...base, personAge: 95, currentVisitsPerYear: 0 });
    expect(r.currentTrajectory).toBeGreaterThanOrEqual(1);
    expect(r.improvedTrajectory).toBeGreaterThanOrEqual(1);
    expect(r.yearsRemaining).toBeGreaterThanOrEqual(5);
    expect(r.qualityYears).toBeGreaterThanOrEqual(2);
  });

  it('never uses death or lifespan language in user-facing copy', () => {
    const forbidden = /death|die|dying|dead|lifespan|left before|running out|end of life/i;
    for (const age of [30, 50, 67, 80, 95]) {
      for (const health of ['good', 'declining', 'serious'] as const) {
        const r = estimateTimeReality({ ...base, personAge: age, personHealthStatus: health });
        expect(r.framingText).not.toMatch(forbidden);
        for (const a of r.assumptions) expect(a).not.toMatch(forbidden);
      }
    }
  });

  it('always provides an agency counterpart (improved >= current)', () => {
    for (const visits of [1, 4, 12, 24]) {
      const r = estimateTimeReality({ ...base, personAge: 55, currentVisitsPerYear: visits });
      expect(r.improvedTrajectory).toBeGreaterThanOrEqual(r.currentTrajectory);
      expect(r.maxPossible).toBeGreaterThanOrEqual(r.improvedTrajectory);
    }
  });

  it('always attaches assumptions', () => {
    const r = estimateTimeReality(base);
    expect(r.assumptions.length).toBeGreaterThanOrEqual(3);
  });

  it('health modifiers scale quality years down, gently floored', () => {
    const good = estimateTimeReality({ ...base, personAge: 50 });
    const declining = estimateTimeReality({ ...base, personAge: 50, personHealthStatus: 'declining' });
    const serious = estimateTimeReality({ ...base, personAge: 50, personHealthStatus: 'serious' });
    expect(declining.qualityYears).toBeLessThan(good.qualityYears);
    expect(serious.qualityYears).toBeLessThan(declining.qualityYears);
    expect(serious.qualityYears).toBeGreaterThanOrEqual(2);
  });

  it('serious health never produces high urgency (no pressure on grief)', () => {
    const r = estimateTimeReality({
      ...base, personAge: 80, personHealthStatus: 'serious', currentVisitsPerYear: 2,
    });
    expect(r.urgencyLevel).not.toBe('high');
    expect(r.assumptions.join(' ')).toMatch(/adjusts as things change/);
  });

  it('desired pace is capped by location + work capacity', () => {
    const r = estimateTimeReality({
      ...base,
      personAge: 50,
      personLocationType: 'abroad',       // capacity 4/yr
      userWorkHoursPerWeek: 65,           // ×0.4 → 1.6/yr
      currentVisitsPerYear: 1,
      desiredVisitsPerYear: 52,           // wishful
    });
    // capacity = 4 * 0.4 = 1.6/yr; quality = (20.25-3) = 17.25y → max ~30
    expect(r.improvedTrajectory).toBeLessThanOrEqual(r.maxPossible);
    expect(r.maxPossible).toBeLessThanOrEqual(30);
  });

  it('soft rounding: nearest 5 over 20, nearest 10 over 100, "~" display', () => {
    expect(softRound(17)).toBe(17);
    expect(softRound(23)).toBe(25);
    expect(softRound(94)).toBe(95);
    expect(softRound(212)).toBe(210);
    const r = estimateTimeReality({ ...base, personAge: 40, currentVisitsPerYear: 12 });
    expect(r.display).toMatch(/^~\d+$/);
  });

  it('framing tiers follow the blueprint thresholds', () => {
    expect(framingFor(250, 'Amma')).toMatch(/meaningful time ahead/);
    expect(framingFor(150, 'Amma')).toMatch(/hundred moments/);
    expect(framingFor(75, 'Amma')).toMatch(/more than enough/);
    expect(framingFor(30, 'Amma')).toMatch(/weight of real meaning/);
    expect(framingFor(10, 'Amma')).toMatch(/Precious time/);
  });

  it('regional life expectancy resolves codes and names, with default', () => {
    expect(lifeExpectancyForRegion('IN')).toBe(70);
    expect(lifeExpectancyForRegion('india')).toBe(70);
    expect(lifeExpectancyForRegion('US')).toBe(79);
    expect(lifeExpectancyForRegion('AU')).toBe(83);
    expect(lifeExpectancyForRegion('BR')).toBe(75);
    expect(lifeExpectancyForRegion(undefined)).toBe(75);
  });

  it('work constraint tiers match the blueprint', () => {
    expect(workConstraintModifier(35)).toBe(1.0);
    expect(workConstraintModifier(45)).toBe(0.8);
    expect(workConstraintModifier(55)).toBe(0.6);
    expect(workConstraintModifier(70)).toBe(0.4);
    expect(workConstraintModifier(undefined)).toBe(1.0);
  });
});
