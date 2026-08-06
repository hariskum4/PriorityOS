import { describe, it, expect } from 'vitest';
import { buildDigest, digestTokenEstimate, type DigestInput } from './digest';

const FULL: DigestInput = {
  age: 38,
  country: 'IN',
  workShape: 'working',
  movementLimits: 'low_impact',
  domains: [
    { domainType: 'family', importance: 60, attention: 5 },
    { domainType: 'health', importance: 50, attention: 40 },
    { domainType: 'growth', importance: 40, attention: 2 },
    { domainType: 'career', importance: 30, attention: 90 },
    { domainType: 'friends', importance: 20, attention: 1 },
  ],
  people: [
    { name: 'Amma', relation: 'parent', daysSince: 26, wantedEveryDays: 7, band: 'long overdue' },
    { name: 'Arjun', relation: 'friend', daysSince: 9, wantedEveryDays: 14, band: 'due' },
    { name: 'Priya', relation: 'sibling', daysSince: 40, wantedEveryDays: 30, band: 'overdue' },
    { name: 'Ravi', relation: 'friend', daysSince: 3, wantedEveryDays: 30, band: 'due' },
  ],
  rhythms: [
    { title: 'Move three times a week', domain: 'health', doneThisWeek: 1, targetPerWeek: 3 },
    { title: 'Call home', domain: 'family', doneThisWeek: 0, targetPerWeek: 1 },
  ],
  week: { done: 11, kept: 3 },
  longestFreeStretchMinutes: 95,
  recentThemes: ['family', 'reflection', 'health', 'growth', 'career', 'money'],
};

describe('a life in about two hundred tokens', () => {
  it('reports share of intention against share of attention', () => {
    /* "wants 30% and gets 4%" is something a sentence can be built from.
       "importance 60, attention 5" is not. */
    const d = buildDigest(FULL);
    const family = d.starving.find((s) => s.domain === 'family')!;
    expect(family.wants).toBe(30);
    expect(family.gets).toBe(4);
  });

  it('names the worst-served parts first, and only three', () => {
    const d = buildDigest(FULL);
    expect(d.starving.map((s) => s.domain)).toEqual(['family', 'growth', 'friends']);
  });

  it('never lists a domain that is getting more than it asked for', () => {
    const d = buildDigest(FULL);
    expect(d.starving.map((s) => s.domain)).not.toContain('career');
    expect(d.fed).toBe('career');
  });

  it('ranks by how far past their own rhythm, not by raw days', () => {
    /* Amma is 26 days into a weekly rhythm — 3.7 times past what was asked.
       Priya is 40 days into a monthly one, which is only 1.3. Sorted by days
       Priya comes first and a sentence naming one person names the wrong
       silence. */
    const d = buildDigest(FULL);
    expect(d.waiting.map((p) => p.name)).toEqual(['Amma', 'Priya', 'Arjun']);
  });

  it('does not strand somebody who was never given a rhythm', () => {
    const d = buildDigest({
      people: [
        { name: 'Stated', relation: 'friend', daysSince: 40, wantedEveryDays: 30, band: 'overdue' },
        { name: 'Unstated', relation: 'friend', daysSince: 200, wantedEveryDays: null, band: 'overdue' },
      ],
    });
    expect(d.waiting[0].name).toBe('Unstated');
  });

  it('stays the same size however long somebody has used the app', () => {
    /* The whole reason this file exists. A digest of a tenth year has to cost
       what a first year costs, or it stops being safe to send. */
    const tenYears: DigestInput = {
      ...FULL,
      people: Array.from({ length: 400 }, (_, i) => ({
        name: `Person ${i}`, relation: 'friend', daysSince: i, wantedEveryDays: 30, band: 'due' as const,
      })),
      rhythms: Array.from({ length: 200 }, (_, i) => ({
        title: `Rhythm ${i}`, domain: 'health', doneThisWeek: 1, targetPerWeek: 3,
      })),
      recentThemes: Array.from({ length: 50 }, (_, i) => `theme${i}`),
    };
    const d = buildDigest(tenYears);
    expect(d.waiting).toHaveLength(3);
    expect(d.keeping).toHaveLength(5);
    expect(d.themes).toHaveLength(4);
    expect(digestTokenEstimate(d)).toBeLessThan(400);
  });

  it('fits the budget it was built for', () => {
    const tokens = digestTokenEstimate(buildDigest(FULL));
    expect(tokens).toBeLessThan(300);
    expect(tokens).toBeGreaterThan(50);
  });

  it('carries no sentence anybody wrote', () => {
    /* Themes are tags the engine derived. Nothing a person typed into a
       journal is in this shape, and there is no field for it to arrive in. */
    const json = JSON.stringify(buildDigest(FULL));
    /* Keys, not words — "reflection" is one of the twelve domains and belongs
       in `themes`. The first version of this test matched the bare word and
       failed on a life that had been reflecting. */
    for (const key of ['whatMattered', 'whatIAvoided', 'conversation', 'keepsake', 'freeText', 'title"']) {
      expect(json).not.toContain(`"${key}"`);
    }
    /* And the only free-text field that does travel is a rhythm's own title,
       which the catalog wrote — never a sentence the reader did. */
    expect(json).toContain('"title":"Move three times a week"');
  });

  it('is byte-for-byte stable, so it can be cached and diffed', () => {
    expect(JSON.stringify(buildDigest(FULL))).toBe(JSON.stringify(buildDigest(FULL)));
  });

  it('says nothing rather than guessing, on a life it has not measured', () => {
    const d = buildDigest({});
    expect(d.alignment).toBeNull();
    expect(d.fed).toBeNull();
    expect(d.starving).toEqual([]);
    expect(d.waiting).toEqual([]);
    expect(d.week).toEqual({ done: 0, kept: 0 });
    expect(d.freeStretchMinutes).toBeNull();
  });

  it('keeps the limits a suggestion has to respect', () => {
    /* The one field here that is a safety constraint rather than colour: a
       model that cannot see it will offer a run to somebody with a knee. */
    expect(buildDigest(FULL).who.movementLimits).toBe('low_impact');
  });

  it('survives the shapes a half-built account hands it', () => {
    const d = buildDigest({
      age: Number.NaN,
      domains: [{ domainType: 'family', importance: 0, attention: 0 }],
      week: { done: -4, kept: 2.7 },
      longestFreeStretchMinutes: Number.POSITIVE_INFINITY,
    });
    expect(d.who.age).toBeNull();
    expect(d.alignment).toBeNull();
    expect(d.week).toEqual({ done: 0, kept: 2 });
    expect(d.freeStretchMinutes).toBeNull();
  });
});
