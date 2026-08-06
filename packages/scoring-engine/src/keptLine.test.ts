import { describe, it, expect } from 'vitest';
import { keptLine } from './keptLine';

describe('the week in one sentence', () => {
  it('says nothing at all about a week with nothing done', () => {
    /* A scold, otherwise. Somebody who did nothing already knows. */
    expect(keptLine({ done: 0, kept: 0 })).toBeNull();
  });

  it('names the gap without naming a fault', () => {
    expect(keptLine({ done: 11, kept: 3 })).toBe('11 things done. 3 left a moment behind.');
  });

  it('states an empty archive as a fact and stops there', () => {
    /* The whole design: the absence speaks, the app does not. No advice
       clause, no "try writing one" — the sentence ends where the fact does. */
    const line = keptLine({ done: 7, kept: 0 })!;
    expect(line).toBe('7 things done. Nothing kept from any of them.');
    expect(line).not.toMatch(/try|should|next week|why not/i);
  });

  it('reads as flatly for a full week as for an empty one', () => {
    /* Praise is a reward, rewards get chased, and chasing is the behaviour
       this line exists not to encourage. */
    const full = keptLine({ done: 4, kept: 4 })!;
    expect(full).toBe('4 things done, and a moment kept from every one.');
    expect(full).not.toMatch(/great|well done|amazing|proud|keep it up|!/i);
  });

  it('never says "1 things"', () => {
    expect(keptLine({ done: 1, kept: 0 })).toBe('1 thing done. Nothing kept from it.');
    expect(keptLine({ done: 1, kept: 1 })).toBe('1 thing done, and kept.');
  });

  it('cannot print more kept than done', () => {
    /* The two numbers come from different queries. A count that drifted must
       not be able to say "12 of 9". */
    expect(keptLine({ done: 9, kept: 12 })).toBe('9 things done, and a moment kept from every one.');
  });

  it('survives the shapes a database can hand it', () => {
    expect(keptLine({ done: -3, kept: -1 })).toBeNull();
    expect(keptLine({ done: 5.7, kept: 2.2 })).toBe('5 things done. 2 left a moment behind.');
  });

  it('never prints NaN over somebody\'s week', () => {
    /* A column added this week is absent from every row written before it.
       The first real week this ran against returned `undefined` and the
       sentence read "7 things done. NaN left a moment behind." — a statement
       about a life assembled from a missing field. */
    const missing = keptLine({ done: 7 } as any);
    expect(missing).toBe('7 things done. Nothing kept from any of them.');
    expect(keptLine({ done: 7, kept: NaN } as any)).toBe('7 things done. Nothing kept from any of them.');
    expect(keptLine({ done: NaN, kept: NaN } as any)).toBeNull();
    expect(keptLine({ done: '4', kept: '2' } as any)).toBeNull();
    expect(keptLine(undefined as any)).toBeNull();
  });

  it('never advises, praises or asks, whatever the numbers', () => {
    for (let done = 0; done <= 30; done += 1) {
      for (let kept = 0; kept <= 30; kept += 1) {
        const line = keptLine({ done, kept });
        if (line === null) continue;
        expect(line).not.toMatch(/[?!]/);
        expect(line).not.toMatch(/you should|try |remember to|don't forget/i);
      }
    }
  });
});
