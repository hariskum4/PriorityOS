import { describe, it, expect } from 'vitest';
import {
  estimateTailEnd,
  estimateChildhoodWindows,
  estimateCreativeCompounding,
  estimateCostOfWaiting,
} from './timeWindows';

const FORBIDDEN = /death|die|dying|dead|lifespan|running out|too late|lost|wasted|used up|only .* left/i;

describe('tail end share', () => {
  it("computes the Tail End scenario: 18 years home, 10 days/yr now", () => {
    const r = estimateTailEnd({
      yearsLivedTogether: 18,
      currentDaysPerYear: 10,
      remainingYears: 13,
    });
    // childhood: 330*18 = 5940; ahead: 130 → 130/6070 ≈ 2.1% → ≥1%, honest but never 0
    expect(r.percentAhead).toBeGreaterThanOrEqual(1);
    expect(r.percentAhead).toBeLessThanOrEqual(5);
    expect(r.daysAhead).toBe(130);
    expect(r.daysAheadIfDoubled).toBe(260);
  });

  it('never returns zero days or zero percent', () => {
    const r = estimateTailEnd({
      yearsLivedTogether: 18,
      currentDaysPerYear: 0,
      remainingYears: 5,
    });
    expect(r.daysAhead).toBeGreaterThanOrEqual(1);
    expect(r.percentAhead).toBeGreaterThanOrEqual(1);
  });

  it('frames what remains, with agency, no doom vocabulary', () => {
    const r = estimateTailEnd({ yearsLivedTogether: 18, currentDaysPerYear: 10, remainingYears: 13 });
    expect(r.framingText).toMatch(/still ahead/);
    expect(r.framingText).toMatch(/you control/);
    expect(r.framingText).not.toMatch(FORBIDDEN);
    expect(r.assumptions.length).toBeGreaterThanOrEqual(3);
  });
});

describe('childhood windows', () => {
  it('counts ordinary units for an 8-year-old', () => {
    const r = estimateChildhoodWindows({ childAge: 8 });
    expect(r.yearsOfConcentratedTime).toBe(10);
    expect(r.weekendsAhead).toBe(400);   // 40 * 10
    expect(r.dinnersAhead).toBe(2600);   // 5 * 52 * 10
  });

  it('always includes the anti-guilt corrective (18-summers backlash)', () => {
    for (const age of [2, 10, 16, 17]) {
      const r = estimateChildhoodWindows({ childAge: age });
      expect(r.framingText).toMatch(/does not end at 18/);
      expect(r.framingText).not.toMatch(FORBIDDEN);
    }
  });

  it('floors at one year even for a 17-year-old (never a countdown to zero)', () => {
    const r = estimateChildhoodWindows({ childAge: 17.9 as unknown as number });
    expect(r.yearsOfConcentratedTime).toBeGreaterThanOrEqual(1);
    expect(r.weekendsAhead).toBeGreaterThanOrEqual(1);
  });
});

describe('creative compounding', () => {
  it('30 min × 5 days ≈ 130 hours → language basics tier', () => {
    const r = estimateCreativeCompounding(30);
    expect(r.hoursPerYear).toBe(130);
    expect(r.milestone).toMatch(/language/);
  });

  it('60 min × 6 days lands in the book/skill tiers', () => {
    const r = estimateCreativeCompounding(60, 6);
    expect(r.hoursPerYear).toBe(312);
    expect(r.milestone).toMatch(/skill/);
  });

  it('small inputs still produce a real, encouraging result', () => {
    const r = estimateCreativeCompounding(10, 2);
    expect(r.hoursPerYear).toBeGreaterThanOrEqual(1);
    expect(r.framingText).toMatch(/Arithmetic/);
  });
});

describe('cost of waiting', () => {
  it('matches the blueprint order of magnitude: 5000/mo at 30 → crores by 60', () => {
    const r = estimateCostOfWaiting({ monthlyAmount: 5000, currentAge: 30 });
    // 30y of 5000/mo @12% ≈ 1.76cr (blueprint's 3.5cr assumed step-ups; we state assumptions)
    expect(r.corpusStartingNow).toBeGreaterThan(15_000_000);
    expect(r.gainFromStartingNow).toBeGreaterThan(0);
    expect(r.corpusStartingNow).toBeGreaterThan(r.corpusIfDelayed);
  });

  it('frames as gain from starting now, never retroactive loss', () => {
    const r = estimateCostOfWaiting({ monthlyAmount: 100, currentAge: 45 });
    expect(r.framingText).toMatch(/Starting this month/);
    expect(r.framingText).toMatch(/open right now/);
    expect(r.framingText).not.toMatch(FORBIDDEN);
    expect(r.assumptions.join(' ')).toMatch(/not a promise/);
  });

  it('handles near-target ages without negatives', () => {
    const r = estimateCostOfWaiting({ monthlyAmount: 1000, currentAge: 59 });
    expect(r.corpusStartingNow).toBeGreaterThan(0);
    expect(r.gainFromStartingNow).toBeGreaterThanOrEqual(0);
  });
});
