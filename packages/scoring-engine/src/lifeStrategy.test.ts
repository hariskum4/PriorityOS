import { describe, it, expect } from 'vitest';
import { suggestStacks, domainsCovered } from './timeStacking';
import { weeklyAllocation } from './allocation';
import { healthspan, energyBudget, costOfDelay, suggestSeason } from './lifeStrategy';

const FORBIDDEN = /death|dying|lifespan|running out|too late|wasted/i;

describe('time-stacking', () => {
  it('prioritizes stacks that cover two neglected domains', () => {
    const stacks = suggestStacks(['health', 'family'], 3);
    expect(stacks[0].covers.length).toBe(2); // walk_call_parent covers both
    expect(stacks[0].domains).toContain('health');
    expect(stacks[0].domains).toContain('family');
  });

  it('every stack names a concrete action and serves 2+ domains', () => {
    const stacks = suggestStacks(['growth'], 5);
    for (const st of stacks) {
      expect(st.action.length).toBeGreaterThan(8);
      expect(st.domains.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('falls back to broadly useful stacks when nothing is neglected', () => {
    const stacks = suggestStacks([], 3);
    expect(stacks.length).toBe(3);
  });

  it('domainsCovered reports the full reach of a set of stacks', () => {
    const stacks = suggestStacks(['health', 'family', 'growth'], 2);
    expect(domainsCovered(stacks).length).toBeGreaterThanOrEqual(2);
  });
});

describe('weekly allocation', () => {
  const weights = [
    { domainType: 'family', importance: 90 },
    { domainType: 'health', importance: 70 },
    { domainType: 'career', importance: 40 },
    { domainType: 'growth', importance: 20 },
  ];

  it('distributes free hours by importance, most-valued domain leading', () => {
    const a = weeklyAllocation(42, weights);
    expect(a.allotments[0].domainType).toBe('family');
    expect(a.allotments[0].hours).toBeGreaterThan(a.allotments[3].hours);
  });

  it('never allots zero to a ranked domain (the floor)', () => {
    const a = weeklyAllocation(42, weights);
    for (const al of a.allotments) expect(al.hours).toBeGreaterThanOrEqual(0.5);
  });

  it('shares sum to about 100%', () => {
    const a = weeklyAllocation(42, weights);
    const sum = a.allotments.reduce((s, x) => s + x.share, 0);
    expect(sum).toBeGreaterThanOrEqual(97);
    expect(sum).toBeLessThanOrEqual(103);
  });

  it('handles no ranked domains gracefully', () => {
    const a = weeklyAllocation(42, []);
    expect(a.allotments).toEqual([]);
  });
});

describe('healthspan', () => {
  it('shows healthy years (horizon minus the frail tail) and the widen-able window', () => {
    const h = healthspan(35); // horizon 45 → healthy ~35
    expect(h.healthyYearsLeft).toBe(35);
    expect(h.potentialYearsGained).toBe(10);
    expect(h.levers.length).toBe(4);
  });

  it('floors healthy years and never uses doom vocabulary', () => {
    const h = healthspan(85);
    expect(h.healthyYearsLeft).toBeGreaterThanOrEqual(2);
    expect(h.framingText).not.toMatch(FORBIDDEN);
    expect(h.framingText).toMatch(/widening a window/);
  });
});

describe('energy budget', () => {
  it('reports weekly peak hours and the sleep-multiplier truth', () => {
    const e = energyBudget(35, 20);
    expect(e.peakHoursPerWeek).toBe(21);
    expect(e.peakHoursToHorizon).toBeGreaterThan(0);
    expect(e.assumptions.join(' ')).toMatch(/Sleep is the multiplier/);
  });
});

describe('cost of delay', () => {
  it('gives each domain a compounding metaphor, not just money', () => {
    expect(costOfDelay('health', 10).framingText).toMatch(/compound/i);
    expect(costOfDelay('growth', 10).framingText).toMatch(/interest/);
    expect(costOfDelay('friends', 10).framingText).toMatch(/presence/);
  });

  it('falls back gracefully for domains without a bespoke metaphor', () => {
    expect(costOfDelay('impact', 10).framingText).toMatch(/compounds/);
  });
});

describe('seasons', () => {
  it('picks the season by what is most at risk, not what scores highest', () => {
    const s = suggestSeason([
      { domainType: 'family', importance: 90, neglectRisk: 20 },
      { domainType: 'health', importance: 40, neglectRisk: 75 },
    ]);
    expect(s.focusDomain).toBe('health'); // at-risk beats high-importance
    expect(s.atRiskDomains).toContain('health');
    expect(s.framingText).toMatch(/why most people quit/);
  });

  it('when nothing is at risk, suggests deepening rather than rescuing', () => {
    const s = suggestSeason([
      { domainType: 'family', importance: 90, neglectRisk: 10 },
      { domainType: 'health', importance: 60, neglectRisk: 15 },
    ]);
    expect(s.atRiskDomains).toEqual([]);
    expect(s.framingText).toMatch(/deepen rather than rescue/);
    expect(s.focusDomain).toBe('family');
  });
});
