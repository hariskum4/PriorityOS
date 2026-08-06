import { describe, it, expect } from 'vitest';
import { dayShape, formatClock, formatSpan, formatRun } from './dayShape';

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

  /**
   * Found against a real profile: a twelve-hour day with an hour either side
   * of it makes two gaps of exactly the same size, and a stable sort gave it
   * to the earlier one — which is how "Call Appa — not a text" came to be
   * proposed for seven in the morning.
   */
  it('breaks a tie towards the evening, not the alarm clock', () => {
    const s = dayShape({
      workStartHour: 9, workEndHour: 21, commuteMinutes: 0, workType: 'remote',
      sleepHour: 23, wakeHour: 7, suggestion: walkWithMum,
    });
    // 7–9am and 9–11pm are both two hours.
    expect(formatSpan(s.placedIn!.startMinutes, s.placedIn!.endMinutes)).toBe('9 pm–10 pm');
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

/**
 * The shape was the same every weekday, which is exactly wrong on the days
 * that matter: it drew an evening at home for someone in an airport and a
 * commute for someone who had not left the house.
 */
describe('today can be a different kind of day', () => {
  it('working from home spends no time getting there', () => {
    const s = dayShape({ ...nineToFive, dayType: 'remote', suggestion: null });
    expect(kinds(s)).not.toContain('commute');
    // The two hours the commute was eating come back as the person's own.
    expect(s.freeMinutes).toBe(480);
    expect(s.assumptions.join(' ')).toMatch(/working from home/);
  });

  it("today's answer beats the standing one, in both directions", () => {
    const usuallyRemote = { ...nineToFive, workType: 'remote' };
    expect(kinds(dayShape({ ...usuallyRemote, suggestion: null }))).not.toContain('commute');
    // Normally home, travelling today: more transit than usual, not less.
    expect(kinds(dayShape({ ...usuallyRemote, dayType: 'travel', suggestion: null })))
      .toContain('commute');
  });

  it('a day off clears the work out of it', () => {
    const s = dayShape({ ...nineToFive, dayType: 'off', suggestion: null });
    expect(kinds(s)).toEqual(['open', 'sleep']);
    expect(s.framingText).toMatch(/day off/i);
    // And stops explaining where work would have gone on a day there is none.
    expect(s.assumptions.join(' ')).not.toMatch(/Built from the hours you gave/);
  });

  /**
   * Caught in a browser on the second tap anybody would try. A day off could
   * always hold a suggestion, but the framing was written when it could not,
   * so the card read "Nothing here is scheduled" directly above a scheduled
   * thing sitting in the reader's evening.
   */
  it('does not claim a day off is empty while placing something in it', () => {
    const s = dayShape({ ...nineToFive, dayType: 'off', suggestion: walkWithMum });
    expect(s.placedIn).not.toBeNull();
    expect(s.framingText).toMatch(/day off/i);
    expect(s.framingText).not.toMatch(/Nothing here is scheduled/);
    expect(s.framingText).toMatch(/One thing is pencilled into 60 minutes/);
    expect(s.framingText).toMatch(/move it or ignore it/);
  });

  it('still says a bare day off is a bare day off', () => {
    const s = dayShape({ ...nineToFive, dayType: 'off', suggestion: null });
    expect(s.framingText).toMatch(/Nothing here is scheduled/);
  });

  it('travelling counts at least an hour and a half of getting about', () => {
    const s = dayShape({ ...nineToFive, commuteMinutes: 15, dayType: 'travel', suggestion: null });
    const transit = s.blocks.filter((b) => b.kind === 'commute');
    expect(transit).toHaveLength(2);
    expect(transit[0].endMinutes - transit[0].startMinutes).toBe(90);
    expect(transit[0].label).toMatch(/transit/i);
  });

  /**
   * The one case where the right answer is to place nothing. An app that
   * schedules a walk with your mother into a departure lounge has stopped
   * describing the reader's life and started describing a template.
   */
  it('places nothing on a travelling day, and says why', () => {
    const s = dayShape({ ...nineToFive, dayType: 'travel', suggestion: walkWithMum });
    expect(s.placedIn).toBeNull();
    expect(s.placedBy).toBeNull();
    expect(kinds(s)).not.toContain('suggested');
    expect(s.framingText).toMatch(/nothing here knows where you will be/i);
    // But the hours it does have are still counted and still offered.
    expect(s.freeMinutes).toBeGreaterThan(0);
    expect(s.framingText).not.toMatch(FORBIDDEN);
  });

  it('a travelling day with nothing left in it does not pretend otherwise', () => {
    const s = dayShape({
      workStartHour: 8, workEndHour: 20, commuteMinutes: 0,
      sleepHour: 22, wakeHour: 7, dayType: 'travel', suggestion: walkWithMum,
    });
    expect(s.placedIn).toBeNull();
    expect(s.framingText).toMatch(/no real stretch left/i);
    expect(s.framingText).not.toMatch(FORBIDDEN);
  });

  it('carries no blaming language on any kind of day', () => {
    for (const dayType of ['usual', 'remote', 'travel', 'off'] as const) {
      const s = dayShape({ ...nineToFive, dayType, suggestion: walkWithMum });
      expect(s.framingText).not.toMatch(FORBIDDEN);
      expect(s.framingText).not.toMatch(/NaN|undefined/);
    }
  });
});

/**
 * The front of the gap is a rule about people. The hour someone has actually
 * used a dozen times is a fact about this one, and a fact outranks a rule.
 */
describe('it places things at the hour the person actually uses', () => {
  const at = (minutes: number, sampleSize = 9, days = 6) => ({ minutes, sampleSize, days });

  it('moves the hour to where the evening really starts', () => {
    const s = dayShape({ ...nineToFive, suggestion: walkWithMum, activeAt: at(21 * 60) });
    expect(formatSpan(s.placedIn!.startMinutes, s.placedIn!.endMinutes)).toBe('9 pm–10 pm');
    expect(s.placedBy).toBe('observed');
  });

  it('leaves the hours before it as the person’s own, not as a hole', () => {
    const s = dayShape({ ...nineToFive, suggestion: walkWithMum, activeAt: at(21 * 60) });
    // 6–11pm becomes: yours 6–9, the hour 9–10, yours 10–11. Nothing vanishes.
    for (let i = 1; i < s.blocks.length; i++) {
      expect(s.blocks[i].startMinutes).toBe(s.blocks[i - 1].endMinutes);
    }
    expect(s.blocks.filter((b) => b.kind === 'suggested')).toHaveLength(1);
  });

  it('says what the hour rests on rather than asserting it', () => {
    const s = dayShape({ ...nineToFive, suggestion: walkWithMum, activeAt: at(21 * 60, 12, 8) });
    expect(s.assumptions.join(' ')).toMatch(/12 things you finished across 8 days/);
    expect(s.framingText).toMatch(/when you actually get to things/);
  });

  it('falls back to the front of the gap when there is no reading', () => {
    const s = dayShape({ ...nineToFive, suggestion: walkWithMum, activeAt: null });
    expect(formatSpan(s.placedIn!.startMinutes, s.placedIn!.endMinutes)).toBe('6 pm–7 pm');
    expect(s.placedBy).toBe('front-of-gap');
    expect(s.assumptions.join(' ')).not.toMatch(/things you finished/);
  });

  it('does not shuffle an hour by ten minutes to look clever', () => {
    // 6:10pm is inside the 6–11pm gap, but moving there buys nothing and
    // leaves a ten-minute "Yours" crumb drawn as an opportunity.
    const s = dayShape({ ...nineToFive, suggestion: walkWithMum, activeAt: at(18 * 60 + 10) });
    expect(formatSpan(s.placedIn!.startMinutes, s.placedIn!.endMinutes)).toBe('6 pm–7 pm');
    expect(s.placedBy).toBe('front-of-gap');
  });

  it('ignores an hour the day cannot honour', () => {
    // They finish things at 11pm; the gap ends at 11pm and the hour will not
    // fit. Better the front of the evening than a plan that runs into sleep.
    const s = dayShape({ ...nineToFive, suggestion: walkWithMum, activeAt: at(23 * 60) });
    expect(s.placedIn!.endMinutes).toBeLessThanOrEqual(23 * 60);
    expect(s.placedBy).toBe('front-of-gap');
  });

  it('will use a shorter gap if that is the one they actually use', () => {
    // Morning person: awake 6, work 9–5, commute 30. The 6–8:30am gap is
    // shorter than the evening, and it is the one they have proved they use.
    const s = dayShape({
      workStartHour: 9, workEndHour: 17, commuteMinutes: 30, workType: 'onsite',
      sleepHour: 22, wakeHour: 6, suggestion: walkWithMum, activeAt: at(7 * 60),
    });
    expect(formatSpan(s.placedIn!.startMinutes, s.placedIn!.endMinutes)).toBe('7 am–8 am');
    expect(s.placedBy).toBe('observed');
  });

  it('reads an after-midnight hour as tonight, not as this morning', () => {
    const s = dayShape({
      workStartHour: 9, workEndHour: 17, commuteMinutes: 0,
      sleepHour: 1, wakeHour: 7, suggestion: walkWithMum, activeAt: at(0),
    });
    // Awake until 1am, and midnight belongs at the end of that stretch.
    expect(s.placedIn!.startMinutes).toBeGreaterThan(17 * 60);
    expect(formatSpan(s.placedIn!.startMinutes, s.placedIn!.endMinutes)).toBe('12 am–1 am');
  });

  it('a reading does not override a travelling day', () => {
    const s = dayShape({
      ...nineToFive, dayType: 'travel', suggestion: walkWithMum, activeAt: at(21 * 60),
    });
    expect(s.placedIn).toBeNull();
  });

  it('survives a nonsense reading', () => {
    for (const minutes of [NaN, Infinity, -90, 99_999]) {
      const s = dayShape({ ...nineToFive, suggestion: walkWithMum, activeAt: at(minutes) });
      expect(Number.isFinite(s.placedIn?.startMinutes ?? 0)).toBe(true);
      expect(s.framingText).not.toMatch(/NaN|Infinity|undefined/);
    }
  });
});

/**
 * The one-thing rule comes from choice overload and is right where it came
 * from — the dashboard, answering "what now". Applied to a day off it produced
 * a card showing fifteen free hours with a single fifteen-minute item in it,
 * which is not restraint, it is having nothing to say.
 */
describe('a day with room in it holds more than one thing', () => {
  const three = [
    { key: 'a', action: 'Call Appa', minutes: 30, domains: ['family'] },
    { key: 'b', action: 'Walk before it gets hot', minutes: 45, domains: ['health'] },
    { key: 'c', action: 'An hour on the project', minutes: 60, domains: ['purpose'] },
  ];
  const placedOf = (s: ReturnType<typeof dayShape>) =>
    s.blocks.filter((b) => b.kind === 'suggested');

  it('a packed weekday still gets exactly one', () => {
    // Out at 8, home at 8, asleep at 11: four hours, and not a free four.
    const s = dayShape({
      workStartHour: 9, workEndHour: 19, commuteMinutes: 60, workType: 'onsite',
      sleepHour: 23, wakeHour: 7, suggestions: three,
    });
    expect(s.freeMinutes).toBe(240);
    expect(placedOf(s)).toHaveLength(1);
  });

  it('an ordinary evening gets two', () => {
    const s = dayShape({ ...nineToFive, suggestions: three });
    expect(s.freeMinutes).toBe(360);
    expect(placedOf(s)).toHaveLength(2);
  });

  it('a day off gets three, and never a fourth', () => {
    const s = dayShape({
      ...nineToFive, dayType: 'off',
      suggestions: [...three, { key: 'd', action: 'A fourth thing', minutes: 30, domains: [] }],
    });
    expect(placedOf(s)).toHaveLength(3);
  });

  it('never claims more than half the free day', () => {
    const s = dayShape({
      ...nineToFive, dayType: 'off',
      suggestions: [
        { key: 'a', action: 'Long one', minutes: 180, domains: [] },
        { key: 'b', action: 'Another long one', minutes: 180, domains: [] },
        { key: 'c', action: 'A third', minutes: 180, domains: [] },
      ],
    });
    expect(s.committedMinutes).toBeLessThanOrEqual(s.freeMinutes / 2);
  });

  it('leaves room to breathe between them', () => {
    const s = dayShape({ ...nineToFive, dayType: 'off', suggestions: three });
    const placed = placedOf(s);
    for (let i = 1; i < placed.length; i++) {
      expect(placed[i].startMinutes - placed[i - 1].endMinutes).toBeGreaterThanOrEqual(30);
    }
  });

  /**
   * Caught in a browser. A fixed half-hour separation queued three things at
   * 7am, 7:45am and 8:25am on a fifteen-hour day off, leaving twelve untouched
   * hours below them. Nobody plans a free Saturday that way.
   */
  it('spreads across a free day instead of queueing at the alarm clock', () => {
    const s = dayShape({ ...nineToFive, dayType: 'off', suggestions: three });
    const placed = placedOf(s);
    expect(placed).toHaveLength(3);
    const span = placed[2].endMinutes - placed[0].startMinutes;
    // Three things across a fifteen-hour day should cover most of it, not the
    // first morning of it.
    expect(span).toBeGreaterThan(8 * 60);
  });

  it('does not spread a short evening into nonsense', () => {
    const s = dayShape({ ...nineToFive, suggestions: three });
    const placed = placedOf(s);
    for (const p of placed) {
      expect(p.startMinutes).toBeGreaterThanOrEqual(7 * 60);
      expect(p.endMinutes).toBeLessThanOrEqual(23 * 60);
    }
  });

  it('draws a contiguous day — no holes between the rows', () => {
    const s = dayShape({ ...nineToFive, dayType: 'off', suggestions: three });
    for (let i = 1; i < s.blocks.length; i++) {
      expect(s.blocks[i].startMinutes).toBe(s.blocks[i - 1].endMinutes);
    }
  });

  it('one suggestion still behaves exactly as it always did', () => {
    const a = dayShape({ ...nineToFive, suggestion: walkWithMum });
    const b = dayShape({ ...nineToFive, suggestions: [walkWithMum] });
    expect(a.placedIn).toEqual(b.placedIn);
    expect(a.framingText).toBe(b.framingText);
  });

  it('places nothing at all on a travelling day, however much room there is', () => {
    const s = dayShape({ ...nineToFive, dayType: 'travel', suggestions: three });
    expect(s.placements).toHaveLength(0);
    expect(s.committedMinutes).toBe(0);
  });

  it('stops when nothing left will hold the next one', () => {
    const s = dayShape({
      ...nineToFive,
      suggestions: [
        { key: 'a', action: 'Fits', minutes: 60, domains: [] },
        { key: 'b', action: 'Does not', minutes: 180, domains: [] },
      ],
    });
    expect(s.placements.map((p) => p.key)).toEqual(['a']);
  });

  it('survives an empty or junk list without placing nonsense', () => {
    expect(dayShape({ ...nineToFive, suggestions: [] }).placements).toHaveLength(0);
    const s = dayShape({
      ...nineToFive,
      suggestions: [
        { action: '', minutes: 30, domains: [] },
        { action: '   ', minutes: 30, domains: [] },
        { action: 'Real', minutes: NaN as any, domains: null as any },
      ],
    });
    expect(s.placements).toHaveLength(1);
    expect(s.placements[0].action).toBe('Real');
    expect(s.placements[0].domains).toEqual([]);
    expect(s.placements[0].endMinutes).toBeGreaterThan(s.placements[0].startMinutes);
  });
});

/**
 * The shape puts things where the evidence says they go. The reader is the
 * authority on their own Tuesday, and a control that silently does nothing is
 * worse than one that stops at the edge.
 */
describe('the reader can move a placement', () => {
  it('moves it later by the minutes asked for', () => {
    const s = dayShape({
      ...nineToFive, suggestion: { ...walkWithMum, key: 'walk' },
      nudges: { walk: 120 },
    });
    // Naturally 6pm; asked for two hours later.
    expect(formatSpan(s.placedIn!.startMinutes, s.placedIn!.endMinutes)).toBe('8 pm–9 pm');
    expect(s.placements[0].nudgedBy).toBe(120);
  });

  it('moves it earlier too', () => {
    const s = dayShape({
      ...nineToFive, dayType: 'off',
      suggestion: { ...walkWithMum, key: 'walk' }, nudges: { walk: 180 },
    });
    const back = dayShape({
      ...nineToFive, dayType: 'off',
      suggestion: { ...walkWithMum, key: 'walk' }, nudges: { walk: -60 },
    });
    expect(s.placedIn!.startMinutes).toBeGreaterThan(back.placedIn!.startMinutes);
  });

  /**
   * "Later" sometimes means after work. A nudge big enough to reach another
   * free stretch should land there rather than stopping at the edge of the
   * morning it started in.
   */
  it('a big enough move reaches a different free stretch', () => {
    const morningPerson = {
      workStartHour: 12, workEndHour: 20, commuteMinutes: 0, workType: 'remote',
      sleepHour: 23, wakeHour: 5,
      suggestion: { ...walkWithMum, key: 'walk', minutes: 60 },
    };
    // Roomiest stretch is 5am–12pm, so it starts there.
    expect(formatSpan(
      dayShape(morningPerson).placedIn!.startMinutes,
      dayShape(morningPerson).placedIn!.endMinutes,
    )).toBe('5 am–6 am');
    // Fifteen hours later is 8pm — past work, in the evening stretch.
    const moved = dayShape({ ...morningPerson, nudges: { walk: 15 * 60 } });
    expect(formatSpan(moved.placedIn!.startMinutes, moved.placedIn!.endMinutes)).toBe('8 pm–9 pm');
  });

  it('clamps rather than pushing it into work or sleep', () => {
    const s = dayShape({
      ...nineToFive, suggestion: { ...walkWithMum, key: 'walk' },
      nudges: { walk: 10 * 60 },
    });
    // 6–11pm holds an hour; the latest it can start is 10pm.
    expect(s.placedIn!.endMinutes).toBeLessThanOrEqual(23 * 60);
    expect(formatSpan(s.placedIn!.startMinutes, s.placedIn!.endMinutes)).toBe('10 pm–11 pm');
  });

  it('says that a move was the reader’s, not its own idea', () => {
    const s = dayShape({
      ...nineToFive, suggestion: { ...walkWithMum, key: 'walk' }, nudges: { walk: 60 },
    });
    expect(s.assumptions.join(' ')).toMatch(/You moved something here/);
  });

  it('keys by action when a suggestion has no key of its own', () => {
    const s = dayShape({
      ...nineToFive, suggestion: walkWithMum,
      nudges: { 'Walk with Mum after dinner': 60 },
    });
    expect(formatSpan(s.placedIn!.startMinutes, s.placedIn!.endMinutes)).toBe('7 pm–8 pm');
  });

  it('ignores a nudge for something that is not on the day', () => {
    const a = dayShape({ ...nineToFive, suggestion: walkWithMum });
    const b = dayShape({ ...nineToFive, suggestion: walkWithMum, nudges: { nothing: 300 } });
    expect(a.placedIn).toEqual(b.placedIn);
  });

  /**
   * The number is the caller's only way to ask where a thing actually sits,
   * and the caller adds its next step to it. Reported against the wrong
   * origin, three taps of "earlier" moved nothing at all: the stored offset
   * had been clamped away and each tap was adding to a number the day had
   * already refused.
   */
  it('reports the move it actually made, not the one that was asked for', () => {
    // 6–11pm holds an hour, so ten hours later clamps to a four-hour move.
    const s = dayShape({
      ...nineToFive, suggestion: { ...walkWithMum, key: 'walk' },
      nudges: { walk: 10 * 60 },
    });
    expect(s.placements[0].nudgedBy).toBe(4 * 60);
    // And feeding that back in, plus one step, lands exactly one step away.
    const back = dayShape({
      ...nineToFive, suggestion: { ...walkWithMum, key: 'walk' },
      nudges: { walk: s.placements[0].nudgedBy - 30 },
    });
    expect(formatSpan(back.placedIn!.startMinutes, back.placedIn!.endMinutes))
      .toBe('9:30 pm–10:30 pm');
  });

  it('measures a move that crossed into another stretch from where it began', () => {
    const morningPerson = {
      workStartHour: 12, workEndHour: 20, commuteMinutes: 0, workType: 'remote',
      sleepHour: 23, wakeHour: 5,
      suggestion: { ...walkWithMum, key: 'walk', minutes: 60 },
    };
    const moved = dayShape({ ...morningPerson, nudges: { walk: 15 * 60 } });
    // 5am to 8pm is fifteen hours, and that is what it should report — not
    // the nothing it moved within the evening stretch it landed in.
    expect(moved.placements[0].nudgedBy).toBe(15 * 60);
  });

  it('is stable when its own answer is fed back to it', () => {
    let nudge = 0;
    for (let i = 0; i < 5; i++) {
      const s = dayShape({
        ...nineToFive, suggestion: { ...walkWithMum, key: 'walk' },
        nudges: { walk: nudge },
      });
      nudge = s.placements[0].nudgedBy;
    }
    expect(nudge).toBe(0);
  });

  it('survives a nonsense nudge', () => {
    for (const n of [NaN, Infinity, -Infinity, 1e9, 'later' as any]) {
      const s = dayShape({
        ...nineToFive, suggestion: { ...walkWithMum, key: 'walk' }, nudges: { walk: n },
      });
      expect(Number.isFinite(s.placedIn!.startMinutes)).toBe(true);
      expect(s.placedIn!.endMinutes).toBeLessThanOrEqual(23 * 60);
      expect(s.placedIn!.startMinutes).toBeGreaterThanOrEqual(7 * 60);
    }
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

  it('says which day it drew, so the caller can never guess wrong', () => {
    expect(dayShape({ suggestion: null }).dayType).toBe('usual');
    expect(dayShape({ dayType: 'travel', suggestion: null }).dayType).toBe('travel');
    // Nonsense falls back rather than throwing or drawing nothing.
    expect(dayShape({ dayType: 'brunch' as any, suggestion: null }).dayType).toBe('usual');
  });

  it('blocks never overlap and run in order', () => {
    const s = dayShape({ ...nineToFive, suggestion: walkWithMum });
    for (let i = 1; i < s.blocks.length; i++) {
      expect(s.blocks[i].startMinutes).toBeGreaterThanOrEqual(s.blocks[i - 1].endMinutes);
    }
  });

  it('names a homemaker\'s spoken-for hours as the household, not a job', () => {
    // Same shape, different word — "Work 9–5" over a homemaker's day is the
    // card describing a job she does not have.
    const s = dayShape({ workType: 'homemaker', workStartHour: 8, workEndHour: 18 });
    const block = s.blocks.find((b) => b.kind === 'work')!;
    expect(block.label).toBe('The household');
    expect(s.assumptions.join(' ')).toMatch(/the household day/);
    expect(s.assumptions.join(' ')).not.toMatch(/: work /);

    // And an employee's day still reads as work.
    const office = dayShape({ workType: 'office_9_5', workStartHour: 9, workEndHour: 17 });
    expect(office.blocks.find((b) => b.kind === 'work')!.label).toBe('Work');
  });

  it('spreads a homemaker\'s stated week and says whose hours they are', () => {
    const s = dayShape({ workType: 'homemaker', workHoursPerWeek: 45 });
    expect(s.assumptions.join(' ')).toMatch(/the household takes/);
  });
});

/**
 * A rhythm knows something the day shape does not: a walk belongs to a
 * morning and a call home belongs to an evening. The front-of-the-gap rule
 * is the right default for a thing with no opinion, and the wrong answer
 * for a thing that has one.
 */
describe('a suggestion can ask for its own hour', () => {
  const morningWalk = {
    key: 'rhythm:health.move',
    action: 'Move three times a week',
    minutes: 40,
    domains: ['health'],
    at: 7 * 60,
  };
  const eveningCall = {
    key: 'rhythm:family.call',
    action: 'Call home, the same day every week',
    minutes: 20,
    domains: ['family'],
    at: 19 * 60,
  };

  it('places a morning rhythm in the morning, not the front of the evening', () => {
    const s = dayShape({ ...nineToFive, suggestions: [morningWalk] });
    expect(formatSpan(s.placedIn!.startMinutes, s.placedIn!.endMinutes)).toBe('7 am–7:40 am');
  });

  it('names the stretch it actually landed in, not the roomiest one', () => {
    // The evening is by far the longest gap; the walk is in the morning.
    const s = dayShape({ ...nineToFive, suggestions: [morningWalk] });
    expect(s.framingText).not.toMatch(/6 pm/);
    expect(s.framingText).toMatch(/7 am/);
  });

  it('says an hour was chosen for the thing, without claiming to have watched them', () => {
    const s = dayShape({ ...nineToFive, suggestions: [eveningCall] });
    expect(s.placedBy).toBe('preferred');
    expect(s.framingText).toMatch(/the part of the day it belongs to/);
  });

  it('gives each thing its own hour rather than stacking them', () => {
    const s = dayShape({ ...nineToFive, suggestions: [morningWalk, eveningCall] });
    const spans = s.placements.map((p) => formatClock(p.startMinutes));
    expect(spans).toEqual(['7 am', '7 pm']);
  });

  it('falls back to the ordinary rule when the asked-for hour has no room', () => {
    // Asleep at 3am: no free stretch contains it, so the rule takes over.
    const s = dayShape({ ...nineToFive, suggestions: [{ ...morningWalk, at: 3 * 60 }] });
    expect(s.placedBy).toBe('front-of-gap');
    expect(s.placements).toHaveLength(1);
  });

  it('does not claim a catalog hint is something they were observed doing', () => {
    const s = dayShape({
      ...nineToFive,
      suggestions: [eveningCall],
      activeAt: { minutes: 21 * 60, sampleSize: 9, days: 6 },
    });
    expect(s.placedBy).toBe('preferred');
    expect(s.assumptions.join(' ')).not.toMatch(/is not a guess/);
    expect(s.framingText).not.toMatch(/when you actually get to things/);
  });

  it('leaves a suggestion with no opinion to the front-of-gap rule', () => {
    const s = dayShape({ ...nineToFive, suggestion: walkWithMum });
    expect(s.placedBy).toBe('front-of-gap');
  });

  it('keeps the day continuous around an hour it did not choose', () => {
    const s = dayShape({ ...nineToFive, suggestions: [morningWalk, eveningCall] });
    for (let i = 1; i < s.blocks.length; i++) {
      expect(s.blocks[i].startMinutes).toBe(s.blocks[i - 1].endMinutes);
    }
    expect(s.framingText).not.toMatch(FORBIDDEN);
  });
});

/**
 * The reader moves a rhythm, and the day agrees.
 *
 * Pressing "later" and watching nothing move is the same failure as the
 * nudge that clamped in silence — arrived at from the other side, via a
 * tidying rule that outranked an answer.
 */
describe('an hour that was asked for is not tidied away', () => {
  const walkAt = (at: number) => ({
    key: 'rhythm:health.move',
    action: 'Move three times a week',
    minutes: 40,
    domains: ['health'],
    at,
  });

  it('honours a quarter past, even at the front of the stretch', () => {
    // Morning stretch runs 7–8:30; 7:15 is inside the tidy-away window.
    const s = dayShape({ ...nineToFive, suggestions: [walkAt(7 * 60 + 15)] });
    expect(formatClock(s.placedIn!.startMinutes)).toBe('7:15 am');
    expect(s.placedBy).toBe('preferred');
  });

  it('still tidies a placement the engine chose itself', () => {
    const s = dayShape({
      ...nineToFive,
      suggestion: walkWithMum,
      activeAt: { minutes: 18 * 60 + 10, sampleSize: 9, days: 6 },
    });
    // Evening begins at 6pm; a reading ten minutes in is not a real gap.
    expect(formatClock(s.placedIn!.startMinutes)).toBe('6 pm');
    expect(s.placedBy).toBe('front-of-gap');
  });

  it('leaves the minutes before it as the reader’s own, not a hole', () => {
    const s = dayShape({ ...nineToFive, suggestions: [walkAt(7 * 60 + 15)] });
    for (let i = 1; i < s.blocks.length; i++) {
      expect(s.blocks[i].startMinutes).toBe(s.blocks[i - 1].endMinutes);
    }
  });
});

/**
 * A meeting dies and two hours appear.
 *
 * The shape is a typical day everywhere else; this is the one thing it is
 * told about today in particular, and only because the reader said so.
 */
describe('time that was spoken for and is not any more', () => {
  const freed = [{ startMinutes: 13 * 60, endMinutes: 15 * 60 }]; // 1–3pm

  it('splits the working day either side of the hole', () => {
    const s = dayShape({ ...nineToFive, freed });
    const work = s.blocks.filter((b) => b.kind === 'work');
    expect(work).toHaveLength(2);
    expect(formatSpan(work[0].startMinutes, work[0].endMinutes)).toBe('9 am–1 pm');
    expect(formatSpan(work[1].startMinutes, work[1].endMinutes)).toBe('3 pm–5 pm');
  });

  it('hands the freed hours back as ordinary free time', () => {
    const before = dayShape(nineToFive).freeMinutes;
    const after = dayShape({ ...nineToFive, freed }).freeMinutes;
    expect(after - before).toBe(120);
  });

  it('will place something in it', () => {
    const s = dayShape({
      ...nineToFive,
      freed,
      suggestions: [{
        key: 'rhythm:career.deep',
        action: 'One block nobody is allowed to interrupt',
        minutes: 90,
        domains: ['career'],
        at: 13 * 60,
      }],
    });
    expect(formatClock(s.placedIn!.startMinutes)).toBe('1 pm');
  });

  it('leaves the day continuous, with nothing overlapping', () => {
    const s = dayShape({ ...nineToFive, freed });
    for (let i = 1; i < s.blocks.length; i++) {
      expect(s.blocks[i].startMinutes).toBe(s.blocks[i - 1].endMinutes);
    }
  });

  it('drops a block the hole covers entirely', () => {
    const s = dayShape({
      ...nineToFive,
      freed: [{ startMinutes: 8 * 60, endMinutes: 9 * 60 }], // the morning commute
    });
    const commutes = s.blocks.filter((b) => b.kind === 'commute');
    expect(commutes).toHaveLength(1); // only the trip home survives
  });

  it('cannot free the night, however wide the window it is given', () => {
    // Waking hours bound every gap, so "the whole day is free" clears the
    // work out of it and still does not hand anybody their sleep to spend.
    const s = dayShape({
      ...nineToFive,
      freed: [{ startMinutes: 0, endMinutes: 24 * 60 }],
    });
    expect(s.blocks.some((b) => b.kind === 'sleep')).toBe(true);
    expect(s.freeMinutes).toBeLessThanOrEqual(16 * 60); // 7am–11pm, no more
    expect(s.blocks.some((b) => b.kind === 'work')).toBe(false);
  });

  it('ignores a window that is not one', () => {
    const s = dayShape({
      ...nineToFive,
      freed: [{ startMinutes: 15 * 60, endMinutes: 13 * 60 }] as never,
    });
    expect(s.freeMinutes).toBe(dayShape(nineToFive).freeMinutes);
  });

  it('changes nothing when no meeting died', () => {
    expect(dayShape({ ...nineToFive, freed: [] }).freeMinutes)
      .toBe(dayShape(nineToFive).freeMinutes);
  });
});

/**
 * The seven o'clock bedtime.
 *
 * "Protecting 7–8 hours of sleep" arrived as an ordinary suggestion with five
 * minutes on it. The shape placed it the way it places everything, in the
 * roomiest free stretch at the hour its part-of-day asked for, and drew a
 * block of sleep at 7pm — in the hours between getting home and going to bed,
 * the ones the reader still had. Nobody lies down for ten minutes at seven.
 *
 * What a bedtime costs is not ten minutes of an evening. It is the decision
 * to stop, and the only row on this card where that means anything is the one
 * that already says when sleep starts.
 */
describe('what happens at the edge of a day rather than inside it', () => {
  const bedtime = {
    key: 'rhythm:sleep',
    action: 'Lights out at the same hour',
    domains: ['health'],
    reason: 'Sleep is the lever that moves every other one, and the cheapest to pull.',
  };

  it('draws it against the sleep the reader already gave', () => {
    const s = dayShape({ ...nineToFive, boundaries: [bedtime] });
    const asleep = s.blocks.find((b) => b.kind === 'sleep')!;
    expect(asleep.startMinutes).toBe(23 * 60);
    expect(asleep.note).toContain('Lights out at the same hour');
    expect(asleep.note).toContain('the cheapest to pull');
    expect(asleep.domains).toEqual(['health']);
  });

  it('never places it, whatever the day has room for', () => {
    const s = dayShape({ ...nineToFive, boundaries: [bedtime] });
    expect(s.placements).toHaveLength(0);
    expect(s.committedMinutes).toBe(0);
    expect(s.blocks.some((b) => b.kind === 'suggested')).toBe(false);
    /* And nowhere near the evening anchor, which is where it used to land. */
    expect(s.blocks.some((b) => b.kind === 'suggested' && b.startMinutes === 19 * 60))
      .toBe(false);
  });

  it('costs none of the hours somebody has left', () => {
    const withIt = dayShape({ ...nineToFive, boundaries: [bedtime] });
    const without = dayShape(nineToFive);
    expect(withIt.freeMinutes).toBe(without.freeMinutes);
    /* The framing is the number the reader actually reads. A boundary that
       showed up in "2 things are pencilled into 50 minutes" would have moved
       the block and kept the lie. */
    expect(withIt.framingText).toBe(without.framingText);
  });

  it('leaves room for the things that are genuinely placed', () => {
    const s = dayShape({ ...nineToFive, suggestions: [walkWithMum], boundaries: [bedtime] });
    expect(s.placements).toHaveLength(1);
    expect(s.placements[0].action).toBe('Walk with Mum after dinner');
    expect(s.framingText).not.toMatch(/2 things|two things/i);
  });

  it('names several without stacking their reasons', () => {
    const s = dayShape({
      ...nineToFive,
      boundaries: [bedtime, { action: 'Phone charges outside the bedroom', domains: ['growth'], reason: 'x' }],
    });
    const asleep = s.blocks.find((b) => b.kind === 'sleep')!;
    expect(asleep.note).toBe('Lights out at the same hour · Phone charges outside the bedroom');
    expect(asleep.domains).toEqual(['health', 'growth']);
  });

  it('leaves the sleep row alone when nothing is kept against it', () => {
    const asleep = dayShape(nineToFive).blocks.find((b) => b.kind === 'sleep')!;
    expect(asleep.note).toBeUndefined();
    expect(asleep.domains).toBeUndefined();
  });

  it('is not fooled by an empty one', () => {
    const asleep = dayShape({ ...nineToFive, boundaries: [{ action: '  ' }] })
      .blocks.find((b) => b.kind === 'sleep')!;
    expect(asleep.note).toBeUndefined();
  });
});

/**
 * The defect this block exists for, reported from a real screen: the settings
 * panel read "Work starts 10am / Work ends 3pm / Sleep starts 12pm", and the
 * day drawn underneath read "Work 10 am–12 pm" — above a provenance line
 * still saying "the hours you gave: work 10 am–3 pm". Three hours of somebody's
 * working afternoon were clipped away by the waking window and never mentioned.
 */
describe('when the quiet hours swallow the working day', () => {
  const noonSleeper = {
    workStartHour: 10,
    workEndHour: 15,
    commuteMinutes: 15,
    workType: 'onsite',
    sleepHour: 12,
    wakeHour: 8,
  };

  it('draws the whole working day rather than the part that fits', () => {
    const work = dayShape(noonSleeper).blocks.find((b) => b.kind === 'work')!;
    expect(work.startMinutes).toBe(10 * 60);
    expect(work.endMinutes).toBe(15 * 60);
  });

  it('never contradicts its own provenance line', () => {
    const s = dayShape(noonSleeper);
    const work = s.blocks.find((b) => b.kind === 'work')!;
    expect(s.assumptions.join(' ')).toContain(formatSpan(work.startMinutes, work.endMinutes));
  });

  it('says so, quoting both answers back', () => {
    const s = dayShape(noonSleeper);
    expect(s.conflict?.kind).toBe('sleep-covers-work');
    expect(s.conflict?.text).toContain('10 am–3 pm');
    expect(s.conflict?.text).toContain('12 pm');
    expect(s.conflict?.text).toContain('8 am');
  });

  it('keeps the commute home inside the waking day too', () => {
    const asleep = dayShape(noonSleeper).blocks.find((b) => b.kind === 'sleep')!;
    expect(asleep.startMinutes).toBeGreaterThanOrEqual(15 * 60 + 15);
  });

  it('leaves an ordinary day alone', () => {
    const s = dayShape(nineToFive);
    expect(s.conflict).toBeNull();
    const work = s.blocks.find((b) => b.kind === 'work')!;
    expect(work.startMinutes).toBe(9 * 60);
    expect(work.endMinutes).toBe(17 * 60);
  });

  /* A night shift against the house defaults collides by construction. The
     shape still yields to the work, but it does not accuse somebody of
     answers they never gave. */
  it('stays silent when the sleeping hours were never stated', () => {
    const s = dayShape({ workStartHour: 22, workEndHour: 6, workType: 'onsite' });
    expect(s.conflict).toBeNull();
    const work = s.blocks.find((b) => b.kind === 'work')!;
    expect(work.endMinutes - work.startMinutes).toBe(8 * 60);
  });

  it('does not invent a conflict on a day off', () => {
    expect(dayShape({ ...noonSleeper, dayType: 'off' }).conflict).toBeNull();
  });

  it('says nothing forbidden while saying it', () => {
    expect(dayShape(noonSleeper).conflict!.text).not.toMatch(FORBIDDEN);
  });
});

describe('a run of time, said the way a person would say it', () => {
  it('keeps short things in minutes', () => {
    expect(formatRun(20)).toBe('20 min');
    expect(formatRun(45)).toBe('45 min');
    expect(formatRun(89)).toBe('89 min');
  });

  it('moves to hours and halves once it is worth talking about in hours', () => {
    expect(formatRun(90)).toBe('1½h');
    expect(formatRun(120)).toBe('2h');
    expect(formatRun(150)).toBe('2½h');
    expect(formatRun(240)).toBe('4h');
  });
});

/**
 * "Yours" was the largest area of the card and the least informative: three
 * rows carrying the same word, one of them forty minutes before work and one
 * of them the entire evening.
 */
describe('the free stretches say what they are', () => {
  it('names the length and where it sits', () => {
    const notes = dayShape(nineToFive).blocks
      .filter((b) => b.kind === 'open').map((b) => b.note);
    expect(notes.some((n) => /before work/.test(n ?? ''))).toBe(true);
    expect(notes.some((n) => /after work/.test(n ?? ''))).toBe(true);
  });

  /* Found by an ICU nurse who wakes at five in the afternoon: the stretch
     before her ten o'clock shift was labelled "before the day starts", by
     which time her day was five hours old. */
  it('anchors the label to work, which is fixed, not to "the day", which is not', () => {
    const nightShift = dayShape({
      workStartHour: 22, workEndHour: 6, commuteMinutes: 30,
      workType: 'shift', sleepHour: 9, wakeHour: 17,
    });
    const notes = nightShift.blocks.filter((b) => b.kind === 'open').map((b) => b.note ?? '');
    expect(notes.some((n) => /before work/.test(n))).toBe(true);
    for (const n of notes) expect(n).not.toMatch(/before the day starts/);
  });

  it('measures the stretch, not the whole evening', () => {
    const evening = dayShape({ ...nineToFive, suggestions: [] }).blocks
      .filter((b) => b.kind === 'open')
      .find((b) => /after work/.test(b.note ?? ''))!;
    expect(evening.note).toBe(
      `${formatRun(evening.endMinutes - evening.startMinutes)} after work`,
    );
  });

  it('does not talk about work on a day there is none', () => {
    const notes = dayShape({ ...nineToFive, dayType: 'off' }).blocks
      .filter((b) => b.kind === 'open').map((b) => b.note ?? '');
    expect(notes.length).toBeGreaterThan(0);
    expect(notes.every((n) => /clear$/.test(n))).toBe(true);
  });

  it('says nothing forbidden', () => {
    for (const b of dayShape(nineToFive).blocks) {
      expect(b.note ?? '').not.toMatch(FORBIDDEN);
    }
  });
});

/**
 * The device calendar was already being read and thrown away — it sized a
 * freed hour and never touched the day. A typical day drawn over a real
 * evening that is already booked is the card at its least useful.
 */
describe('the hours a calendar says are already taken', () => {
  const withEvening = {
    ...nineToFive,
    busy: [{ startMinutes: 19 * 60, endMinutes: 20 * 60 + 30 }],
  };

  it('draws them', () => {
    const b = dayShape(withEvening).blocks.find((x) => x.kind === 'booked')!;
    expect(b.startMinutes).toBe(19 * 60);
    expect(b.endMinutes).toBe(20 * 60 + 30);
    expect(b.label).toBe('Booked');
  });

  it('never plans into them', () => {
    const s = dayShape({ ...withEvening, suggestion: walkWithMum });
    for (const p of s.placements) {
      expect(p.startMinutes >= 20 * 60 + 30 || p.endMinutes <= 19 * 60).toBe(true);
    }
  });

  it('does not repeat an hour the working day already claims', () => {
    const s = dayShape({ ...nineToFive, busy: [{ startMinutes: 11 * 60, endMinutes: 12 * 60 }] });
    expect(s.blocks.some((b) => b.kind === 'booked')).toBe(false);
  });

  it('keeps only the part of a straddling meeting that is news', () => {
    const s = dayShape({ ...nineToFive, busy: [{ startMinutes: 16 * 60, endMinutes: 19 * 60 }] });
    const b = s.blocks.find((x) => x.kind === 'booked')!;
    // Work ends at 5pm and the commute home runs to 6pm; only 6–7 is new.
    expect(b.startMinutes).toBe(18 * 60);
    expect(b.endMinutes).toBe(19 * 60);
  });

  it('merges a double-booked hour rather than inventing a gap in it', () => {
    const s = dayShape({
      ...nineToFive,
      busy: [
        { startMinutes: 19 * 60, endMinutes: 20 * 60 },
        { startMinutes: 19 * 60 + 30, endMinutes: 21 * 60 },
      ],
    });
    const booked = s.blocks.filter((b) => b.kind === 'booked');
    expect(booked).toHaveLength(1);
    expect(booked[0].endMinutes).toBe(21 * 60);
  });

  it('ignores nonsense rather than drawing it', () => {
    const s = dayShape({
      ...nineToFive,
      busy: [
        { startMinutes: 20 * 60, endMinutes: 20 * 60 },
        { startMinutes: 21 * 60, endMinutes: 20 * 60 },
        null as any,
      ],
    });
    expect(s.blocks.some((b) => b.kind === 'booked')).toBe(false);
  });

  it('stops promising it knows nothing about your meetings', () => {
    const said = dayShape(withEvening).assumptions.join(' ');
    expect(said).not.toMatch(/nothing here knows about your meetings/);
    expect(said).toMatch(/calendar was read on this device/);
  });

  it('still promises it on a day nothing was read', () => {
    expect(dayShape(nineToFive).assumptions.join(' '))
      .toMatch(/nothing here knows about your meetings/);
  });
});

/**
 * The day-type chips are a correction to today and reset with it, which made
 * "day off" something to tap every Saturday and every Sunday, forever.
 */
describe('the week somebody actually works', () => {
  const monToFri = { ...nineToFive, workDays: [1, 2, 3, 4, 5] };

  it('draws no work on a day off the list', () => {
    const s = dayShape({ ...monToFri, weekday: 0 });
    expect(s.blocks.some((b) => b.kind === 'work')).toBe(false);
    expect(s.blocks.some((b) => b.kind === 'commute')).toBe(false);
  });

  it('draws it on a day that is on the list', () => {
    const s = dayShape({ ...monToFri, weekday: 3 });
    expect(s.blocks.some((b) => b.kind === 'work')).toBe(true);
  });

  it('says which day it is talking about', () => {
    expect(dayShape({ ...monToFri, weekday: 6 }).assumptions.join(' '))
      .toContain('Saturday is not one of your working days');
  });

  it('changes nothing when the week was never given', () => {
    const s = dayShape({ ...nineToFive, weekday: 0 });
    expect(s.blocks.some((b) => b.kind === 'work')).toBe(true);
  });

  it('changes nothing when the weekday is unknown', () => {
    expect(dayShape(monToFri).blocks.some((b) => b.kind === 'work')).toBe(true);
  });

  it('ignores days that are not days', () => {
    const s = dayShape({ ...nineToFive, workDays: [9, -1, 1.5] as any, weekday: 0 });
    expect(s.blocks.some((b) => b.kind === 'work')).toBe(true);
  });
});

/**
 * Kamala keeps a house in Hyderabad from six in the morning until nine at
 * night. The card names her block "The household" and the footer calls it
 * "the household day" — and then labelled the hour before it "60 min before
 * work", which is the word this whole `careWorkIsWork` path exists to avoid.
 * My own doing: anchoring the free stretches to work is what fixed the ICU
 * nurse, and it walked straight into the homemaker.
 */
describe('a day nobody in it would call work', () => {
  const household = {
    wakeHour: 5, sleepHour: 23,
    workStartHour: 6, workEndHour: 21, workHoursPerWeek: 70,
    commuteMinutes: 0, workType: 'homemaker',
    weekday: 4,
  } as const;

  it('names the free stretches the way it names the block', () => {
    const shape = dayShape({ ...household });
    const notes = shape.blocks.filter((b) => b.kind === 'open').map((b) => b.note ?? '');
    expect(notes.length).toBeGreaterThan(0);
    for (const n of notes) expect(n).not.toMatch(/\bwork\b/);
    expect(notes.join(' ')).toMatch(/household day/);
  });

  it('still says work to somebody who goes to work', () => {
    const shape = dayShape({
      wakeHour: 7, sleepHour: 23, workStartHour: 9, workEndHour: 17,
      workHoursPerWeek: 40, commuteMinutes: 30, workType: 'office_9_5', weekday: 4,
    });
    const notes = shape.blocks.filter((b) => b.kind === 'open').map((b) => b.note ?? '');
    expect(notes.join(' ')).toMatch(/\bwork\b/);
    expect(notes.join(' ')).not.toMatch(/household/);
  });
});

/**
 * Configurations nobody would design, which the profile nonetheless allows.
 *
 * `workStartHour` and `workEndHour` each pass their own 0..23 check
 * independently, so setting both to nine is a reachable typo rather than an
 * exotic one — and `<=` swept it in with the night shifts, read it as a
 * twenty-four hour working day, and produced a Sleep block running 2010 to
 * 1860: a hundred and fifty minutes long, in the negative. The card lays
 * itself out from these numbers, so a row of negative height is arithmetic
 * the whole screen inherits, not a cosmetic slip.
 */
describe('a day that cannot happen still has to draw', () => {
  const base = {
    wakeHour: 7, sleepHour: 23, workStartHour: 9, workEndHour: 17,
    workHoursPerWeek: 40, commuteMinutes: 30, weekday: 4,
  } as const;

  const CONTRADICTIONS: Array<[string, Record<string, unknown>]> = [
    ['work starting and ending at the same hour', { workStartHour: 9, workEndHour: 9 }],
    ['waking and sleeping at the same hour', { wakeHour: 7, sleepHour: 7 }],
    ['midnight to midnight', { wakeHour: 0, sleepHour: 0 }],
    ['every hour of the week worked', { workHoursPerWeek: 168, workStartHour: 0, workEndHour: 23 }],
    ['a ten-hour commute', { commuteMinutes: 600 }],
    ['every number at zero', {
      wakeHour: 0, sleepHour: 0, workStartHour: 0, workEndHour: 0,
      commuteMinutes: 0, workHoursPerWeek: 0,
    }],
  ];

  it.each(CONTRADICTIONS)('draws no impossible block for %s', (_label, over) => {
    const shape = dayShape({ ...base, ...over });
    for (const b of shape.blocks) {
      expect(Number.isFinite(b.startMinutes)).toBe(true);
      expect(Number.isFinite(b.endMinutes)).toBe(true);
      expect(b.endMinutes).toBeGreaterThan(b.startMinutes);
    }
  });

  it.each(CONTRADICTIONS)('still has something to show for %s', (_label, over) => {
    /* Dropping malformed blocks must not empty the card — the guard is there
       so a contradiction costs a row, not the screen. */
    expect(dayShape({ ...base, ...over }).blocks.length).toBeGreaterThan(0);
  });

  it('keeps the night shift, which is not a contradiction', () => {
    const shape = dayShape({ ...base, workStartHour: 22, workEndHour: 6 });
    const work = shape.blocks.find((b) => b.kind === 'work')!;
    expect(work.endMinutes - work.startMinutes).toBe(8 * 60);
  });

  it('gives a contradicted working day the assumed hours rather than the whole clock', () => {
    /* Somebody who told us something impossible knows no more than somebody
       who told us nothing, so they get what an unanswered profile gets. */
    const shape = dayShape({ ...base, workStartHour: 9, workEndHour: 9 });
    const work = shape.blocks.find((b) => b.kind === 'work')!;
    expect(work.endMinutes - work.startMinutes).toBeLessThan(24 * 60);
    expect(work.endMinutes - work.startMinutes).toBe(8 * 60);
  });
});
