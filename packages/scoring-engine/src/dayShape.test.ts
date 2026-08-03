import { describe, it, expect } from 'vitest';
import { dayShape, formatClock, formatSpan } from './dayShape';

const FORBIDDEN = /death|dying|lifespan|running out|too late|wasted|lazy|should have/i;

const nineToFive = {
  workStartHour: 9,
  workEndHour: 17,
  commuteMinutes: 60,
  workType: 'onsite',
  sleepHour: 23,
  wakeHour: 7,
};

const walkWithMum = {
  action: 'Walk with Mum after dinner',
  minutes: 60,
  domains: ['family', 'health'],
  reason: 'Family is 40 points short of what you asked of it',
};

const kinds = (s: ReturnType<typeof dayShape>) => s.blocks.map((b) => b.kind);

describe('the clock reads the way people speak', () => {
  it('formats hours and half hours', () => {
    expect(formatClock(0)).toBe('12 am');
    expect(formatClock(9 * 60)).toBe('9 am');
    expect(formatClock(12 * 60)).toBe('12 pm');
    expect(formatClock(17 * 60)).toBe('5 pm');
    expect(formatClock(18 * 60 + 30)).toBe('6:30 pm');
  });

  it('wraps past midnight rather than printing hour 25', () => {
    expect(formatClock(25 * 60)).toBe('1 am');
    expect(formatSpan(23 * 60, 31 * 60)).toBe('11 pm–7 am');
  });
});

describe('a working day takes its shape from the fixed parts', () => {
  it('lays out commute, work, commute, and what is left', () => {
    const s = dayShape({ ...nineToFive, suggestion: null });
    expect(kinds(s)).toEqual([
      'open',      // 7–8am, before leaving
      'commute',   // 8–9
      'work',      // 9–5
      'commute',   // 5–6
      'open',      // 6–11pm
      'sleep',
    ]);
  });

  it('counts the free minutes it actually found', () => {
    const s = dayShape({ ...nineToFive, suggestion: null });
    // 7–8am is 60, 6–11pm is 300.
    expect(s.freeMinutes).toBe(360);
  });

  it('remote work has no commute to spend', () => {
    const s = dayShape({ ...nineToFive, workType: 'remote', suggestion: null });
    expect(kinds(s)).not.toContain('commute');
    expect(s.freeMinutes).toBe(480);
  });

  it('a rest day is not carved up at all', () => {
    const s = dayShape({ ...nineToFive, isWorkday: false, suggestion: null });
    expect(kinds(s)).toEqual(['open', 'sleep']);
    expect(s.framingText).toMatch(/day off/i);
  });

  it('a night shift is a shift, not bad data', () => {
    const s = dayShape({
      workStartHour: 22, workEndHour: 6, commuteMinutes: 0,
      sleepHour: 9, wakeHour: 17, suggestion: null,
    });
    expect(kinds(s)).toContain('work');
    expect(s.freeMinutes).toBeGreaterThan(0);
  });
});

describe('one thing gets placed, in the gap that can hold it', () => {
  it('goes into the longest stretch, at the start of it', () => {
    const s = dayShape({ ...nineToFive, suggestion: walkWithMum });
    const placed = s.blocks.find((b) => b.kind === 'suggested')!;
    // Longest gap is 6–11pm; the hour sits at its front, not "later".
    expect(formatSpan(placed.startMinutes, placed.endMinutes)).toBe('6 pm–7 pm');
    expect(placed.domains).toEqual(['family', 'health']);
    expect(s.placedIn).toEqual({ startMinutes: 18 * 60, endMinutes: 19 * 60 });
  });

  it('leaves the rest of the gap alone', () => {
    const s = dayShape({ ...nineToFive, suggestion: walkWithMum });
    const after = s.blocks.filter((b) => b.kind === 'open' && b.startMinutes === 19 * 60);
    expect(after).toHaveLength(1);
    expect(after[0].endMinutes).toBe(23 * 60);
  });

  it('places exactly one thing, never an agenda', () => {
    const s = dayShape({ ...nineToFive, suggestion: walkWithMum });
    expect(s.blocks.filter((b) => b.kind === 'suggested')).toHaveLength(1);
  });

  it('refuses a gap it does not fit in', () => {
    // Home at 10pm, asleep at 11: an hour does not go into an hour minus dinner.
    const s = dayShape({
      workStartHour: 9, workEndHour: 21, commuteMinutes: 60,
      workType: 'onsite', sleepHour: 23, wakeHour: 8,
      suggestion: { ...walkWithMum, minutes: 120 },
    });
    expect(s.placedIn).toBeNull();
    expect(kinds(s)).not.toContain('suggested');
  });

  it('says so plainly when the day has nothing left in it', () => {
    const s = dayShape({
      workStartHour: 7, workEndHour: 22, commuteMinutes: 30,
      workType: 'onsite', sleepHour: 23, wakeHour: 6,
      suggestion: walkWithMum,
    });
    // A 15-hour day with a commute is a scheduling problem, and the copy has
    // to name it as one rather than implying the reader lacks discipline.
    expect(s.framingText).toMatch(/scheduling problem, not a discipline one/);
    expect(s.framingText).not.toMatch(FORBIDDEN);
  });
});

describe('it never claims to know more than it does', () => {
  it('marks itself assumed when no hours were given', () => {
    const s = dayShape({ suggestion: null });
    expect(s.basis).toBe('assumed');
    expect(s.assumptions.join(' ')).toMatch(/No work hours set/);
  });

  /**
   * The database says "unset" with null, and `Number(null)` is 0 — so nulls
   * read as midnight and the shape drew work from midnight to midnight, then
   * told the reader there was nothing left in their day. Caught in a browser,
   * not here: the first version of this test passed `{}`, and `undefined` is
   * the one empty value that does produce NaN.
   */
  it('treats a null hour as unset, not as midnight', () => {
    const s = dayShape({
      workStartHour: null, workEndHour: null, commuteMinutes: null,
      sleepHour: 22, wakeHour: 7, suggestion: null,
    });
    expect(s.basis).toBe('assumed');
    const work = s.blocks.find((b) => b.kind === 'work')!;
    expect(formatSpan(work.startMinutes, work.endMinutes)).toBe('9 am–5 pm');
    // Which means there is a real evening in it, not a fifteen-hour shift:
    // awake 7am–10pm is 15 hours, less an 8-hour day and no commute.
    expect(s.freeMinutes).toBe(7 * 60);
    expect(s.framingText).not.toMatch(/nothing left at all/);
  });

  /**
   * Onboarding asks how many hours a week someone works and nothing had ever
   * read it here, so a person who said sixty was shown a nine-to-five and a
   * person who said zero was shown a job they do not have.
   */
  it('derives the day from the week the person already gave', () => {
    const long = dayShape({ workHoursPerWeek: 60, sleepHour: 23, wakeHour: 7, suggestion: null });
    const work = long.blocks.find((b) => b.kind === 'work')!;
    // 60/5 = 12h, starting from the assumed 9am.
    expect(formatSpan(work.startMinutes, work.endMinutes)).toBe('9 am–9 pm');
    expect(long.assumptions.join(' ')).toMatch(/~60h week/);
  });

  it('a shorter week gives a shorter day, not the same one', () => {
    const short = dayShape({ workHoursPerWeek: 20, sleepHour: 23, wakeHour: 7, suggestion: null });
    const work = short.blocks.find((b) => b.kind === 'work')!;
    expect(formatSpan(work.startMinutes, work.endMinutes)).toBe('9 am–1 pm');
  });

  it('nobody who said they are not working gets a working day drawn', () => {
    const none = dayShape({ workHoursPerWeek: 0, sleepHour: 23, wakeHour: 7, suggestion: null });
    expect(kinds(none)).not.toContain('work');
    expect(kinds(none)).not.toContain('commute');
    expect(none.assumptions.join(' ')).toMatch(/not working right now/);
  });

  it('stated hours still beat the derived ones', () => {
    const both = dayShape({
      workStartHour: 7, workEndHour: 15, workHoursPerWeek: 60,
      sleepHour: 23, wakeHour: 6, suggestion: null,
    });
    const work = both.blocks.find((b) => b.kind === 'work')!;
    expect(formatSpan(work.startMinutes, work.endMinutes)).toBe('7 am–3 pm');
    expect(both.basis).toBe('stated');
  });

  it('an empty string is unset too', () => {
    const s = dayShape({
      workStartHour: '' as any, workEndHour: '' as any, suggestion: null,
    });
    const work = s.blocks.find((b) => b.kind === 'work')!;
    expect(formatSpan(work.startMinutes, work.endMinutes)).toBe('9 am–5 pm');
  });

  it('marks itself stated once it has been told', () => {
    const s = dayShape({ ...nineToFive, suggestion: null });
    expect(s.basis).toBe('stated');
    expect(s.assumptions.join(' ')).toMatch(/hours you gave/);
  });

  it('always says it does not know about meetings', () => {
    for (const input of [{}, nineToFive, { ...nineToFive, isWorkday: false }]) {
      const s = dayShape(input as any);
      expect(s.assumptions.join(' ')).toMatch(/not a plan for today/);
    }
  });

  it('carries no blaming language in any branch', () => {
    const inputs = [
      { ...nineToFive, suggestion: walkWithMum },
      { ...nineToFive, suggestion: null },
      { ...nineToFive, isWorkday: false, suggestion: null },
      { workStartHour: 6, workEndHour: 23, commuteMinutes: 0, sleepHour: 23, wakeHour: 6, suggestion: walkWithMum },
    ];
    for (const i of inputs) {
      const s = dayShape(i as any);
      expect(s.framingText).not.toMatch(FORBIDDEN);
    }
  });

  it('survives nonsense inputs without producing a broken clock', () => {
    const s = dayShape({
      workStartHour: 99, workEndHour: -4, commuteMinutes: NaN as any,
      sleepHour: 'late' as any, wakeHour: null,
      suggestion: { action: 'x', minutes: NaN as any, domains: [] },
    });
    for (const b of s.blocks) {
      expect(Number.isFinite(b.startMinutes)).toBe(true);
      expect(Number.isFinite(b.endMinutes)).toBe(true);
      expect(b.endMinutes).toBeGreaterThan(b.startMinutes);
    }
    expect(s.framingText).not.toMatch(/NaN|Infinity|undefined/);
    expect(Number.isFinite(s.freeMinutes)).toBe(true);
  });

  it('blocks never overlap and run in order', () => {
    const s = dayShape({ ...nineToFive, suggestion: walkWithMum });
    for (let i = 1; i < s.blocks.length; i++) {
      expect(s.blocks[i].startMinutes).toBeGreaterThanOrEqual(s.blocks[i - 1].endMinutes);
    }
  });
});
