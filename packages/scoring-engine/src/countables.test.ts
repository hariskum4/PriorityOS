import { describe, it, expect } from 'vitest';
import {
  ritualTokens, countKeyOf, matchRitual, observedPace, countable, dedupeRituals,
} from './countables';

const FORBIDDEN = /death|dying|lifespan|running out|too late|wasted|before .* gone|last chance/i;
const YEAR = 365.25 * 86_400_000;
const NOW = Date.UTC(2026, 7, 1);
const yearsAgo = (n: number) => new Date(NOW - n * YEAR).toISOString();

/**
 * "treks" and "Went to trek" sat as two rows on the same card, with the same
 * pace and the same sentence, because nothing compared a new name to the
 * names already there.
 */
describe('one ritual, one row', () => {
  it('reads the same ritual through different phrasings', () => {
    expect(ritualTokens('Went to trek')).toEqual(ritualTokens('treks'));
    expect(countKeyOf('Went to trek')).toBe(countKeyOf('treks'));
    expect(countKeyOf('Treks')).toBe(countKeyOf('trek'));
  });

  it('keeps a key stable regardless of word order', () => {
    expect(countKeyOf('Diwalis at home')).toBe(countKeyOf('home Diwali'));
  });

  it('calls the exact duplicate what it is', () => {
    const found = matchRitual('Went to trek', [{ key: 'treks', label: 'treks' }]);
    expect(found?.match).toBe('same');
    expect(found?.against.key).toBe('treks');
  });

  it('flags a narrower version as similar, never as identical', () => {
    // "treks with Appa" may genuinely be its own ritual. Ask; never merge.
    const found = matchRitual('treks with Appa', [{ key: 'treks', label: 'treks' }]);
    expect(found?.match).toBe('similar');
  });

  it('does not collapse two rituals that merely share a word', () => {
    expect(matchRitual('dinner with Amma', [{ key: 'x', label: 'dinner with Arjun' }])).toBeNull();
    expect(matchRitual('ocean swims', [{ key: 'y', label: 'movie nights with the kids' }])).toBeNull();
  });

  it('finds nothing when there is nothing to find', () => {
    expect(matchRitual('concerts', [])).toBeNull();
    expect(matchRitual('   ', [{ key: 'treks', label: 'treks' }])).toBeNull();
  });
});

/**
 * Preventing new twins does not help the twins that already exist. Both rows
 * were written before anything compared names, and they sit there showing the
 * same number under two headings until something groups them.
 */
describe('twins that were already saved', () => {
  const saved = [
    { key: 'diwalis_at_home', label: 'Diwalis at home' },
    { key: 'treks', label: 'treks' },
    { key: 'went_to_trek', label: 'Went to trek' },
  ];

  it('shows one row per ritual, not one per spelling', () => {
    const rows = dedupeRituals(saved);
    expect(rows).toHaveLength(2);
  });

  it('carries every stored key, so no archive is orphaned by the merge', () => {
    const trek = dedupeRituals(saved).find((g) => g.keys.includes('treks'))!;
    expect(trek.keys.sort()).toEqual(['treks', 'went_to_trek']);
  });

  it('keeps the name the evidence is actually filed under', () => {
    // 'went_to_trek' holds the moments, so its label leads and 'treks' becomes
    // the alias — not the other way round because it was typed first.
    const rows = dedupeRituals(saved, (c) => (c.key === 'went_to_trek' ? 5 : 0));
    const trek = rows.find((g) => g.keys.includes('treks'))!;
    expect(trek.item.label).toBe('Went to trek');
    expect(trek.aliasLabels).toEqual(['treks']);
  });

  it('leaves a ritual saved once entirely alone', () => {
    const diwali = dedupeRituals(saved).find((g) => g.keys.includes('diwalis_at_home'))!;
    expect(diwali.keys).toEqual(['diwalis_at_home']);
    expect(diwali.aliasLabels).toEqual([]);
  });

  it('handles an empty card', () => {
    expect(dedupeRituals([])).toEqual([]);
  });
});

/**
 * The tile printed "~150 more treks at your current pace" over an archive
 * holding zero treks. `perYear` was a button tapped once at creation.
 */
describe('the pace that was declared against the pace that happened', () => {
  it('refuses to call one occurrence a rhythm', () => {
    const p = observedPace({ count: 1, firstAt: yearsAgo(1) }, NOW);
    expect(p.perYear).toBeNull();
    expect(p.count).toBe(1);
  });

  it('measures a rate once there is more than one', () => {
    const p = observedPace({ count: 6, firstAt: yearsAgo(3) }, NOW);
    expect(p.perYear).toBe(2);
    expect(p.spanYears).toBe(3);
  });

  it('never divides by less than a year, however new the archive', () => {
    const p = observedPace({ count: 4, firstAt: new Date(NOW - 30 * 86_400_000).toISOString() }, NOW);
    expect(p.perYear).toBe(4);
  });

  it('uses the observed pace for the headline when there is one', () => {
    const c = countable({
      age: 35, label: 'treks', declaredPerYear: 2,
      observation: { count: 8, firstAt: yearsAgo(2) }, now: NOW,
    });
    expect(c.observedPerYear).toBe(4);
    expect(c.paceBasis).toBe('observed');
    expect(c.pacePerYear).toBe(4);
  });

  it('falls back to the declared one and says so', () => {
    const c = countable({ age: 35, label: 'treks', declaredPerYear: 2, now: NOW });
    expect(c.paceBasis).toBe('declared');
    expect(c.detailText).toMatch(/a plan, not a pace/);
    expect(c.detailText).toMatch(/starts telling the truth/);
  });

  it('says plainly when someone is behind what they set', () => {
    const c = countable({
      age: 35, label: 'ocean swims', declaredPerYear: 4,
      observation: { count: 4, firstAt: yearsAgo(4) }, now: NOW,
    });
    expect(c.detailText).toMatch(/aimed at 4 a year and are managing ~1/);
  });

  it('credits someone running ahead of what they set', () => {
    const c = countable({
      age: 35, label: 'treks', declaredPerYear: 2,
      observation: { count: 12, firstAt: yearsAgo(3) }, now: NOW,
    });
    expect(c.detailText).toMatch(/at or above the 2 you set/);
    expect(c.detailText).toMatch(/your real pace, not your intended one/);
  });

  it('always carries the lever, whatever the pace', () => {
    for (const observation of [undefined, { count: 1, firstAt: yearsAgo(1) }, { count: 9, firstAt: yearsAgo(3) }]) {
      const c = countable({ age: 35, label: 'treks', declaredPerYear: 2, observation, now: NOW });
      expect(c.upliftRemaining).toBeGreaterThanOrEqual(c.remaining);
      expect(c.remaining).toBeGreaterThanOrEqual(1);
    }
  });
});

/**
 * The one logged Diwali carried peoplePresent: ["Amma", "Appa"] and the tile
 * rendered "1 already in your archive" — discarding the only fact on the row
 * that would make anyone act.
 */
describe('the people a ritual is with', () => {
  const amma = { name: 'Amma', qualityYears: 12 };
  const appa = { name: 'Appa', qualityYears: 15 };

  it('says how many of them are with that person', () => {
    const c = countable({
      age: 35, label: 'Diwalis at home', declaredPerYear: 1,
      observation: { count: 4, firstAt: yearsAgo(4) }, people: [amma], now: NOW,
    });
    expect(c.shares[0].name).toBe('Amma');
    expect(c.shares[0].remaining).toBeLessThan(c.remaining);
    expect(c.detailText).toMatch(/with Amma/);
  });

  it('never promises more shared than there are in total', () => {
    const c = countable({
      age: 20, label: 'Diwalis at home', declaredPerYear: 1,
      people: [{ name: 'Amma', qualityYears: 400 }], now: NOW,
    });
    expect(c.shares[0].remaining).toBeLessThanOrEqual(c.remaining);
  });

  it('never reports zero of them, however short the window', () => {
    const c = countable({
      age: 35, label: 'Diwalis at home', declaredPerYear: 1,
      people: [{ name: 'Appa', qualityYears: 0.2 }], now: NOW,
    });
    expect(c.shares[0].remaining).toBeGreaterThanOrEqual(1);
  });

  it('names everyone when a ritual is with more than one', () => {
    const c = countable({
      age: 35, label: 'road trips', declaredPerYear: 2, people: [amma, appa], now: NOW,
    });
    expect(c.detailText).toMatch(/with Amma/);
    expect(c.detailText).toMatch(/with Appa/);
  });

  it('attaches the lever to the shared number too, never just the total', () => {
    const c = countable({
      age: 35, label: 'Diwalis at home', declaredPerYear: 1, people: [amma], now: NOW,
    });
    expect(c.shares[0].upliftRemaining).toBeGreaterThan(c.shares[0].remaining);
    expect(c.detailText).toMatch(/At one more a year/);
  });

  it('keeps the gentlest register — this is the loudest surface in the app', () => {
    for (const people of [[amma], [amma, appa], [{ name: 'Appa', qualityYears: 1 }]]) {
      const c = countable({ age: 35, label: 'Diwalis at home', declaredPerYear: 1, people, now: NOW });
      expect(c.detailText).not.toMatch(FORBIDDEN);
    }
  });
});

/**
 * Inherited from `customCountRemaining`, which this replaced. Same
 * arithmetic, so the same numbers have to come out — a rewrite that quietly
 * moves a figure someone has been reading for months is its own bug.
 */
describe('the arithmetic the old count kept', () => {
  it('ocean swims at 1 a year, aged 33', () => {
    const c = countable({ age: 33, label: 'ocean swims', declaredPerYear: 1, now: NOW });
    expect(c.remaining).toBe(65);        // 1/yr × 67 horizon years → nearest 5
    expect(c.upliftRemaining).toBe(130); // 2/yr → 134 → nearest 10
  });

  it('Diwalis at home at 1 a year, aged 30', () => {
    const c = countable({ age: 30, label: 'Diwalis at home', declaredPerYear: 1, now: NOW });
    expect(c.remaining).toBe(70);
    expect(c.upliftRemaining).toBe(140);
  });

  it('never shows zero, even at a tiny pace late in life', () => {
    const c = countable({ age: 78, label: 'treks', declaredPerYear: 0, now: NOW });
    expect(c.remaining).toBeGreaterThanOrEqual(1);
  });
});

describe('four rows that do not read as one row', () => {
  it('writes a different sentence for each situation', () => {
    const rows = [
      countable({ age: 35, label: 'treks', declaredPerYear: 2, now: NOW }),
      countable({ age: 35, label: 'concerts', declaredPerYear: 2, observation: { count: 1, firstAt: yearsAgo(1) }, now: NOW }),
      countable({ age: 35, label: 'ocean swims', declaredPerYear: 4, observation: { count: 4, firstAt: yearsAgo(4) }, now: NOW }),
      countable({ age: 35, label: 'Diwalis at home', declaredPerYear: 1, observation: { count: 4, firstAt: yearsAgo(4) }, people: [{ name: 'Amma', qualityYears: 12 }], now: NOW }),
    ];
    expect(new Set(rows.map((r) => r.detailText)).size).toBe(4);
    for (const r of rows) expect(r.detailText).not.toMatch(FORBIDDEN);
  });
});
