import { describe, it, expect } from 'vitest';
import { lifeInWeeks, screenTrade } from './timeArithmetic';

const FORBIDDEN = /death|die|dying|lifespan|running out|too late|wasted|shame|guilt/i;

describe('life in weeks', () => {
  it('a 33-year-old with no country set: ~1,722 lived, ~2,192 ahead', () => {
    const r = lifeInWeeks(33);
    expect(r.weeksLived).toBe(1722);
    expect(r.weeksAhead).toBe(2192); // 42 years on the global-average fallback
    expect(r.framingText).toMatch(/four thousand weeks/);
    expect(r.framingText).toMatch(/build almost anything/);
  });

  /**
   * The whole point of the change, in one assertion. The same 33-year-old is
   * counted differently in Osaka and in Lagos because they are, and the app
   * held the figures that say so long before it read them here.
   */
  it('counts the same age differently in different countries', () => {
    const japan = lifeInWeeks(33, 'JP').weeksAhead;
    const india = lifeInWeeks(33, 'IN').weeksAhead;
    const nigeria = lifeInWeeks(33, 'NG').weeksAhead;
    expect(japan).toBeGreaterThan(india);
    expect(india).toBeGreaterThan(nigeria);
    expect(japan - nigeria).toBeGreaterThan(52 * 10); // a decade of weeks apart
  });

  it('the horizon moves — an 85-year-old still sees 15 years of weeks ahead', () => {
    expect(lifeInWeeks(85).weeksAhead).toBeGreaterThanOrEqual(15 * 52);
    /* Including in the country with the shortest table row. The floor is the
       floor everywhere, or it is not a floor. */
    expect(lifeInWeeks(85, 'NG').weeksAhead).toBeGreaterThanOrEqual(15 * 52);
  });
});

describe('screen trade', () => {
  it('5h/day at 33 ≈ 12.7 waking years on the default horizon', () => {
    const r = screenTrade(33, 5);
    expect(r.basis).toBe('stated');
    expect(r.wakingYearsOnScreens).toBeGreaterThan(12);
    expect(r.wakingYearsOnScreens).toBeLessThan(13.5);
  });

  it('and more of them where the horizon is longer', () => {
    expect(screenTrade(33, 5, 'JP').wakingYearsOnScreens!)
      .toBeGreaterThan(screenTrade(33, 5, 'IN').wakingYearsOnScreens!);
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

  it('quotes the hours it was actually given, not a house default', () => {
    expect(screenTrade(33, 2).framingText).toMatch(/At 2h a day/);
    expect(screenTrade(33, 7).framingText).toMatch(/At 7h a day/);
    expect(screenTrade(33, 7).wakingYearsOnScreens!)
      .toBeGreaterThan(screenTrade(33, 2).wakingYearsOnScreens!);
  });

  /**
   * The card asserted "at 5h a day" to everyone who had never touched it,
   * with a selection ring drawn around the 5. Nothing is claimed now until
   * someone claims it.
   */
  it('says nothing about a person who has never set an hour count', () => {
    for (const missing of [undefined, null, 0]) {
      const r = screenTrade(33, missing);
      expect(r.basis).toBe('unknown');
      expect(r.wakingYearsOnScreens).toBeNull();
      expect(r.framingText).not.toMatch(/\d+h a day/);
      expect(r.framingText).not.toMatch(/waking years/);
      expect(r.framingText).not.toMatch(FORBIDDEN);
      expect(r.assumptions.join(' ')).toMatch(/until you set one/);
    }
  });

  it('still offers the hour it can honestly price, with no basis at all', () => {
    const r = screenTrade(33, null);
    // Worth of one hour is arithmetic on the offer, not a claim about them.
    expect(r.reclaimedDaysPerYear).toBe(22);
    expect(r.framingText).toMatch(/22 full waking days a year/);
  });
});
