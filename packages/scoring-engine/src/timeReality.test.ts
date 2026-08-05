import { describe, it, expect } from 'vitest';
import {
  estimateTimeReality,
  lifeExpectancyForRegion,
  workConstraintModifier,
  normalizeHealthStatus,
  normalizeLocationType,
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

/**
 * `healthStatus` and `locationType` are nullable free strings in the database
 * and were written through unvalidated. A value the engine did not know
 * indexed to `undefined`, multiplied into NaN, and reached both the copy
 * ("~NaN meaningful visits ahead with Lakshmi") and a Float column, where the
 * write threw and stranded the account mid-onboarding.
 */
describe('unknown stored values never become NaN', () => {
  const strays = [
    'fair', 'poor', 'excellent', 'Good', 'DECLINING', 'not great',
    '', '  ', 'null', 'undefined', '???',
  ];

  it('every stray health string still produces a real number', () => {
    for (const personHealthStatus of strays) {
      const r = estimateTimeReality({ ...base, personHealthStatus: personHealthStatus as any });
      expect(Number.isFinite(r.currentTrajectory)).toBe(true);
      expect(Number.isFinite(r.qualityYears)).toBe(true);
      expect(Number.isFinite(r.improvedTrajectory)).toBe(true);
      expect(Number.isFinite(r.maxPossible)).toBe(true);
      expect(r.display).not.toMatch(/NaN|Infinity|undefined/);
      expect(r.framingText).not.toMatch(/NaN|Infinity|undefined/);
    }
  });

  it('every stray location string still produces a real number', () => {
    for (const personLocationType of [...strays, 'same_home', 'different_country', 'overseas']) {
      const r = estimateTimeReality({ ...base, personLocationType: personLocationType as any });
      expect(Number.isFinite(r.currentTrajectory)).toBe(true);
      expect(Number.isFinite(r.maxPossible)).toBe(true);
      expect(r.display).not.toMatch(/NaN|Infinity|undefined/);
    }
  });

  it('a non-numeric age or visit count does not poison the result', () => {
    const r = estimateTimeReality({
      ...base,
      personAge: NaN as any,
      currentVisitsPerYear: undefined as any,
      desiredVisitsPerYear: 'lots' as any,
    });
    expect(Number.isFinite(r.currentTrajectory)).toBe(true);
    expect(r.currentTrajectory).toBeGreaterThanOrEqual(1);
    expect(r.display).not.toMatch(/NaN/);
  });

  it('an unrecognised health word reads as good, never as worse', () => {
    // Guessing "declining" from a word we do not know would be the app
    // inventing bad news about somebody's parent.
    expect(normalizeHealthStatus('mysterious')).toBe('good');
    expect(normalizeHealthStatus(undefined)).toBe('good');
    expect(normalizeHealthStatus('')).toBe('good');
  });

  it('known synonyms land on the right bucket', () => {
    expect(normalizeHealthStatus('fair')).toBe('declining');
    expect(normalizeHealthStatus('poor')).toBe('declining');
    expect(normalizeHealthStatus('excellent')).toBe('good');
    expect(normalizeHealthStatus('  SERIOUS ')).toBe('serious');
    // The words people actually type about a parent. "aging" used to fall
    // through to 'good' — quietly LOWERING the urgency of exactly the person
    // the user flagged as worrying them. These are known words, not guesses,
    // so the unknown-defaults-to-good rule above is untouched.
    expect(normalizeHealthStatus('aging')).toBe('declining');
    expect(normalizeHealthStatus('Ageing')).toBe('declining');
    expect(normalizeHealthStatus('elderly')).toBe('declining');
    expect(normalizeHealthStatus('sick')).toBe('declining');
    expect(normalizeHealthStatus('cancer')).toBe('serious');
    expect(normalizeHealthStatus('hospitalized')).toBe('serious');
    /* `same_home` is its own value now, not an alias of same_city. It used
       to be collapsed at storage, so "lives in my house" was remembered as
       "lives in my town" and a live-in partner's first mission read "one
       message is enough". The capacity table keeps the pair numerically
       identical, so this widening changes no estimate. */
    expect(normalizeLocationType('same_home')).toBe('same_home');
    expect(normalizeLocationType('same house')).toBe('same_home');
    expect(normalizeLocationType('same_city')).toBe('same_city');
    expect(normalizeLocationType('different_country')).toBe('abroad');
    expect(normalizeLocationType('overseas')).toBe('abroad');
    expect(normalizeLocationType(undefined)).toBe('different_city');
  });
});

/**
 * The uplift is the agency half of this engine — invariant 3. A card that
 * offers it has to be able to trust two things: that it is genuinely more, and
 * that the pace it names is the pace the arithmetic used.
 */
describe('what one change actually adds', () => {
  it('adding visits never lowers the count', () => {
    // The onboarding reveal showed "~150 visits ahead" and, beneath it,
    // "add just 2 visits a year and it becomes 140" — because it recomputed
    // the uplift over a flat ten years while the estimate spanned the
    // quality-year window. The engine's own pair can never invert.
    for (let age = 30; age <= 90; age++) {
      for (const pace of [1, 2, 4, 6, 12, 24, 52]) {
        const r = estimateTimeReality({
          ...base, personAge: age, currentVisitsPerYear: pace,
          desiredVisitsPerYear: undefined,
        });
        expect(r.improvedTrajectory).toBeGreaterThanOrEqual(r.currentTrajectory);
        expect(r.additionalPossible).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('the reveal case: a parent of 60, seen monthly, gains rather than loses', () => {
    const r = estimateTimeReality({
      ...base, personAge: 60, currentVisitsPerYear: 12,
      desiredVisitsPerYear: undefined, personLabel: 'Papa',
    });
    expect(r.currentTrajectory).toBe(150);
    expect(r.improvedTrajectory).toBe(180);   // not 140
    expect(r.visitsAddedPerYear).toBe(2);
  });

  it('names two a year when two a year are possible', () => {
    const r = estimateTimeReality({ ...base, desiredVisitsPerYear: undefined });
    expect(r.visitsAddedPerYear).toBe(2);
  });

  it('names nothing when the ceiling is already reached', () => {
    // Abroad caps meaningful visits at 4 a year before the working week is
    // even considered. Someone already at that ceiling cannot add two, and
    // promising them they can is a reproach dressed as encouragement.
    const r = estimateTimeReality({
      ...base, personLocationType: 'abroad', currentVisitsPerYear: 6,
      desiredVisitsPerYear: undefined,
    });
    expect(r.visitsAddedPerYear).toBe(0);
    expect(r.improvedTrajectory).toBe(r.currentTrajectory);
  });

  it('the pace it names is the pace it used', () => {
    // Whatever the cap does to the ask, the sentence and the number agree.
    for (const loc of ['same_city', 'different_city', 'abroad'] as const) {
      for (const pace of [1, 4, 12, 40]) {
        const r = estimateTimeReality({
          ...base, personLocationType: loc, currentVisitsPerYear: pace,
          desiredVisitsPerYear: undefined,
        });
        if (r.visitsAddedPerYear === 0) {
          expect(r.improvedTrajectory).toBe(r.currentTrajectory);
        } else {
          expect(r.improvedTrajectory).toBeGreaterThan(r.currentTrajectory);
        }
      }
    }
  });
});
