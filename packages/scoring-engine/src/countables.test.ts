import { describe, it, expect } from 'vitest';
import {
  ritualTokens, countKeyOf, matchRitual, observedPace, countable, dedupeRituals,
  suggestCountables,
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
 * Inherited from `customCountRemaining`, which this replaced. The rule was
 * that the same numbers have to come out, because a rewrite that quietly
 * moves a figure someone has been reading for months is its own bug.
 *
 * These figures have now moved, and it is the one change that was allowed to
 * move them: the horizon underneath stopped being a flat hundred years for
 * everybody and started being the reader's own country. A count of Diwalis
 * ahead of a thirty-year-old in Chennai was never really seventy — that was
 * the arithmetic of somebody expected to see a hundred and one birthdays. The
 * pinning stays, against the honest numbers.
 */
describe('the arithmetic the old count kept', () => {
  it('ocean swims at 1 a year, aged 33', () => {
    const c = countable({ age: 33, label: 'ocean swims', declaredPerYear: 1, now: NOW });
    expect(c.remaining).toBe(40);       // 1/yr × 42 horizon years → nearest 5
    expect(c.upliftRemaining).toBe(85); // 2/yr → 84 → nearest 5
  });

  it('Diwalis at home at 1 a year, aged 30', () => {
    const c = countable({ age: 30, label: 'Diwalis at home', declaredPerYear: 1, now: NOW });
    expect(c.remaining).toBe(45);
    expect(c.upliftRemaining).toBe(90);
  });

  /**
   * The reader's country reaches the count, the same way the other person's
   * always has through `qualityYears`. A ritual is a number of occasions, and
   * how many are left depends on where both people are standing.
   */
  it('counts the same ritual on the reader’s own horizon', () => {
    const base = { label: 'Diwalis at home', declaredPerYear: 1, now: NOW };
    expect(countable({ ...base, age: 30, country: 'JP' }).remaining)
      .toBeGreaterThan(countable({ ...base, age: 30, country: 'IN' }).remaining);
  });

  it('never shows zero, even at a tiny pace late in life', () => {
    const c = countable({ age: 78, label: 'treks', declaredPerYear: 0, now: NOW });
    expect(c.remaining).toBeGreaterThanOrEqual(1);
  });
});

/**
 * The card offered the same five starters to everyone — ocean swims, Diwalis
 * at home, concerts, treks, movie nights with the kids. Nice words, and a
 * stranger's, while the app was already holding this person's own.
 */
describe('starters drawn from this life rather than a list', () => {
  const amma = {
    id: 'p1', name: 'Amma', relationType: 'mother', closenessScore: 10,
    wantsMoreTime: true, desiredCallFrequency: 'weekly',
    meaningfulMomentTypes: ['home-cooked meals', 'temple visits'],
  };
  const arjun = {
    id: 'p2', name: 'Arjun', relationType: 'friend', closenessScore: 8,
    wantsMoreTime: true, desiredCallFrequency: 'monthly', meaningfulMomentTypes: [],
  };

  it('leads with their own words for what matters, bound to the person', () => {
    const [top] = suggestCountables({ existing: [], people: [amma, arjun] });
    expect(top.label).toBe('home-cooked meals with Amma');
    expect(top.peopleIds).toEqual(['p1']);
    expect(top.source).toBe('moment-type');
  });

  it('always says why, out of something they told the app', () => {
    // Raised past the default: with this much personal material a domain
    // suggestion never reaches the card, which is the correct ordering and
    // makes it invisible to a test at the default limit.
    const s = suggestCountables({
      existing: [], people: [amma, arjun], limit: 12,
      archiveThemes: [{ label: 'treks', count: 3, people: ['Arjun'] }],
      domains: [{ domainType: 'experiences', importance: 80 }],
    });
    expect(s.every((x) => x.because.length > 0)).toBe(true);
    expect(s.find((x) => x.source === 'archive')?.because).toMatch(/3 already in your archive/);
    expect(s.find((x) => x.source === 'domain')?.because).toMatch(/rate experiences 80/);
  });

  it('offers what the archive keeps holding and nothing counts', () => {
    const s = suggestCountables({
      existing: [], archiveThemes: [{ label: 'treks', count: 4, people: ['Arjun'] }],
      people: [arjun],
    });
    const trek = s.find((x) => x.label === 'treks')!;
    expect(trek.source).toBe('archive');
    expect(trek.peopleIds).toEqual(['p2']); // bound to who is actually there
  });

  it('falls back to the shape of the relationship when they named no moments', () => {
    const s = suggestCountables({ existing: [], people: [arjun] });
    expect(s.some((x) => x.label === 'catch-ups with Arjun')).toBe(true);
  });

  it('reaches for a domain only after the people are exhausted', () => {
    const s = suggestCountables({
      existing: [], people: [amma], domains: [{ domainType: 'experiences', importance: 90 }],
    });
    expect(s[0].source).toBe('moment-type');
    expect(s[s.length - 1].source).toBe('domain');
  });

  it('never offers what is already counted, however it was spelled', () => {
    const s = suggestCountables({
      existing: [{ key: 'trek', label: 'Went to trek' }],
      archiveThemes: [{ label: 'treks', count: 5 }],
      people: [arjun],
    });
    expect(s.some((x) => x.label === 'treks')).toBe(false);
  });

  it('never offers the same ritual twice from two different sources', () => {
    const s = suggestCountables({
      existing: [],
      people: [{ ...arjun, meaningfulMomentTypes: ['catch-ups'] }],
      limit: 6,
    });
    const labels = s.map((x) => countKeyOf(x.label));
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('takes the cadence they already set rather than guessing', () => {
    const [top] = suggestCountables({ existing: [], people: [amma] });
    expect(top.perYear).toBe(12); // weekly
    const [friend] = suggestCountables({ existing: [], people: [arjun] });
    expect(friend.perYear).toBe(4); // monthly
  });

  it('spreads across the life rather than filling up on one person', () => {
    /**
     * Amma naming two moments she loves would otherwise take two of the
     * three slots, and a third of a life would be one relationship.
     */
    const priya = {
      id: 'p3', name: 'Priya', relationType: 'spouse', closenessScore: 10,
      wantsMoreTime: true, desiredCallFrequency: 'daily',
      meaningfulMomentTypes: ['date nights'],
    };
    const s = suggestCountables({ existing: [], people: [amma, priya, arjun], limit: 3 });
    const owners = s.map((x) => x.peopleIds[0]);
    expect(new Set(owners).size).toBe(owners.length);
  });

  it('relaxes that rather than returning a short list for one relationship', () => {
    /**
     * Someone tracking one person: her two moments are all the material
     * there is, and both are offered. The third candidate ("meals with
     * Amma", from her relation type) is correctly dropped as too close to
     * "home-cooked meals with Amma" — near-duplicates are worse than a
     * shorter list.
     */
    const s = suggestCountables({ existing: [], people: [amma], limit: 3 });
    expect(s.map((x) => x.label)).toEqual([
      'home-cooked meals with Amma', 'temple visits with Amma',
    ]);
  });

  it('stays quiet when it knows nothing about anybody', () => {
    expect(suggestCountables({ existing: [] })).toEqual([]);
  });

  it('holds to the limit, so the card stays a starting point not a menu', () => {
    const s = suggestCountables({
      existing: [],
      people: [amma, arjun],
      domains: [
        { domainType: 'experiences', importance: 80 },
        { domainType: 'growth', importance: 70 },
        { domainType: 'health', importance: 60 },
      ],
    });
    expect(s.length).toBeLessThanOrEqual(4);
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

/**
 * An ICU nurse's father-in-law, found in the sweep: Ravi is 72, Lakshmi is 68
 * and in the same house, Nikhil is 40 and abroad. Every defect below was on
 * one screen at once, in the number this app leans on hardest.
 */
describe('one person, one number, one yardstick', () => {
  /* estimateTimeReality's real output for those two, so the test moves if the
     window model does rather than pinning a number the model no longer gives. */
  const LAKSHMI_YEARS = 9.2;
  const NIKHIL_YEARS = 27;
  const OWN_HORIZON = 28; // yearsToHorizon(72)

  it('counts a ritual named after somebody on the window they share', () => {
    const c = countable({
      age: 72, label: 'evenings out with Lakshmi', declaredPerYear: 12,
      people: [{ name: 'Lakshmi', qualityYears: LAKSHMI_YEARS }], now: NOW,
    });
    /* The bug: the headline used the flat 100-year planning horizon while the
       line under it used her window, so the row read "~340 more evenings out
       with Lakshmi / ~110 of them with Lakshmi". */
    expect(c.remaining).toBeLessThanOrEqual(softRoundish(12 * LAKSHMI_YEARS));
    expect(c.remaining).toBeLessThan(12 * OWN_HORIZON);
    expect(c.shares).toEqual([]);
    expect(c.detailText).not.toMatch(/of them with Lakshmi/);
  });

  it('never names the same person twice with two different numbers', () => {
    const c = countable({
      age: 72, label: 'evenings out with Lakshmi', declaredPerYear: 12,
      people: [{ name: 'Lakshmi', qualityYears: LAKSHMI_YEARS }], now: NOW,
    });
    const mentions = (c.headlineText + ' ' + c.detailText).match(/Lakshmi/g) ?? [];
    expect(mentions.length).toBe(1);
  });

  it('leaves a generic ritual counted on the reader, and still names the share', () => {
    const c = countable({
      age: 72, label: 'family gatherings', declaredPerYear: 2,
      people: [{ name: 'Lakshmi', qualityYears: LAKSHMI_YEARS }], now: NOW,
    });
    expect(c.shares).toHaveLength(1);
    expect(c.detailText).toMatch(/with Lakshmi/);
    expect(c.detailText).toMatch(/their window is the shorter one/);
  });

  it('does not claim their window is shorter when the reader outlives them by it', () => {
    /* Nikhil is 40 and will outlast a 72-year-old; `shares` clamps to the
       reader's own remaining, and the sentence then announced a shortage the
       arithmetic had just ruled out. */
    const c = countable({
      age: 72, label: 'family gatherings', declaredPerYear: 2,
      people: [{ name: 'Nikhil', qualityYears: NIKHIL_YEARS }], now: NOW,
    });
    expect(c.detailText).toMatch(/with Nikhil/);
    expect(c.detailText).not.toMatch(/shorter one/);
  });

  it('offers a far-away son calls, not days out', () => {
    const s = suggestCountables({
      existing: [],
      people: [{
        id: 'n', name: 'Nikhil', relationType: 'child', locationType: 'abroad',
        wantsMoreTime: true, desiredCallFrequency: 'weekly', closenessScore: 8,
      }],
    });
    expect(s.map((x) => x.label)).toContain('video calls with Nikhil');
    expect(s.map((x) => x.label)).not.toContain('days out with Nikhil');
  });

  it('still puts two people who live together in the same room', () => {
    const s = suggestCountables({
      existing: [],
      people: [{
        id: 'l', name: 'Lakshmi', relationType: 'spouse', locationType: 'same_home',
        wantsMoreTime: true, closenessScore: 10,
      }],
    });
    expect(s.map((x) => x.label)).toContain('evenings out with Lakshmi');
  });

  it('says nothing forbidden in any of it', () => {
    const rows = [
      countable({ age: 72, label: 'evenings out with Lakshmi', declaredPerYear: 12, people: [{ name: 'Lakshmi', qualityYears: LAKSHMI_YEARS }], now: NOW }),
      countable({ age: 72, label: 'family gatherings', declaredPerYear: 2, people: [{ name: 'Nikhil', qualityYears: NIKHIL_YEARS }], now: NOW }),
    ];
    for (const r of rows) expect(r.detailText).not.toMatch(FORBIDDEN);
  });
});

/** The rounding `countable` applies, so the assertion above tracks it. */
function softRoundish(n: number): number {
  return Math.ceil(n / 5) * 5 + 5;
}
