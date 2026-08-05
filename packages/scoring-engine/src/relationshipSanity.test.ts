import { describe, it, expect } from 'vitest';
import {
  relationshipSanity, relationshipBlocked, defaultsForRelation,
  asksAboutCalls, asksAboutWish, visitDefaultFor, parseAge, type SanityFinding,
} from './relationshipSanity';

const keys = (f: SanityFinding[]) => f.map((x) => x.key);
const base = {
  name: 'Amma', relationType: 'mother', age: 66, userAge: 34,
  locationType: 'different_city', callFrequency: 'monthly',
  desiredCallFrequency: 'weekly', inPersonFrequency: 'quarterly',
};

describe('age is the input the arithmetic is built on', () => {
  it('blocks when it is missing', () => {
    const f = relationshipSanity({ ...base, age: null });
    expect(keys(f)).toContain('age.missing');
    expect(relationshipBlocked(f)).toBe(true);
  });

  it('blocks on an empty string, which is what an untouched field holds', () => {
    expect(relationshipBlocked(relationshipSanity({ ...base, age: '' }))).toBe(true);
    expect(relationshipBlocked(relationshipSanity({ ...base, age: '   ' }))).toBe(true);
  });

  it('blocks on something that is not a number', () => {
    const f = relationshipSanity({ ...base, age: 'sixty' });
    expect(keys(f)).toContain('age.unusable');
  });

  it('blocks on ages nobody has', () => {
    for (const age of [-3, 200, 1e9, Infinity, NaN]) {
      expect(relationshipBlocked(relationshipSanity({ ...base, age }))).toBe(true);
    }
  });

  it('takes a typed string, because that is what a text field holds', () => {
    expect(relationshipBlocked(relationshipSanity({ ...base, age: '66' }))).toBe(false);
    expect(parseAge('66')).toBe(66);
    expect(parseAge('66.7')).toBe(66);
    expect(parseAge('')).toBeNull();
  });

  it('a newborn is a real age', () => {
    const f = relationshipSanity({
      ...base, relationType: 'child', age: 0, userAge: 34, locationType: 'same_home',
      callFrequency: 'daily', desiredCallFrequency: 'daily', inPersonFrequency: 'daily',
    });
    expect(relationshipBlocked(f)).toBe(false);
  });
});

/**
 * Stated as arithmetic, never as a comment about the relationship. These are
 * typos, and the message has to read like one.
 */
describe('generations only go one way', () => {
  it('a parent cannot be younger than the person describing them', () => {
    const f = relationshipSanity({ ...base, relationType: 'mother', age: 30, userAge: 34 });
    expect(keys(f)).toContain('age.parent-too-young');
    expect(f.find((x) => x.key === 'age.parent-too-young')!.message).toMatch(/typo/);
  });

  it('a child cannot be older than the person describing them', () => {
    const f = relationshipSanity({
      ...base, relationType: 'child', age: 40, userAge: 34, locationType: 'same_home',
    });
    expect(keys(f)).toContain('age.child-too-old');
  });

  it('says nothing when it does not know the account holder’s own age', () => {
    const f = relationshipSanity({ ...base, relationType: 'mother', age: 30, userAge: null });
    expect(keys(f)).not.toContain('age.parent-too-young');
  });

  it('a young parent is fine, a twelve-year gap is the floor', () => {
    expect(keys(relationshipSanity({ ...base, age: 47, userAge: 34 })))
      .not.toContain('age.parent-too-young');
    expect(keys(relationshipSanity({ ...base, age: 45, userAge: 34 })))
      .toContain('age.parent-too-young');
  });

  it('siblings and friends of any age are nobody’s business', () => {
    for (const relationType of ['sibling', 'friend', 'partner']) {
      const f = relationshipSanity({ ...base, relationType, age: 19, userAge: 60 });
      expect(relationshipBlocked(f)).toBe(false);
    }
  });
});

/**
 * The quiet one. Ask for less than you already do and every engine downstream
 * reads the relationship as comfortably ahead, so it never surfaces again —
 * a correct calculation with a surprising result, worth saying at the moment
 * the answer is given rather than six weeks later.
 */
describe('asking for less than you already do', () => {
  it('says so when the wish is looser than the habit', () => {
    const f = relationshipSanity({ ...base, callFrequency: 'daily', desiredCallFrequency: 'monthly' });
    const hit = f.find((x) => x.key === 'cadence.already-ahead')!;
    expect(hit.level).toBe('note');
    expect(hit.message).toContain('Amma');
    expect(relationshipBlocked(f)).toBe(false);
  });

  it('says something quieter when they are exactly equal', () => {
    const f = relationshipSanity({ ...base, callFrequency: 'daily', desiredCallFrequency: 'daily' });
    expect(keys(f)).toContain('cadence.exactly-met');
    expect(keys(f)).not.toContain('cadence.already-ahead');
  });

  it('stays silent when there is a real gap to work on', () => {
    const f = relationshipSanity({ ...base, callFrequency: 'yearly', desiredCallFrequency: 'weekly' });
    expect(keys(f)).not.toContain('cadence.already-ahead');
    expect(keys(f)).not.toContain('cadence.exactly-met');
  });

  it('falls back to "them" when no name has been typed yet', () => {
    const f = relationshipSanity({
      ...base, name: '', callFrequency: 'daily', desiredCallFrequency: 'monthly',
    });
    expect(f.find((x) => x.key === 'cadence.already-ahead')!.message).toContain('them');
  });
});

describe('where they live against how often you see them', () => {
  it('notices someone abroad being seen weekly', () => {
    const f = relationshipSanity({ ...base, locationType: 'abroad', inPersonFrequency: 'daily' });
    expect(keys(f)).toContain('location.abroad-but-seen');
    expect(relationshipBlocked(f)).toBe(false);
  });

  it('leaves an ordinary yearly visit abroad alone', () => {
    const f = relationshipSanity({ ...base, locationType: 'abroad', inPersonFrequency: 'yearly' });
    expect(keys(f)).not.toContain('location.abroad-but-seen');
  });

  it('notices the same house with monthly visits, and allows it', () => {
    const f = relationshipSanity({
      ...base, relationType: 'partner', locationType: 'same_home', inPersonFrequency: 'monthly',
    });
    expect(keys(f)).toContain('location.home-but-unseen');
    expect(relationshipBlocked(f)).toBe(false);
  });
});

describe('it says what filling this in bought', () => {
  it('parents get the visits arithmetic', () => {
    const f = relationshipSanity(base);
    expect(f.find((x) => x.key === 'good.visits')!.level).toBe('good');
  });

  it('a child under eighteen gets the years counted, exactly', () => {
    const f = relationshipSanity({
      ...base, relationType: 'child', age: 5, userAge: 34, locationType: 'same_home',
    });
    expect(f.find((x) => x.key === 'good.childhood')!.message).toContain('13');
  });

  it('an adult child is told which reading does not apply, without losing the rest', () => {
    const f = relationshipSanity({ ...base, relationType: 'child', age: 24, userAge: 60 });
    expect(keys(f)).toContain('note.childhood-closed');
    expect(relationshipBlocked(f)).toBe(false);
  });

  it('promises nothing while the age is still missing', () => {
    const f = relationshipSanity({ ...base, age: null });
    expect(f.some((x) => x.level === 'good')).toBe(false);
  });

  /**
   * Caught in a browser. A mother of 30 given by a user of 34 showed the typo
   * in red and, directly underneath, promised to count the visits left with
   * her — an arithmetic built on the number it had just called a typo.
   */
  it('promises nothing while anything at all is wrong', () => {
    const f = relationshipSanity({ ...base, relationType: 'mother', age: 30, userAge: 34 });
    expect(keys(f)).toContain('age.parent-too-young');
    expect(f.some((x) => x.level === 'good')).toBe(false);
  });

  it('but keeps the promise when the only findings are notes', () => {
    const f = relationshipSanity({
      ...base, callFrequency: 'daily', desiredCallFrequency: 'monthly',
    });
    expect(keys(f)).toContain('cadence.already-ahead');
    expect(f.some((x) => x.level === 'good')).toBe(true);
  });
});

describe('the pickers start somewhere plausible', () => {
  it('a partner is in the house and spoken to daily', () => {
    expect(defaultsForRelation('partner')).toEqual({
      locationType: 'same_home', callFrequency: 'daily',
      desiredCallFrequency: 'daily', inPersonFrequency: 'daily',
    });
  });

  it('a parent is in another city and called less than wished', () => {
    const d = defaultsForRelation('mother');
    expect(d.locationType).toBe('different_city');
    expect(d.callFrequency).toBe('monthly');
    expect(d.desiredCallFrequency).toBe('weekly');
  });

  it('anything unrecognised still gets a coherent set', () => {
    const d = defaultsForRelation('mentor');
    expect(Object.values(d).every(Boolean)).toBe(true);
  });

  /**
   * Every default has to survive its own checker. A form that opens on a
   * combination the app then complains about is worse than no defaults.
   */
  it('no default combination trips a block', () => {
    for (const rel of ['mother', 'father', 'partner', 'sibling', 'friend', 'child']) {
      const d = defaultsForRelation(rel);
      const f = relationshipSanity({
        ...d, name: 'Sam', relationType: rel,
        age: rel === 'child' ? 6 : 60, userAge: 40,
      });
      expect(relationshipBlocked(f)).toBe(false);
    }
  });

  it('stops asking how often you talk to someone in the same house', () => {
    expect(asksAboutCalls('same_home')).toBe(false);
    expect(asksAboutCalls('different_city')).toBe(true);
    expect(asksAboutCalls(null)).toBe(true);
  });
});

/**
 * The blunt version of "think about every combination": walk the whole
 * cross-product and assert the checker never throws, never contradicts
 * itself, and never blocks on anything but age.
 */
describe('every combination of the answers', () => {
  const RELATIONS = ['mother', 'father', 'partner', 'sibling', 'friend', 'child'];
  const CADENCES = ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'];
  const PLACES = ['same_home', 'same_city', 'different_city', 'abroad'];

  it('holds across all 6 × 4 × 5³ of them', () => {
    let seen = 0;
    for (const relationType of RELATIONS) {
      for (const locationType of PLACES) {
        for (const callFrequency of CADENCES) {
          for (const desiredCallFrequency of CADENCES) {
            for (const inPersonFrequency of CADENCES) {
              const f = relationshipSanity({
                name: 'Sam', relationType, age: relationType === 'child' ? 8 : 62,
                userAge: 40, locationType, callFrequency,
                desiredCallFrequency, inPersonFrequency,
              });
              seen++;
              // Only age can stop the step. Everything else is advice.
              expect(f.filter((x) => x.level === 'block')).toHaveLength(0);
              // Never both "you already do more" and "that is exactly it".
              const k = keys(f);
              expect(k.includes('cadence.already-ahead') && k.includes('cadence.exactly-met'))
                .toBe(false);
              for (const x of f) expect(x.message.length).toBeGreaterThan(10);
            }
          }
        }
      }
    }
    expect(seen).toBe(6 * 4 * 5 * 5 * 5);
  });

  it('survives every answer being absent', () => {
    expect(() => relationshipSanity({})).not.toThrow();
    expect(relationshipBlocked(relationshipSanity({}))).toBe(true);
  });

  it('survives nonsense in every field', () => {
    const f = relationshipSanity({
      name: null, relationType: 'aardvark', age: {} as any, userAge: NaN,
      locationType: 'mars', callFrequency: 'fortnightly',
      desiredCallFrequency: '', inPersonFrequency: null,
    });
    expect(Array.isArray(f)).toBe(true);
    expect(keys(f)).toContain('age.unusable');
  });
});

/**
 * Both from one reported walk-through. Picking "child" defaults the person
 * to the same home, seen daily; changing the address to "another city" left
 * "see them in person: daily" sitting under it. And somebody who talks to
 * their son every day was still asked how often they wished they talked.
 */
describe('a question the answers have already settled', () => {
  it('stops asking what you wish once you are at the top of the scale', () => {
    expect(asksAboutWish('daily')).toBe(false);
    expect(asksAboutWish('weekly')).toBe(true);
    expect(asksAboutWish('monthly')).toBe(true);
    expect(asksAboutWish('yearly')).toBe(true);
  });

  it('keeps asking when nothing is known — unset is not "already daily"', () => {
    expect(asksAboutWish(null)).toBe(true);
    expect(asksAboutWish(undefined)).toBe(true);
    expect(asksAboutWish('')).toBe(true);
  });
});

describe('how often you could see somebody at that distance', () => {
  it('bounds visits by the address', () => {
    expect(visitDefaultFor('same_home')).toBe('daily');
    expect(visitDefaultFor('same_city')).toBe('weekly');
    expect(visitDefaultFor('different_city')).toBe('quarterly');
    expect(visitDefaultFor('abroad')).toBe('yearly');
  });

  it('never returns daily for anybody who does not live with you', () => {
    for (const loc of ['same_city', 'different_city', 'abroad']) {
      expect(visitDefaultFor(loc)).not.toBe('daily');
    }
  });

  it('an unknown address gets the cautious middle, not the impossible end', () => {
    expect(visitDefaultFor(null)).toBe('quarterly');
    expect(visitDefaultFor('somewhere_odd')).toBe('quarterly');
  });

  /* The explicit answer still stands, and the note is what speaks. */
  it('leaves a deliberate contradiction to the sanity note', () => {
    const f = relationshipSanity({
      name: 'Sean', relationType: 'child', age: '25',
      locationType: 'abroad', inPersonFrequency: 'weekly',
    });
    expect(keys(f)).toContain('location.abroad-but-seen');
  });
});
