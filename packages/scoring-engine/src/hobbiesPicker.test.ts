import { describe, it, expect } from 'vitest';
import { suggestHobbies, searchHobbies, COMMON_HOBBIES } from './hobbies';

/**
 * Twenty-nine chips, rendered twice, is fifty-eight controls on a screen that
 * also holds a profession, a country, a theme and a partner invite. These
 * cover the two functions that replaced them.
 */
describe('offering a few instead of all of them', () => {
  it('draws them from the domains the reader ranked, in that order', () => {
    const growth = suggestHobbies({
      domains: [{ domainType: 'growth', importance: 9 }, { domainType: 'health', importance: 2 }],
    });
    const health = suggestHobbies({
      domains: [{ domainType: 'health', importance: 9 }, { domainType: 'growth', importance: 2 }],
    });
    expect(growth).not.toEqual(health);
    expect(growth[0]).toBe('Reading');
    expect(health[0]).toBe('Walking');
  });

  it('withholds the vigorous ones from somebody who told us about a limit', () => {
    const limited = suggestHobbies({
      domains: [{ domainType: 'health', importance: 10 }],
      movementLimits: 'ask_doctor',
    });
    for (const h of ['Running', 'Football', 'Cycling', 'Swimming', 'Cricket', 'Badminton']) {
      expect(limited).not.toContain(h);
    }
    /* Still four, and still about health — withholding is not the same as
       having nothing to say. */
    expect(limited).toHaveLength(4);
    expect(limited).toContain('Walking');
  });

  it('never offers what is already chosen in either list', () => {
    const s = suggestHobbies({
      domains: [{ domainType: 'growth', importance: 9 }],
      exclude: ['Reading', 'Languages'],
    });
    expect(s).not.toContain('Reading');
    expect(s).not.toContain('Languages');
    expect(s).toHaveLength(4);
  });

  it('still answers when nothing has been ranked yet', () => {
    /* The onboarding case, and the cold start. Exactly as good as the head of
       the shelf it replaces — which is what it is. */
    expect(suggestHobbies()).toEqual(['Reading', 'Music', 'Cooking', 'Walking']);
  });

  it('only ever offers things from the shelf', () => {
    const s = suggestHobbies({ domains: [{ domainType: 'children', importance: 9 }] });
    for (const h of s) expect(COMMON_HOBBIES as readonly string[]).toContain(h);
  });
});

describe('finding one by typing', () => {
  it('puts what the reader is spelling first', () => {
    /* "wa" means Walking long before it means Birdwatching, and a plain
       `includes` returns them in list order instead. */
    expect(searchHobbies('wa')[0]).toBe('Walking');
    expect(searchHobbies('wa')).toContain('Birdwatching');
  });

  it('matches inside a word too, so nothing is unreachable', () => {
    expect(searchHobbies('guit')).toEqual(['Guitar']);
    expect(searchHobbies('ing').length).toBeGreaterThan(1);
  });

  it('is case-insensitive', () => {
    expect(searchHobbies('YOGA')).toEqual(['Yoga']);
  });

  it('returns nothing for an empty query rather than everything', () => {
    /* Returning all twenty-nine here would rebuild the wall this replaced. */
    expect(searchHobbies('')).toEqual([]);
    expect(searchHobbies('   ')).toEqual([]);
  });

  it('leaves out what is already taken', () => {
    expect(searchHobbies('r', ['Reading'])).not.toContain('Reading');
  });

  it('says nothing at all when the shelf has no answer', () => {
    /* And the caller offers "Add …" — being absent from a list of hobbies is
       a small insult, and this is the question where it lands hardest. */
    expect(searchHobbies('pottery')).toEqual([]);
  });
});
