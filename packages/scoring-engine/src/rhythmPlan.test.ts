import { describe, it, expect } from 'vitest';
import {
  rhythmWeekdays, rhythmDueToday, preferredMinutes, isPlaceable, type Weekday,
} from './rhythmPlan';

/** A date on a known weekday, local time. 2026-08-03 is a Monday. */
const MON = new Date('2026-08-03T09:00:00');
const day = (offsetDays: number, hour = 9) =>
  new Date(2026, 7, 3 + offsetDays, hour, 0, 0);

describe('rhythmWeekdays — the spread', () => {
  it('spreads three a week rather than bunching them', () => {
    const { days, basis } = rhythmWeekdays({ key: 'health.move', perWeek: 3, now: MON });
    expect(days).toHaveLength(3);
    expect(basis).toBe('spread');
    // Gaps around the circle should be 2 or 3 — never four days on, three off.
    const gaps = days.map((d, i) => ((days[(i + 1) % 3] - d + 7) % 7) || 7);
    for (const g of gaps) expect(g).toBeGreaterThanOrEqual(2);
    expect(gaps.reduce((a, b) => a + b, 0)).toBe(7);
  });

  it('gives every day to a daily rhythm', () => {
    expect(rhythmWeekdays({ key: 'purpose.open', perWeek: 7, now: MON }).days)
      .toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('does not pile every weekly rhythm onto the same day', () => {
    const keys = ['career.next', 'finance.review', 'family.call', 'purpose.hour', 'growth.hard'];
    const landed = keys.map((key) => rhythmWeekdays({ key, perWeek: 1, now: MON }).days[0]);
    expect(new Set(landed).size).toBeGreaterThan(1);
  });

  it('is stable — the same rhythm lands on the same day every time', () => {
    const a = rhythmWeekdays({ key: 'family.call', perWeek: 2, now: MON }).days;
    const b = rhythmWeekdays({ key: 'family.call', perWeek: 2, now: MON }).days;
    expect(a).toEqual(b);
  });

  it('sends an outing to the weekend', () => {
    const { days } = rhythmWeekdays({
      key: 'experiences.near', perWeek: 1, prefersWeekend: true, now: MON,
    });
    expect(days).toEqual([6]);
  });
});

describe('rhythmWeekdays — learning from what they do', () => {
  /** Ticks on the same weekday across several weeks. */
  const everyWednesday = [day(2), day(9), day(16), day(23)];

  it('uses the days they actually use, once earned', () => {
    const { days, basis } = rhythmWeekdays({
      key: 'health.move', perWeek: 1, history: everyWednesday, now: day(24),
    });
    expect(basis).toBe('observed');
    expect(days).toEqual([3]); // Wednesday
  });

  it('refuses a pattern built inside one week', () => {
    const oneGoodWeek = [day(0), day(1), day(2), day(3)];
    const { basis } = rhythmWeekdays({
      key: 'health.move', perWeek: 2, history: oneGoodWeek, now: day(4),
    });
    expect(basis).toBe('spread');
  });

  it('refuses a pattern built on two ticks', () => {
    const { basis } = rhythmWeekdays({
      key: 'health.move', perWeek: 1, history: [day(2), day(9)], now: day(10),
    });
    expect(basis).toBe('spread');
  });

  it('ignores a routine from six months ago', () => {
    const old = [-200, -193, -186, -179].map((d) => day(d));
    const { basis } = rhythmWeekdays({ key: 'health.move', perWeek: 1, history: old, now: MON });
    expect(basis).toBe('spread');
  });

  it('picks the busiest weekdays when it has more than it needs', () => {
    const history = [
      day(1), day(8), day(15),        // three Tuesdays
      day(3), day(10), day(17),       // three Thursdays
      day(5),                          // one Saturday
    ];
    const { days } = rhythmWeekdays({ key: 'health.move', perWeek: 2, history, now: day(18) });
    expect(days).toEqual([2, 4]); // Tue, Thu — the Saturday drops out
  });
});

describe('rhythmDueToday', () => {
  const days: Weekday[] = [1, 3, 5]; // Mon, Wed, Fri

  it('is due on a planned day', () => {
    expect(rhythmDueToday({ days, perWeek: 3, doneThisWeek: 0, today: 3 })).toBe(true);
  });

  it('is not due on an unplanned day with the week still open', () => {
    expect(rhythmDueToday({ days, perWeek: 3, doneThisWeek: 1, today: 2 })).toBe(false);
  });

  it('never asks a fourth time for something asked three times', () => {
    expect(rhythmDueToday({ days, perWeek: 3, doneThisWeek: 3, today: 5 })).toBe(false);
  });

  it('offers an unplanned day when the week is running out', () => {
    // Thursday, nothing done, and only Friday left of the planned three.
    expect(rhythmDueToday({ days, perWeek: 3, doneThisWeek: 0, today: 4 })).toBe(true);
  });

  it('does not invent urgency when the planned days still cover it', () => {
    // Tuesday, one done, two planned days left for the two still needed.
    expect(rhythmDueToday({ days, perWeek: 3, doneThisWeek: 1, today: 2 })).toBe(false);
  });

  it('counts the week from Monday, so Sunday is the last day not the first', () => {
    // Sunday, one of one done — finished, regardless of planned days.
    expect(rhythmDueToday({ days: [1], perWeek: 1, doneThisWeek: 1, today: 0 })).toBe(false);
    // Sunday, none done, Monday already gone: the week is out of planned days.
    expect(rhythmDueToday({ days: [1], perWeek: 1, doneThisWeek: 0, today: 0 })).toBe(true);
  });
});

describe('preferredMinutes', () => {
  it('anchors a morning rhythm to the morning', () => {
    expect(preferredMinutes({ when: 'morning' })).toBe(7 * 60);
  });

  it('anchors an evening rhythm to the evening', () => {
    expect(preferredMinutes({ when: 'evening' })).toBe(19 * 60);
  });

  it('leaves an anytime rhythm to the day shape', () => {
    expect(preferredMinutes({ when: 'any' })).toBeNull();
    expect(preferredMinutes({})).toBeNull();
  });

  it('refuses to place a rhythm that belongs inside the working day', () => {
    expect(preferredMinutes({ when: 'work' })).toBeNull();
    expect(isPlaceable('work')).toBe(false);
    expect(isPlaceable('morning')).toBe(true);
  });

  it('what they do beats what the activity usually wants', () => {
    expect(preferredMinutes({ when: 'morning', observedMinutes: 21 * 60 })).toBe(21 * 60);
  });

  it('never returns an hour outside a day', () => {
    expect(preferredMinutes({ observedMinutes: 1500 })).toBe(60);
    expect(preferredMinutes({ observedMinutes: -60 })).toBe(23 * 60);
  });
});
