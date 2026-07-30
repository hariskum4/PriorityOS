import { describe, it, expect } from 'vitest';
import { weeklyAllocation } from './allocation';
import {
  healthspan, energyBudget, costOfDelay, suggestSeason, classifyLever,
} from './lifeStrategy';

const FORBIDDEN = /death|dying|lifespan|running out|too late|wasted/i;

// Time-stacking moved to its own suite when its ranking was rewritten to work
// in share points — see timeStacking.test.ts.

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
    const h = healthspan(35); // horizon 65 → healthy ~55
    expect(h.healthyYearsLeft).toBe(55);
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

/**
 * The healthspan levers, once they know anything about the reader.
 *
 * The card used to offer all four to everyone, forever, and sum their years
 * into "up to ~10 more good years" — the same sentence at twenty-five and at
 * seventy, for someone doing all four and someone doing none. It could not
 * tell those two people apart, and it never once credited a rhythm actually
 * being kept.
 *
 * The years themselves stay population figures. What is personal is which of
 * them someone is already holding.
 */
describe('healthspan levers against a real life', () => {
  const at = (key: any, target: number, actual: number, label?: string) =>
    ({ key, target, actual, label });
  const lever = (h: any, key: string) => h.levers.find((l: any) => l.key === key);

  it('credits a rhythm being kept instead of offering it', () => {
    const h = healthspan(30, [at('cardio', 4, 4, '20-minute walk')]);
    expect(lever(h, 'cardio').state).toBe('held');
    expect(lever(h, 'cardio').habitLabel).toBe('20-minute walk');
    expect(h.yearsHeld).toBe(3);
  });

  it('separates a rhythm being missed from one never started', () => {
    // Set four walks a week, doing one and a half. That is not "open" — it is
    // the most useful thing the card can say, and it needs its own state.
    const h = healthspan(30, [at('cardio', 4, 1.5)]);
    expect(lever(h, 'cardio').state).toBe('slipping');
    expect(lever(h, 'strength').state).toBe('open');
    expect(h.yearsSlipping).toBe(3);
    expect(h.yearsHeld).toBe(0);
  });

  it('is forgiving at the edge, the way the streaks are', () => {
    // Three walks out of four is a kept rhythm. A card that calls that a
    // failure is not telling the truth about a life either.
    expect(lever(healthspan(30, [at('cardio', 4, 3.2)]), 'cardio').state).toBe('held');
    expect(lever(healthspan(30, [at('cardio', 4, 3)]), 'cardio').state).toBe('slipping');
  });

  it('says nothing about levers it has no signal for', () => {
    const h = healthspan(30, [at('cardio', 4, 4)]);
    for (const key of ['strength', 'sleep', 'social']) {
      expect(lever(h, key).state).toBe('open');
      expect(lever(h, key).target).toBeUndefined();
    }
    expect(h.yearsOpen).toBe(7);
  });

  it('accounts for every lever exactly once', () => {
    const h = healthspan(30, [at('cardio', 4, 4), at('strength', 2, 1)]);
    expect(h.yearsHeld + h.yearsSlipping + h.yearsOpen).toBe(h.potentialYearsGained);
  });

  it('behaves as it always did when it knows nothing', () => {
    const h = healthspan(35);
    expect(h.healthyYearsLeft).toBe(55);
    expect(h.yearsOpen).toBe(10);
    expect(h.yearsHeld).toBe(0);
    expect(h.levers.every((l: any) => l.state === 'open')).toBe(true);
  });

  it('no longer calls a planning horizon a guarantee of being able-bodied', () => {
    // "65 fully able years" for a 25-year-old is a health claim. The horizon
    // is a lens for deciding; the copy now says which it is.
    const h = healthspan(25);
    expect(h.framingText).toMatch(/planning horizon/);
    expect(h.framingText).not.toMatch(/fully able/);
    expect(h.framingText).not.toMatch(FORBIDDEN);
  });
});

describe('reading a habit as a lever', () => {
  it('recognises the rhythms people actually write down', () => {
    expect(classifyLever('20-minute walk')).toBe('cardio');
    expect(classifyLever('Morning run')).toBe('cardio');
    expect(classifyLever('Gym twice a week')).toBe('strength');
    expect(classifyLever('Push-ups before shower')).toBe('strength');
    expect(classifyLever('Lights out by 11')).toBe('sleep');
  });

  it('would rather recognise nothing than the wrong thing', () => {
    // An unrecognised habit leaves the lever open and offers to start one,
    // which is recoverable. Filing "Sunday call with parents" under cardio
    // because it mentions a walk to the phone is not.
    expect(classifyLever('Sunday call with parents')).toBeNull();
    expect(classifyLever('Read for 20 minutes')).toBeNull();
    expect(classifyLever('Journal at night')).toBeNull();
  });
});

describe('a rhythm just agreed to', () => {
  const at = (key: any, target: number, actual: number, ageDays?: number) =>
    ({ key, target, actual, ageDays });
  const lever = (h: any, key: string) => h.levers.find((l: any) => l.key === key);

  it('is not called failing before a week of it has passed', () => {
    // Agree to strength training, look at the card five seconds later, and be
    // told the rhythm is slipping. The app must not do that to anyone.
    const h = healthspan(30, [at('strength', 2, 0, 0)]);
    expect(lever(h, 'strength').state).toBe('new');
    expect(h.yearsSlipping).toBe(0);
    expect(h.yearsNew).toBe(3);
  });

  it('does not credit years that have not been earned either', () => {
    const h = healthspan(30, [at('strength', 2, 0, 0)]);
    expect(h.yearsHeld).toBe(0);
  });

  it('grades it once it has had its week', () => {
    expect(lever(healthspan(30, [at('strength', 2, 0, 8)]), 'strength').state).toBe('slipping');
  });

  it('credits a new rhythm immediately if it is already being kept', () => {
    // Grace delays the failing verdict, never the crediting one.
    expect(lever(healthspan(30, [at('strength', 2, 2, 1)]), 'strength').state).toBe('held');
  });

  it('still accounts for every lever exactly once', () => {
    const h = healthspan(30, [at('strength', 2, 0, 0), at('cardio', 4, 4, 90)]);
    expect(h.yearsHeld + h.yearsSlipping + h.yearsNew + h.yearsOpen)
      .toBe(h.potentialYearsGained);
  });
});
