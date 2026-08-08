/**
 * A domain nobody planned must not out-score one they cared about.
 *
 * Found by building an account that had done nothing at all — attention 0 in
 * every domain — and reading what the Today screen said about it. The seven
 * parts of life she had never mentioned scored 100; the five she had ranked
 * scored 0 to 83. Same behaviour, opposite verdicts, and the ordering was
 * decided by how much she had admitted to caring.
 */
import { describe, it, expect } from 'vitest';
import {
  driftOf, heldPercent, isPlanned, mostAdrift, openingDomain, type DomainDatum,
} from './domainScore';

const d = (over: Partial<DomainDatum> = {}): DomainDatum => ({
  domainType: 'family', importance: 0, attention: 0, ...over,
});

describe('a domain that was never planned gets no score', () => {
  it('returns null rather than a perfect hundred', () => {
    expect(heldPercent(d({ importance: 0, attention: 0 }))).toBeNull();
  });

  it('still scores a domain that was planned', () => {
    expect(heldPercent(d({ importance: 60, attention: 0 }))).toBe(0);
    expect(heldPercent(d({ importance: 60, attention: 60 }))).toBe(100);
  });

  /**
   * The exact table from the account that surfaced this. Every one of these
   * has attention 0 — the person did nothing anywhere — so no planned domain
   * may come out above an unplanned one.
   */
  it('never ranks an unmentioned domain above a neglected one', () => {
    const account = [
      d({ domainType: 'family', importance: 60 }),
      d({ domainType: 'children', importance: 45 }),
      d({ domainType: 'health', importance: 40 }),
      d({ domainType: 'career', importance: 15 }),
      d({ domainType: 'partner', importance: 10 }),
      d({ domainType: 'impact', importance: 0 }),
      d({ domainType: 'friends', importance: 0 }),
    ];
    const scored = account.map((x) => heldPercent(x)).filter((n): n is number => n !== null);
    const unscored = account.filter((x) => heldPercent(x) === null);

    expect(unscored.map((x) => x.domainType)).toEqual(['impact', 'friends']);
    // Nothing the person actually did anything about, so nothing reads as held.
    expect(Math.max(...scored)).toBeLessThan(100);
  });

  it('treats a negative or missing importance as unplanned', () => {
    expect(heldPercent(d({ importance: -5 }))).toBeNull();
    expect(isPlanned(d({ importance: 0 }))).toBe(false);
    expect(isPlanned(d({ importance: 1 }))).toBe(true);
  });
});

describe('drift itself is unchanged', () => {
  it('reads the engine neglect score when it is higher than the gap', () => {
    expect(driftOf(d({ importance: 50, attention: 50, neglectRisk: 80 }))).toBeCloseTo(0.8);
  });

  it('clamps to 0..1', () => {
    expect(driftOf(d({ importance: 100, attention: 0 }))).toBe(1);
    expect(driftOf(d({ importance: 0, attention: 100 }))).toBe(0);
  });
});

describe('which domain the read-out opens on', () => {
  const planned = d({ domainType: 'family', importance: 60 });
  const unplanned = d({ domainType: 'finance', importance: 0 });

  it('is the reader own tap, always', () => {
    expect(openingDomain([planned, unplanned], 'finance')).toBe('finance');
  });

  it('is the most adrift planned domain otherwise', () => {
    expect(openingDomain([unplanned, planned])).toBe('family');
  });

  /* A brand-new account has no plan; the read-out is still the way into the
     domain screen, so it opens on something — it just must not grade it. */
  it('falls back to the first domain when nothing is planned', () => {
    expect(openingDomain([unplanned])).toBe('finance');
    expect(heldPercent(unplanned)).toBeNull();
  });

  it('is null when there are no domains at all', () => {
    expect(openingDomain([])).toBeNull();
    expect(mostAdrift([])).toBeNull();
  });

  it('ignores unplanned domains when choosing what is most adrift', () => {
    expect(mostAdrift([unplanned])).toBeNull();
    expect(mostAdrift([unplanned, planned])?.domainType).toBe('family');
  });
});
