import { describe, it, expect } from 'vitest';
import {
  cleanHobbies, readHobbies, missedMost, COMMON_HOBBIES, NO_HOBBIES,
} from './hobbies';

describe('what somebody actually does', () => {
  it('takes what was typed, tidied', () => {
    expect(cleanHobbies(['  Guitar ', 'Reading'])).toEqual(['Guitar', 'Reading']);
    expect(cleanHobbies(['long   gaps   between'])).toEqual(['long gaps between']);
  });

  it('does not list the same thing twice however it was capitalised', () => {
    expect(cleanHobbies(['Guitar', 'guitar', 'GUITAR'])).toEqual(['Guitar']);
  });

  /* Not a storage worry: a person who lists twenty hobbies has told the model
     nothing, and a prompt carrying twenty will pick the wrong one. */
  it('caps the list, because a long one says less than a short one', () => {
    const many = Array.from({ length: 30 }, (_, i) => `Thing ${i}`);
    expect(cleanHobbies(many)).toHaveLength(8);
  });

  it('survives anything that is not a list of strings', () => {
    for (const junk of [null, undefined, 'guitar', 42, {}, [1, null, {}]]) {
      expect(cleanHobbies(junk)).toEqual([]);
    }
  });
});

/**
 * The split is the whole design. Asked as one question the answers merge, and
 * the app starts telling somebody to play the guitar they gave up when the
 * second child arrived — which reads as an accusation.
 */
describe('what you keep, and what you miss', () => {
  it('keeps the two apart', () => {
    const h = readHobbies(['Cooking'], ['Guitar', 'Cycling']);
    expect(h.current).toEqual(['Cooking']);
    expect(h.lapsed).toEqual(['Guitar', 'Cycling']);
  });

  it('lets kept win when something is in both lists', () => {
    const h = readHobbies(['Guitar'], ['guitar', 'Cycling']);
    expect(h.current).toEqual(['Guitar']);
    expect(h.lapsed).toEqual(['Cycling']);
  });

  it('is empty and harmless when nothing was asked', () => {
    expect(readHobbies(null, undefined)).toEqual(NO_HOBBIES);
  });

  it('names the one they thought of first, not one it picked', () => {
    expect(missedMost(readHobbies([], ['Guitar', 'Cycling']))).toBe('Guitar');
  });

  it('stays generic when nothing was missed — which is a fine rung', () => {
    expect(missedMost(NO_HOBBIES)).toBeNull();
    expect(missedMost(readHobbies(['Cooking'], []))).toBeNull();
  });
});

describe('the shelf offered as taps', () => {
  it('is a starting shelf, not a taxonomy', () => {
    expect(COMMON_HOBBIES.length).toBeGreaterThan(20);
    expect(COMMON_HOBBIES.length).toBeLessThan(40);
  });

  it('has no duplicates and nothing blank', () => {
    const all = [...COMMON_HOBBIES];
    expect(new Set(all.map((h) => h.toLowerCase())).size).toBe(all.length);
    for (const h of all) expect(h.trim()).toBe(h);
  });

  /* Every offered tap must survive the cleaner, or a reader could tap
     something the app then silently drops. */
  it('survives its own cleaning', () => {
    expect(cleanHobbies([...COMMON_HOBBIES].slice(0, 8))).toHaveLength(8);
  });
});
