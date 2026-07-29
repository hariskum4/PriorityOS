/**
 * Which week a snapshot belongs to.
 *
 * The same class of fault as the day grid, one zoom level out and much
 * quieter: `weekOf` bucketed by the UTC calendar date, so a snapshot taken at
 * 02:00 on a Monday in Bengaluru — 20:30 Sunday in UTC — was filed under the
 * Monday before. A whole week of a life recorded against the wrong week, and
 * then read back as a trend line.
 *
 * It is quieter than the day bug because nothing on screen looks wrong: the
 * chart still has a point, it is simply the wrong point, and the weekly job
 * runs at a fixed UTC hour so the error is systematic rather than occasional.
 */
import { describe, it, expect } from 'vitest';
import { weekOf } from './life-os.service';

const key = (d: Date) => d.toISOString().slice(0, 10);

describe('weekOf', () => {
  it('files an early Monday morning in India under that Monday', () => {
    // 02:00 IST on Monday 27 July 2026 is 20:30 UTC on Sunday the 26th.
    const at = new Date('2026-07-26T20:30:00Z');
    expect(key(weekOf(at, 'Asia/Kolkata'))).toBe('2026-07-27');
    expect(key(weekOf(at))).toBe('2026-07-20'); // what it used to do: a week early
  });

  it('does not push a Sunday evening in New York into the next week', () => {
    // 20:00 Sunday 26 July in New York is 00:00 UTC on Monday the 27th. UTC
    // starts the new week; the person has not.
    const at = new Date('2026-07-27T00:00:00Z');
    expect(key(weekOf(at, 'America/New_York'))).toBe('2026-07-20');
    expect(key(weekOf(at))).toBe('2026-07-27'); // what it used to do: a week late
  });

  it('always lands on a Monday, in every zone', () => {
    for (const tz of ['Asia/Kolkata', 'America/New_York', 'Pacific/Kiritimati', 'Pacific/Midway', 'UTC']) {
      for (let h = 0; h < 24; h++) {
        const at = new Date(Date.UTC(2026, 6, 26, h));
        expect(weekOf(at, tz).getUTCDay()).toBe(1);
      }
    }
  });

  it('is stable within a local week and moves exactly once across it', () => {
    const tz = 'Asia/Kolkata';
    const seen = new Set<string>();
    // Every hour of one local week, from Monday 00:00 IST.
    for (let h = 0; h < 24 * 7; h++) {
      seen.add(key(weekOf(new Date(Date.parse('2026-07-26T18:30:00Z') + h * 3_600_000), tz)));
    }
    expect([...seen]).toEqual(['2026-07-27']);
  });

  it('keeps the idempotency key at UTC midnight, so a week is one row', () => {
    const w = weekOf(new Date('2026-07-26T20:30:00Z'), 'Asia/Kolkata');
    expect(w.toISOString()).toBe('2026-07-27T00:00:00.000Z');
  });

  it('behaves exactly as before when no zone is given', () => {
    for (const iso of ['2026-07-27T00:00:00Z', '2026-07-29T13:00:00Z', '2026-08-02T23:59:59Z']) {
      const at = new Date(iso);
      const legacy = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
      legacy.setUTCDate(legacy.getUTCDate() - ((legacy.getUTCDay() + 6) % 7));
      expect(weekOf(at)).toEqual(legacy);
    }
  });

  it('falls back to UTC on a zone it does not recognise', () => {
    const at = new Date('2026-07-26T20:30:00Z');
    expect(weekOf(at, 'Mars/Olympus_Mons')).toEqual(weekOf(at));
  });
});
