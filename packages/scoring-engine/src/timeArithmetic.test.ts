import { describe, it, expect } from 'vitest';
import {
  lifeInWeeks,
  booksRemaining,
  tripsRemaining,
  annualMoments,
  customCountRemaining,
  screenTrade,
} from './timeArithmetic';

const FORBIDDEN = /death|die|dying|lifespan|running out|too late|wasted|shame|guilt/i;

describe('life in weeks', () => {
  it('a 33-year-old: ~1,722 lived, ~2,452 ahead, total near the famous 4,000', () => {
    const r = lifeInWeeks(33);
    expect(r.weeksLived).toBe(1722);
    expect(r.weeksAhead).toBe(2452);
    expect(r.totalWeeks).toBeGreaterThan(4000);
    expect(r.totalWeeks).toBeLessThan(4400);
    expect(r.framingText).toMatch(/four thousand weeks/);
    expect(r.framingText).toMatch(/build almost anything/);
  });

  it('floors weeks ahead at a full year even past the horizon', () => {
    expect(lifeInWeeks(85).weeksAhead).toBeGreaterThanOrEqual(52);
  });
});

describe('activity counts — the Tail End pattern', () => {
  it('books: 12/year at 33 → ~560 remaining, uplift ~1130', () => {
    const r = booksRemaining(33, 12);
    expect(r.remaining).toBe(560);       // 12*47=564 → nearest 10
    expect(r.upliftRemaining).toBe(1130); // 24*47=1128 → nearest 10
    expect(r.framingText).toMatch(/numbered/);
  });

  it('trips: 2/year at 33 → ~95 remaining with agency uplift', () => {
    const r = tripsRemaining(33, 2);
    expect(r.remaining).toBe(95);        // 2*47=94 → nearest 5
    expect(r.upliftRemaining).toBeGreaterThan(r.remaining);
  });

  it('a reader of zero books still never sees zero', () => {
    expect(booksRemaining(70, 0).remaining).toBeGreaterThanOrEqual(1);
  });

  it('custom counts: the ocean-swims pattern at the user\'s own pace', () => {
    const r = customCountRemaining(33, 'ocean swims', 1);
    expect(r.remaining).toBe(45);        // 1/year × 47 horizon years → nearest 5
    expect(r.upliftRemaining).toBe(95);  // 2/year → 94 → nearest 5
    expect(r.framingText).toContain('ocean swims');
    expect(r.framingText).toMatch(/that lever is yours/);
  });

  it('custom counts: "Diwalis at home" at 1/year for an NRI', () => {
    const r = customCountRemaining(30, 'Diwalis at home', 1);
    expect(r.remaining).toBe(50);
    expect(r.upliftRemaining).toBe(100);
  });

  it('custom counts never show zero even at tiny paces late in life', () => {
    const r = customCountRemaining(78, 'treks', 0);
    expect(r.remaining).toBeGreaterThanOrEqual(1);
  });

  it('annual moments count summers, birthdays, full moons', () => {
    const m = annualMoments(33);
    expect(m.summers).toBe(47);
    expect(m.birthdays).toBe(47);
    expect(m.fullMoons).toBe(580); // 47*12.4=582.8 → nearest 10
  });
});

describe('screen trade', () => {
  it('5h/day at 33 ≈ 14 waking years to the horizon', () => {
    const r = screenTrade(33, 5);
    expect(r.wakingYearsOnScreens).toBeGreaterThan(13);
    expect(r.wakingYearsOnScreens).toBeLessThan(15.5);
  });

  it('the reclaim math: one hour less ≈ 22 waking days a year', () => {
    const r = screenTrade(33, 3);
    expect(r.reclaimedDaysPerYear).toBe(22);
    expect(r.reclaimedYearsToHorizon).toBeGreaterThan(2);
  });

  it('reclaim framing only — explicitly no judgment, never shame words', () => {
    const r = screenTrade(40, 6);
    expect(r.framingText).toMatch(/No judgment/);
    expect(r.framingText).toMatch(/hands you back/);
    expect(r.framingText).not.toMatch(FORBIDDEN);
    expect(r.assumptions.join(' ')).toMatch(/prices the hour/);
  });
});
