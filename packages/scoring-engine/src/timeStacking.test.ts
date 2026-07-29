import { describe, it, expect } from 'vitest';
import { suggestStacks, domainsCovered, shortfallsCovered, type StackPerson } from './timeStacking';
import { domainShares } from './alignment';

const FORBIDDEN = /death|dying|lifespan|running out|too late|wasted/i;

/** "Give me the whole catalog" — comfortably past however long it grows. */
const ALL = 100;

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
      const alt = suggestStacks(REAL_LIFE, PEOPLE, ALL).find((s) => s.key === other)!;
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
    const keys = suggestStacks(REAL_LIFE, withoutChild, ALL).map((s) => s.key);
    expect(keys).not.toContain('cook_with_kid');
    expect(keys).not.toContain('creative_with_kid');
  });

  it('keeps the generic wording when nobody has been recorded at all', () => {
    // Unknown is not the same as childless — a new account still gets the idea.
    const fresh = suggestStacks(REAL_LIFE, [], ALL);
    const parent = fresh.find((s) => s.key === 'walk_call_parent')!;
    expect(parent.action).toBe('Take your walk while calling a parent');
    expect(parent.person).toBeNull();
    expect(fresh.map((s) => s.key)).toContain('cook_with_kid');
  });

  it('names the person in that role who is most overdue', () => {
    const parent = suggestStacks(REAL_LIFE, PEOPLE, ALL).find((s) => s.key === 'walk_call_parent')!;
    expect(parent.action).toBe('Take your walk while calling Appa'); // 1.3 cadences over, vs Amma at 0.1
    expect(parent.person).toBe('Appa');
  });

  it('no action is left holding an unfilled slot', () => {
    for (const people of [PEOPLE, []]) {
      for (const st of suggestStacks(REAL_LIFE, people, ALL)) {
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
    for (const st of suggestStacks(REAL_LIFE, PEOPLE, ALL)) {
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
    const waiting: StackPerson[] = [{ name: 'Arjun', relationType: 'friend', daysSince: 40, overdue: 1.4 }];
    const punctual = PEOPLE.map((p) => ({ ...p, overdue: 0.2 }));
    const named = (people: StackPerson[]) =>
      suggestStacks(REAL_LIFE, people, ALL).filter((s) => s.person && s.reason.includes(s.person)).length;
    expect(named([{ ...waiting[0], overdue: 3 }])).toBeGreaterThan(0);
    expect(named(punctual)).toBe(0);
  });

  it('does not call someone overdue the morning after you spoke to them', () => {
    // A daily cadence makes a person "due" one day later. Telling someone it
    // has been a day since they talked to their partner is a reproach for a
    // lapse that has not happened — the same trap `since()` needed a floor for.
    const daily: StackPerson[] = [{ name: 'Priya', relationType: 'spouse', daysSince: 1, overdue: 1 }];
    for (const st of suggestStacks(REAL_LIFE, daily, ALL)) {
      expect(st.reason).not.toContain('Priya');
    }
  });

  it('never counts days ungrammatically, at any gap it will mention', () => {
    // The floor means the smallest gap it can name is three days, so "1 days"
    // is unreachable rather than merely absent — the singular branch stays for
    // whenever that floor is tuned.
    for (const daysSince of [1, 2, 3, 4, 30, 400]) {
      const reasons = suggestStacks(
        REAL_LIFE,
        [{ name: 'Arjun', relationType: 'friend', daysSince, overdue: 9 }],
        ALL,
      ).map((s) => s.reason).join(' ');
      expect(reasons).not.toMatch(/\b1 days\b/);
      if (daysSince < 3) expect(reasons).not.toContain('since you and Arjun');
      else expect(reasons).toContain(`${daysSince} days since you and Arjun`);
    }
  });

  it('covers only the domains that are actually short', () => {
    for (const st of suggestStacks(REAL_LIFE, PEOPLE, ALL)) {
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
    const keys = suggestStacks(REAL_LIFE, PEOPLE, ALL).map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  /**
   * The twelve domains the product actually has. Held here rather than in the
   * engine because this is an assertion about the catalog, not a thing the
   * catalog should be able to redefine: if a domain is added to the app and no
   * stack can reach it, this test is where that shows up.
   */
  const EVERY_DOMAIN = [
    'family', 'partner', 'children', 'friends', 'health', 'career',
    'finance', 'growth', 'experiences', 'reflection', 'purpose', 'impact',
  ];

  it.each(EVERY_DOMAIN)('can steal time for %s', (domain) => {
    // Every domain must be reachable — a life-management tool that has no idea
    // how to serve a whole part of a life is silent exactly when it matters.
    const starved = shares([[domain, 90, 0], ['health', 10, 100]]);
    const picks = suggestStacks(starved, PEOPLE, 2);
    expect(picks.some((s) => s.covers.includes(domain))).toBe(true);
  });

  it('offers stacks that reach past two domains', () => {
    // An afternoon outdoors with the family is health and family and a memory;
    // capping the idea at two undersells the hour it costs.
    const all = suggestStacks(REAL_LIFE, PEOPLE, ALL);
    expect(all.some((s) => s.domains.length >= 3)).toBe(true);
  });

  it('drops what is already on the list, and fills the gap', () => {
    const first = suggestStacks(REAL_LIFE, PEOPLE, 3);
    const after = suggestStacks(REAL_LIFE, PEOPLE, 3, [first[0].action]);

    expect(after.map((s) => s.action)).not.toContain(first[0].action);
    // The slot refills rather than the card shrinking to two.
    expect(after).toHaveLength(3);
    expect(after.some((s) => !first.map((f) => f.key).includes(s.key))).toBe(true);
  });

  it('re-plans around what was taken rather than shuffling up', () => {
    // Not simply first[1..3]: the decay that keeps three picks from crowding
    // one domain depends on which stacks were chosen, so removing the top pick
    // changes what the second and third *should* be. Agreeing to a finance
    // move is a reason to stop leading with finance.
    const first = suggestStacks(REAL_LIFE, PEOPLE, 4);
    const after = suggestStacks(REAL_LIFE, PEOPLE, 3, [first[0].action]);
    expect(after.map((s) => s.key)).not.toEqual(first.slice(1, 4).map((s) => s.key));
  });

  it('keeps going as more gets planned, without repeating itself', () => {
    // Log one, get a new one, log that one too — for as long as the catalog
    // holds out. The card should never run dry after a couple of accepts.
    const planned: string[] = [];
    const seen = new Set<string>();
    for (let i = 0; i < 8; i++) {
      const [next] = suggestStacks(REAL_LIFE, PEOPLE, 1, planned);
      expect(next).toBeDefined();
      expect(seen.has(next.key)).toBe(false);
      seen.add(next.key);
      planned.push(next.action);
    }
  });

  it('matches an excluded action however it was written down', () => {
    const [top] = suggestStacks(REAL_LIFE, PEOPLE, 1);
    for (const written of [top.action.toUpperCase(), `  ${top.action}  `, top.action.replace(/ /g, '  ')]) {
      expect(suggestStacks(REAL_LIFE, PEOPLE, 3, [written]).map((s) => s.action))
        .not.toContain(top.action);
    }
  });

  it('hands back the id of whoever it named, so the plan can be filed under them', () => {
    const withIds = PEOPLE.map((p, i) => ({ ...p, id: `person-${i}` }));
    for (const st of suggestStacks(REAL_LIFE, withIds, ALL)) {
      if (st.person) expect(st.personId).toMatch(/^person-\d$/);
      else expect(st.personId).toBeNull();
    }
  });

  it('keeps the copy kind', () => {
    for (const st of suggestStacks(REAL_LIFE, PEOPLE, ALL)) {
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
