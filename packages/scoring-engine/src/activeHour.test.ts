import { describe, it, expect } from 'vitest';
import { activeHour } from './activeHour';

const NOW = new Date('2026-08-03T12:00:00');

/** `n` completions at `hour`, each on its own day walking backwards. */
function nightly(hour: number, n: number, minute = 0): Date[] {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(NOW);
    d.setDate(d.getDate() - (i + 1));
    d.setHours(hour, minute, 0, 0);
    return d;
  });
}

describe('it refuses to answer on thin evidence', () => {
  it('says nothing at all with nothing to go on', () => {
    expect(activeHour([], NOW)).toBeNull();
  });

  it('four evenings is not a pattern', () => {
    expect(activeHour(nightly(21, 4), NOW)).toBeNull();
  });

  /**
   * The failure this guards against is specific: a person catching up on a
   * Sunday ticks a whole week of rhythms in four minutes, and a naive read
   * concludes they do everything at 8pm on the strength of one Sunday.
   */
  it('a single catch-up sitting is one occasion, not a habit', () => {
    const sunday = new Date(NOW);
    sunday.setDate(sunday.getDate() - 1);
    const burst = Array.from({ length: 8 }, (_, i) => {
      const d = new Date(sunday);
      d.setHours(20, i * 2, 0, 0);
      return d;
    });
    expect(activeHour(burst, NOW)).toBeNull();
  });

  it('a life with no shape is not given one', () => {
    // Eight completions spread right across the waking day.
    const spread = [7, 9, 11, 13, 15, 17, 19, 21].flatMap((h, i) => {
      const d = new Date(NOW);
      d.setDate(d.getDate() - (i + 1));
      d.setHours(h, 0, 0, 0);
      return [d];
    });
    expect(activeHour(spread, NOW)).toBeNull();
  });

  it('ignores what is too old to describe this life', () => {
    const ancient = nightly(21, 10).map((d) => {
      const old = new Date(d);
      old.setDate(old.getDate() - 200);
      return old;
    });
    expect(activeHour(ancient, NOW)).toBeNull();
  });

  it('survives junk without throwing or claiming anything', () => {
    expect(activeHour([null, undefined, '', 'not a date', NaN], NOW)).toBeNull();
  });
});

describe('once there is enough, it says when', () => {
  it('finds the hour and shows its working', () => {
    const a = activeHour(nightly(21, 6), NOW)!;
    expect(a.hour).toBe(21);
    expect(a.minutes).toBe(21 * 60);
    expect(a.sampleSize).toBe(6);
    expect(a.days).toBe(6);
    expect(a.share).toBeGreaterThanOrEqual(0.3);
  });

  it('reads the middle of the band, not the top of the hour', () => {
    const a = activeHour(nightly(21, 6, 30), NOW)!;
    expect(a.minutes).toBe(21 * 60 + 30);
  });

  /**
   * A plain histogram would call 8:55 and 9:05 two unrelated hours. They are
   * one time of day, and a person who does things "around nine" should not be
   * told they have no pattern because their clock wobbles by ten minutes.
   */
  it('treats either side of an hour as the same time of day', () => {
    const near = [
      ...nightly(20, 2, 55),
      ...nightly(21, 2, 5).map((d) => { d.setDate(d.getDate() - 2); return d; }),
      ...nightly(21, 2, 0).map((d) => { d.setDate(d.getDate() - 4); return d; }),
    ];
    const a = activeHour(near, NOW)!;
    expect(a.hour).toBeGreaterThanOrEqual(20);
    expect(a.hour).toBeLessThanOrEqual(21);
  });

  it('averages across midnight without landing at midday', () => {
    const late = [
      ...nightly(23, 3, 50),
      ...nightly(0, 3, 10).map((d) => { d.setDate(d.getDate() - 3); return d; }),
    ];
    const a = activeHour(late, NOW)!;
    expect([0, 23]).toContain(a.hour);
  });

  it('never returns a clock that could not exist', () => {
    for (const h of [0, 3, 7, 12, 18, 23]) {
      const a = activeHour(nightly(h, 8, 17), NOW)!;
      expect(a.minutes).toBeGreaterThanOrEqual(0);
      expect(a.minutes).toBeLessThan(24 * 60);
      expect(a.minutes % 30).toBe(0);
    }
  });

  it('lets a new rhythm overtake an old one', () => {
    const oldMornings = nightly(7, 30).map((d) => {
      const old = new Date(d);
      old.setDate(old.getDate() - 60);
      return old;
    });
    const recentNights = nightly(21, 60);
    const a = activeHour([...oldMornings, ...recentNights], NOW)!;
    expect(a.hour).toBe(21);
  });

  it('takes strings and numbers as readily as dates', () => {
    const dates = nightly(19, 6);
    expect(activeHour(dates.map((d) => d.toISOString()), NOW)!.hour).toBe(19);
    expect(activeHour(dates.map((d) => d.getTime()), NOW)!.hour).toBe(19);
  });

  it('is deterministic — the same input twice gives the same hour', () => {
    const input = [...nightly(18, 5), ...nightly(20, 5)];
    expect(activeHour(input, NOW)).toEqual(activeHour([...input].reverse(), NOW));
  });
});
