import { describe, it, expect } from 'vitest';
import { suggestStacks, domainsCovered, shortfallsCovered, type StackPerson } from './timeStacking';
import { domainShares } from './alignment';

const FORBIDDEN = /death|dying|lifespan|running out|too late|wasted/i;

/** A share table straight from `domainShares`, so the tests use the real currency. */
const shares = (rows: Array<[string, number, number]>) =>
  domainShares(rows.map(([domainType, importance, attention]) => ({ domainType, importance, attention })));

/**
 * A real life, taken from a live profile. Every domain is "active" and nothing
 * trips a raw importance-minus-attention threshold, which is precisely the case
 * the old count-based ranking could not handle — it fell back to "everything is
 * neglected", tied almost every entry, and returned the catalog in the order it
 * was typed.
 */
const REAL_LIFE = shares([
  ['friends', 18, 5.5], ['family', 50, 100], ['purpose', 12, 0], ['reflection', 44, 42.9],
  ['finance', 62, 64.2], ['partner', 6, 100], ['impact', 20, 100], ['experiences', 38, 100],
  ['health', 68, 100], ['career', 48, 100], ['growth', 36, 76.2],
]);

const PEOPLE: StackPerson[] = [
  { name: 'Amma', relationType: 'mother', daysSince: 1, overdue: 0.1 },
  { name: 'Appa', relationType: 'father', daysSince: 9, overdue: 1.3 },
  { name: 'Arjun', relationType: 'friend', daysSince: 25, overdue: 0.8 },
  { name: 'Priya', relationType: 'spouse', daysSince: 1, overdue: 1 },
  { name: 'Meera', relationType: 'child', daysSince: 1, overdue: 1 },
];

describe('time-stacking', () => {
  it('ranks by share points short, not by how many domains a stack touches', () => {
    // reflection is 5.5 points short and health 4.2; family, career and
    // experiences are all over-fed. A count-based ranker cannot tell these
    // apart — every entry touches two domains.
    const [top] = suggestStacks(REAL_LIFE, PEOPLE, 3);
    const gap = (d: string) => REAL_LIFE.find((s) => s.domainType === d)!.shortfall;
    const worth = top.domains.reduce((s, d) => s + Math.max(0, gap(d)), 0);

    for (const other of ['walk_call_parent', 'weekend_trip_family', 'volunteer_family']) {
      const alt = suggestStacks(REAL_LIFE, PEOPLE, 20).find((s) => s.key === other)!;
      expect(worth).toBeGreaterThan(alt.domains.reduce((s, d) => s + Math.max(0, gap(d)), 0));
    }
  });

  it('is not just the catalog in the order it was typed', () => {
    // The exact regression: three broadly-active lives used to produce the same
    // three suggestions, because nothing distinguished them.
    const other = shares([
      ['friends', 40, 90], ['health', 20, 5], ['career', 60, 80], ['growth', 55, 10],
    ]);
    expect(suggestStacks(REAL_LIFE, PEOPLE, 3).map((s) => s.key))
      .not.toEqual(suggestStacks(other, PEOPLE, 3).map((s) => s.key));
  });

  it('spreads across starving domains instead of offering one idea three ways', () => {
    // health is short by 53 points and friends and finance by 17 each, so every
    // one of the top-scoring stacks contains health. Ranked purely on hunger,
    // all three picks would be health pairs and finance would never appear.
    const starving = shares([
      ['health', 60, 1], ['friends', 20, 1], ['finance', 20, 1], ['career', 10, 97],
    ]);
    const picks = suggestStacks(starving, PEOPLE, 3);
    expect(shortfallsCovered(picks).sort()).toEqual(['finance', 'friends', 'health']);
  });

  it('does not describe a life the person has told us they do not have', () => {
    // Five people on record and no child: naming one is not a suggestion.
    const withoutChild = PEOPLE.filter((p) => p.relationType !== 'child');
    const keys = suggestStacks(REAL_LIFE, withoutChild, 20).map((s) => s.key);
    expect(keys).not.toContain('cook_with_kid');
    expect(keys).not.toContain('creative_with_kid');
  });

  it('keeps the generic wording when nobody has been recorded at all', () => {
    // Unknown is not the same as childless — a new account still gets the idea.
    const fresh = suggestStacks(REAL_LIFE, [], 20);
    const parent = fresh.find((s) => s.key === 'walk_call_parent')!;
    expect(parent.action).toBe('Take your walk while calling a parent');
    expect(parent.person).toBeNull();
    expect(fresh.map((s) => s.key)).toContain('cook_with_kid');
  });

  it('names the person in that role who is most overdue', () => {
    const parent = suggestStacks(REAL_LIFE, PEOPLE, 20).find((s) => s.key === 'walk_call_parent')!;
    expect(parent.action).toBe('Take your walk while calling Appa'); // 1.3 cadences over, vs Amma at 0.1
    expect(parent.person).toBe('Appa');
  });

  it('no action is left holding an unfilled slot', () => {
    for (const people of [PEOPLE, []]) {
      for (const st of suggestStacks(REAL_LIFE, people, 20)) {
        expect(st.action).not.toContain('{who}');
        expect(st.action.length).toBeGreaterThan(8);
        expect(st.domains.length).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('states the reason in shares the person can check', () => {
    const [top] = suggestStacks(REAL_LIFE, PEOPLE, 3);
    expect(top.reason).toMatch(/is getting \d+% of your attention — you asked for \d+%/);
    expect(top.reason).toContain(top.reasonDomain!);
  });

  it('names the domain each reason argues from, so it can be coloured after it', () => {
    // reasonDomain is not always covers[0]: the reason speaks to whatever is
    // still hungriest, and covers is in the stack's own order.
    for (const st of suggestStacks(REAL_LIFE, PEOPLE, 20)) {
      if (!st.reason) { expect(st.reasonDomain).toBeNull(); continue; }
      expect(st.covers).toContain(st.reasonDomain!);
      expect(st.reason.startsWith(st.reasonDomain!)).toBe(true);
    }
  });

  it('argues each row from something the row before did not', () => {
    // The third pick used to justify itself with health because health was the
    // biggest raw gap, even though row two had just fed it — repeating the same
    // sentence instead of naming the thing this row uniquely adds.
    const picks = suggestStacks(REAL_LIFE, PEOPLE, 3);
    const reasons = picks.map((p) => p.reasonDomain);
    expect(new Set(reasons).size).toBe(picks.length);
  });

  it('mentions someone by name in the reason only when they are actually waiting', () => {
    const punctual = PEOPLE.map((p) => ({ ...p, overdue: 0.2 }));
    const withNames = suggestStacks(REAL_LIFE, PEOPLE, 20);
    const withoutNames = suggestStacks(REAL_LIFE, punctual, 20);
    const named = (list: typeof withNames) =>
      list.filter((s) => s.person && s.reason.includes(s.person)).length;
    expect(named(withNames)).toBeGreaterThan(0);
    expect(named(withoutNames)).toBe(0);
  });

  it('covers only the domains that are actually short', () => {
    for (const st of suggestStacks(REAL_LIFE, PEOPLE, 20)) {
      for (const d of st.covers) {
        expect(REAL_LIFE.find((s) => s.domainType === d)!.shortfall).toBeGreaterThan(0);
      }
      // family, career, experiences and partner all receive more than claimed.
      expect(st.covers).not.toContain('partner');
    }
  });

  it('separates what a set touches from what it helps', () => {
    const picks = suggestStacks(REAL_LIFE, PEOPLE, 3);
    // The old summary line conflated these and oversold itself by counting
    // domains already receiving more than they were promised.
    expect(shortfallsCovered(picks).length).toBeLessThanOrEqual(domainsCovered(picks).length);
    for (const d of shortfallsCovered(picks)) {
      expect(REAL_LIFE.find((s) => s.domainType === d)!.shortfall).toBeGreaterThan(0);
    }
  });

  it('still answers when a life is perfectly balanced, and claims nothing', () => {
    const even = shares([['health', 50, 50], ['growth', 50, 50], ['family', 50, 50]]);
    const picks = suggestStacks(even, PEOPLE, 3);
    expect(picks.length).toBe(3);
    expect(shortfallsCovered(picks)).toEqual([]);
    for (const st of picks) expect(st.reason).toBe('');
  });

  it('survives a life with nothing declared', () => {
    expect(suggestStacks([], [], 3).length).toBe(3);
  });

  it('is deterministic', () => {
    const once = suggestStacks(REAL_LIFE, PEOPLE, 3);
    const twice = suggestStacks(REAL_LIFE, PEOPLE, 3);
    expect(once).toEqual(twice);
  });

  it('never returns the same stack twice', () => {
    const keys = suggestStacks(REAL_LIFE, PEOPLE, 20).map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('can serve the domains that actually starve', () => {
    // The catalog ran five deep on health and one deep on purpose, friends,
    // career and finance — and the only purpose entry required having a child.
    for (const domain of ['purpose', 'friends', 'career', 'finance']) {
      const starved = shares([[domain, 90, 0], ['health', 10, 100]]);
      const picks = suggestStacks(starved, PEOPLE.filter((p) => p.relationType !== 'child'), 2);
      expect(picks.some((s) => s.covers.includes(domain))).toBe(true);
    }
  });

  it('keeps the copy kind', () => {
    for (const st of suggestStacks(REAL_LIFE, PEOPLE, 20)) {
      expect(st.action).not.toMatch(FORBIDDEN);
      expect(st.framing).not.toMatch(FORBIDDEN);
      expect(st.reason).not.toMatch(FORBIDDEN);
    }
  });
});

describe('domainShares', () => {
  it('turns levels into a sentence you can say', () => {
    const [friends] = shares([['friends', 18, 5.5], ['health', 82, 94.5]]);
    expect(friends.claimed).toBe(18);
    expect(friends.received).toBe(5.5);
    expect(friends.shortfall).toBe(12.5);
  });

  it('excludes domains that were never claimed', () => {
    expect(shares([['children', 0, 90], ['health', 50, 10]]).map((s) => s.domainType))
      .toEqual(['health']);
  });

  it('leaves every domain short when attention went nowhere', () => {
    const out = shares([['health', 50, 0], ['growth', 50, 0]]);
    expect(out.map((s) => s.shortfall)).toEqual([50, 50]);
  });
});
