import { describe, it, expect } from 'vitest';
import { freeGaps, bestGap } from './freeGaps';

const at = (h: number, m = 0) => h * 60 + m;
const workday = { fromMinutes: at(9), toMinutes: at(17) };

describe('freeGaps', () => {
  it('finds the hole a cancelled meeting leaves', () => {
    const gaps = freeGaps({
      ...workday,
      busy: [
        { startMinutes: at(9), endMinutes: at(13) },
        { startMinutes: at(15), endMinutes: at(17) },
      ],
    });
    expect(gaps).toEqual([{ startMinutes: at(13), endMinutes: at(15), minutes: 120 }]);
  });

  it('treats a corridor between meetings as no gap at all', () => {
    const gaps = freeGaps({
      ...workday,
      busy: [
        { startMinutes: at(9), endMinutes: at(11) },
        { startMinutes: at(11, 10), endMinutes: at(17) },
      ],
    });
    expect(gaps).toEqual([]);
  });

  it('does not invent gaps between double-booked meetings', () => {
    // A standup inside a working session, plus a stacked invitation.
    const gaps = freeGaps({
      ...workday,
      busy: [
        { startMinutes: at(9), endMinutes: at(12) },
        { startMinutes: at(10), endMinutes: at(10, 30) },
        { startMinutes: at(11), endMinutes: at(14) },
      ],
    });
    expect(gaps).toEqual([{ startMinutes: at(14), endMinutes: at(17), minutes: 180 }]);
  });

  it('gives the whole window when nothing is booked', () => {
    expect(freeGaps({ ...workday, busy: [] }))
      .toEqual([{ startMinutes: at(9), endMinutes: at(17), minutes: 480 }]);
  });

  it('gives nothing when the day is solid', () => {
    expect(freeGaps({ ...workday, busy: [{ startMinutes: at(8), endMinutes: at(18) }] }))
      .toEqual([]);
  });

  it('will not offer an hour that has already gone', () => {
    const gaps = freeGaps({
      ...workday,
      nowMinutes: at(14),
      busy: [{ startMinutes: at(9), endMinutes: at(11) }], // freed at 11, long past
    });
    expect(gaps).toEqual([{ startMinutes: at(14), endMinutes: at(17), minutes: 180 }]);
  });

  it('ignores meetings outside the window it was asked about', () => {
    const gaps = freeGaps({
      ...workday,
      busy: [
        { startMinutes: at(7), endMinutes: at(8) },
        { startMinutes: at(19), endMinutes: at(21) },
      ],
    });
    expect(gaps).toHaveLength(1);
    expect(gaps[0].minutes).toBe(480);
  });

  it('survives rubbish in the calendar', () => {
    const gaps = freeGaps({
      ...workday,
      busy: [
        { startMinutes: NaN, endMinutes: at(10) },
        { startMinutes: at(13), endMinutes: at(12) }, // ends before it starts
        { startMinutes: at(11), endMinutes: at(12) },
      ] as never,
    });
    expect(gaps).toEqual([
      { startMinutes: at(9), endMinutes: at(11), minutes: 120 },
      { startMinutes: at(12), endMinutes: at(17), minutes: 300 },
    ]);
  });

  it('returns nothing for a window that is not one', () => {
    expect(freeGaps({ busy: [], fromMinutes: at(17), toMinutes: at(9) })).toEqual([]);
  });
});

describe('bestGap', () => {
  it('prefers the longest, not the soonest', () => {
    const gaps = freeGaps({
      ...workday,
      busy: [
        { startMinutes: at(9, 30), endMinutes: at(10) },
        { startMinutes: at(11), endMinutes: at(14) },
      ],
    });
    // 30 minutes at 9, then three hours from 2pm.
    expect(bestGap(gaps)?.minutes).toBe(180);
  });

  it('breaks a tie by taking the earlier one', () => {
    const best = bestGap([
      { startMinutes: at(15), endMinutes: at(16), minutes: 60 },
      { startMinutes: at(11), endMinutes: at(12), minutes: 60 },
    ]);
    expect(best?.startMinutes).toBe(at(11));
  });

  it('has nothing to offer from an empty day', () => {
    expect(bestGap([])).toBeNull();
  });
});
