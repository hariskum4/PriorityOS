import { describe, it, expect } from 'vitest';
import { feelingOptions } from './feelings';

describe('the last question is asked in their own terms', () => {
  it('names the person they just told us about', () => {
    const out = feelingOptions({ personName: 'Amma', ranking: ['family'] });
    expect(out[0]).toBe('closer to Amma');
  });

  /**
   * The admission is more recent and more specific than the ranking. Someone
   * who ranked career first and then said health is drifting is telling you
   * about health.
   */
  it('puts what is drifting ahead of what was ranked', () => {
    const out = feelingOptions({
      ranking: ['career', 'family', 'health'],
      neglected: ['health'],
    });
    expect(out.indexOf('stronger')).toBeLessThan(out.indexOf('less behind at work'));
  });

  it('follows the ranking after that, in order', () => {
    const out = feelingOptions({ ranking: ['finance', 'growth', 'impact'] });
    expect(out.slice(0, 3)).toEqual([
      'less anxious about money', 'like I am learning again', 'useful to someone',
    ]);
  });

  it('fills the rest from words that belong to no domain', () => {
    const out = feelingOptions({ ranking: ['finance'] });
    expect(out).toContain('lighter');
    expect(out).toContain('proud of myself');
  });
});

describe('it always renders something', () => {
  it('answers an empty onboarding with the universal set', () => {
    expect(feelingOptions()).toEqual(['lighter', 'present', 'proud of myself']);
    expect(feelingOptions({})).toHaveLength(3);
  });

  it('survives unrecognised domains without producing blanks', () => {
    const out = feelingOptions({ ranking: ['astrology', 'family'] });
    expect(out).not.toContain('');
    expect(out).toContain('closer to my family');
  });

  it('survives nulls in every field', () => {
    expect(() => feelingOptions({
      ranking: null, neglected: null, personName: null,
    })).not.toThrow();
    expect(feelingOptions({ personName: '   ' })[0]).not.toMatch(/closer to\s*$/);
  });
});

describe('it stays a short list', () => {
  it('never offers more than six', () => {
    expect(feelingOptions({
      personName: 'Amma',
      ranking: ['family', 'health', 'career', 'finance', 'growth', 'friends', 'purpose'],
      neglected: ['reflection', 'impact', 'experiences'],
    })).toHaveLength(6);
  });

  it('never repeats itself when a domain is both ranked and drifting', () => {
    const out = feelingOptions({ ranking: ['health', 'family'], neglected: ['health'] });
    expect(new Set(out).size).toBe(out.length);
  });

  it('does not collide the person with their own domain', () => {
    const out = feelingOptions({
      personName: 'Amma', ranking: ['family'], neglected: ['family'],
    });
    expect(out).toContain('closer to Amma');
    expect(out).toContain('closer to my family');
    expect(new Set(out).size).toBe(out.length);
  });
});
