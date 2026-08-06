import { describe, it, expect } from 'vitest';
import { craftWindow } from './craftWindow';

/** 8:40pm–10:15pm, the shape of an ordinary evening after work. */
const EVENING = { startMinutes: 20 * 60 + 40, endMinutes: 22 * 60 + 15, note: '95 min after work' };
/** Twenty minutes before the day starts, and nothing else. */
const SCRAP = { startMinutes: 6 * 60 + 40, endMinutes: 7 * 60, note: '20 min before work' };

describe('the thirty-minute argument, about a real day', () => {
  it('points at the stretch the minutes would come out of', () => {
    const w = craftWindow({ stretches: [EVENING], minutesPerDay: 30 });
    expect(w.fits).toBe(true);
    expect(w.dayText).toBe('Your longest clear stretch: 95 min after work, 8:40 pm–10:15 pm.');
    expect(w.framingText).toContain('30 of those minutes, 5 days a week, is ~130 hours a year');
  });

  it('refuses to quote an hour the day does not have', () => {
    /* The whole defect this replaces: the old card told somebody whose day
       holds twenty clear minutes that thirty a day is 130 hours a year. */
    const w = craftWindow({ stretches: [SCRAP], minutesPerDay: 30 });
    expect(w.fits).toBe(false);
    expect(w.framingText).toContain('30 a day is not in this day as drawn');
    expect(w.framingText).not.toContain('130 hours');
    expect(w.hoursPerYear).toBe(87);
    expect(w.minutesUsed).toBe(20);
  });

  it('takes the longest stretch, not the first one', () => {
    const w = craftWindow({ stretches: [SCRAP, EVENING], minutesPerDay: 30 });
    expect(w.from?.startMinutes).toBe(EVENING.startMinutes);
    expect(w.longestMinutes).toBe(95);
  });

  it('says plainly when there is no stretch to point at', () => {
    /* Also the not-loaded-yet case, which must not read as a verdict about
       somebody's day. The arithmetic still stands; it just admits it is
       arithmetic. */
    const w = craftWindow({ stretches: [], minutesPerDay: 30 });
    expect(w.from).toBeNull();
    expect(w.dayText).toBe('No clear stretch in this day to point at.');
    expect(w.framingText).toContain('Wherever in the day you find them');
    expect(w.hoursPerYear).toBe(130);
  });

  it('names something they already do, when they named one', () => {
    const w = craftWindow({ stretches: [EVENING], minutesPerDay: 30, craft: 'Guitar' });
    expect(w.framingText).toContain('or that much of Guitar');
  });

  it('never names anything when they named nothing', () => {
    for (const craft of [null, undefined, '', '   ']) {
      const w = craftWindow({ stretches: [EVENING], minutesPerDay: 30, craft });
      expect(w.framingText).toContain('enough for conversational basics of a new language.');
      expect(w.framingText).not.toContain('or that much of');
    }
  });

  it('never prints the length twice in one line', () => {
    /* The day card's note already carries it — "95 min after work" — so a
       stretch described as "95 min, 95 min after work" was the first draft. */
    const w = craftWindow({ stretches: [EVENING], minutesPerDay: 30 });
    expect(w.dayText.match(/95/g)?.length).toBe(1);
  });

  it('describes a stretch the day card never named', () => {
    const w = craftWindow({
      stretches: [{ startMinutes: 14 * 60, endMinutes: 15 * 60 }],
      minutesPerDay: 30,
    });
    expect(w.dayText).toBe('Your longest clear stretch: 60 min clear, 2 pm–3 pm.');
  });

  it('survives the shapes a half-loaded screen hands it', () => {
    expect(craftWindow({ minutesPerDay: 30 }).from).toBeNull();
    expect(craftWindow({ stretches: [{ startMinutes: 60, endMinutes: 60 }], minutesPerDay: 30 }).from)
      .toBeNull();
    /* An end before its start is a bug upstream, not a negative stretch. */
    expect(craftWindow({ stretches: [{ startMinutes: 600, endMinutes: 60 }], minutesPerDay: 30 }).from)
      .toBeNull();
    expect(craftWindow({ minutesPerDay: 0 }).hoursPerYear).toBeGreaterThan(0);
  });

  it('scales with the days a week it is actually asked about', () => {
    const five = craftWindow({ stretches: [EVENING], minutesPerDay: 30 });
    const seven = craftWindow({ stretches: [EVENING], minutesPerDay: 30, daysPerWeek: 7 });
    expect(seven.hoursPerYear).toBeGreaterThan(five.hoursPerYear);
    expect(seven.framingText).toContain('7 days a week');
  });
});
