import { describe, it, expect } from 'vitest';
import { Domain } from './contract';
import { domainGraph } from './lifeGraph';
import { focusPlan, focusScore, daysRemaining, FocusChoice } from './focus';
import { ClosingWindow } from './time';

const NOW = new Date('2026-08-01T09:00:00Z');
const DAY = 86_400_000;

const ALL: Domain[] = [
  'relationships', 'health', 'career', 'finances',
  'growth', 'experiences', 'mindfulness', 'purpose',
];

const career: FocusChoice = {
  domain: 'career',
  startedAt: NOW,
  until: new Date(NOW.getTime() + 90 * DAY),
};

const HOURS: Partial<Record<Domain, number>> = {
  relationships: 10, health: 8, career: 6, finances: 4,
  growth: 5, experiences: 3, mindfulness: 2, purpose: 2,
};

const amma: ClosingWindow = {
  subjectId: 'person:r1',
  label: 'Amma',
  domain: 'relationships',
  qualityYears: 9,
  because: 'She is 79, and you said her health has been a worry.',
};

const plan = (over: Parameters<typeof focusPlan>[0] extends infer T ? Partial<T> : never = {}) =>
  focusPlan({ focus: career, now: NOW, domains: ALL, currentHours: HOURS, ...(over as object) });

describe('a season has an end', () => {
  it('counts down in days', () => {
    expect(daysRemaining(career, NOW)).toBe(90);
    expect(daysRemaining(career, new Date(NOW.getTime() + 89 * DAY))).toBe(1);
  });

  it('expires rather than renewing itself', () => {
    const done = focusPlan({
      focus: career, now: new Date(NOW.getTime() + 91 * DAY), domains: ALL, currentHours: HOURS,
    });
    expect(done.expired).toBe(true);
    expect(done.daysRemaining).toBe(0);
    expect(done.headline).toMatch(/run its course/);
    // Nothing renews on its own — that is the difference between a season and
    // simply having stopped paying attention to something.
    expect(done.costText).toMatch(/chosen again rather than drifted through/);
  });
});

describe('it re-weights, it never zeroes', () => {
  it('gives the chosen domain the largest share', () => {
    const p = plan();
    const focus = p.weights.find((w) => w.domain === 'career')!;
    expect(focus.weight).toBeGreaterThan(1);
    expect(focus.dimmed).toBe(false);
  });

  it('leaves every dimmed domain a real floor', () => {
    for (const w of plan().weights) {
      // Nothing is switched off. A domain at zero is abandonment with a
      // progress bar, which is what this whole product exists to prevent.
      expect(w.weight).toBeGreaterThan(0);
    }
  });

  it('states the trade in hours, before it is agreed to', () => {
    const p = plan();
    expect(p.trades.length).toBeGreaterThan(0);
    const biggest = p.trades[0];
    expect(biggest.toHours).toBeLessThan(biggest.fromHours);
    expect(p.costText).toContain(`${biggest.fromHours}h`);
    expect(p.costText).toContain(`${biggest.toHours}h`);
  });
});

describe('what will not wait is not up for negotiation', () => {
  it('refuses to dim a domain holding a closing window', () => {
    const p = plan({ closingWindows: [amma] });
    const rel = p.weights.find((w) => w.domain === 'relationships')!;
    expect(rel.protected).toBe(true);
    expect(rel.dimmed).toBe(false);
    expect(rel.protectedBecause).toBe(amma.because);
  });

  it('carries the floor so it can be shown at the moment of choosing', () => {
    const p = plan({ closingWindows: [amma] });
    expect(p.floor.map((w) => w.label)).toEqual(['Amma']);
    expect(p.assumptions.join(' ')).toMatch(/cannot be postponed by any season/);
  });

  it('a protected domain never appears in the trades', () => {
    const p = plan({ closingWindows: [amma] });
    expect(p.trades.map((t) => t.domain)).not.toContain('relationships');
  });

  it('protects what the graph says this focus is known to damage', () => {
    // career → relationships is −0.5 and career → health is −0.45 in the
    // default model, so a career season cannot also quieten the warning.
    const graph = domainGraph(ALL.map((domain) => ({ domain, state: 60 })));
    const p = plan({ graph });
    const rel = p.weights.find((w) => w.domain === 'relationships')!;
    const health = p.weights.find((w) => w.domain === 'health')!;
    expect(rel.protected).toBe(true);
    expect(health.protected).toBe(true);
    // And the reason is read off the edge, never generated.
    expect(rel.protectedBecause).toMatch(/Work rarely asks permission/);
  });

  it('still dims the domains the focus does not touch', () => {
    const graph = domainGraph(ALL.map((domain) => ({ domain, state: 60 })));
    const p = plan({ graph });
    expect(p.weights.some((w) => w.dimmed)).toBe(true);
  });
});

describe('re-ranking quietens, it does not silence', () => {
  it('lifts the chosen domain and lowers the rest', () => {
    const p = plan();
    expect(focusScore(100, 'career', p)).toBeGreaterThan(100);
    expect(focusScore(100, 'experiences', p)).toBeLessThan(100);
  });

  it('a dimmed domain can still win when it matters enough', () => {
    const p = plan();
    // Something at 900 in a dimmed domain still beats 100 in the focus. The
    // season changes the odds; it does not remove anything from the running.
    expect(focusScore(900, 'experiences', p)).toBeGreaterThan(focusScore(100, 'career', p));
  });

  it('an expired season stops affecting anything at all', () => {
    const done = focusPlan({
      focus: career, now: new Date(NOW.getTime() + 91 * DAY), domains: ALL, currentHours: HOURS,
    });
    expect(focusScore(100, 'experiences', done)).toBe(100);
    expect(focusScore(100, 'career', done)).toBe(100);
  });

  it('no focus at all leaves scores untouched', () => {
    expect(focusScore(42, 'career', null)).toBe(42);
    expect(focusScore(42, null, plan())).toBe(42);
  });
});

describe('it says what it is doing', () => {
  it('never claims to have switched anything off', () => {
    const p = plan({ closingWindows: [amma] });
    expect(p.assumptions.join(' ')).toMatch(/Nothing is switched off/);
    expect(p.headline).not.toMatch(/only|ignore|forget/i);
  });

  it('is honest when there is nothing to trade away', () => {
    const p = focusPlan({ focus: career, now: NOW, domains: ['career'], currentHours: HOURS });
    expect(p.trades).toHaveLength(0);
    expect(p.costText).toMatch(/Nothing else is being quietened/);
  });
});
