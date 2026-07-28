import { describe, it, expect } from 'vitest';
import {
  predictionEngine, linearTrend, MIN_SAMPLES, PredictionEngineData,
} from './prediction';
import { EngineContext } from './contract';

const NOW = new Date('2026-07-28T09:00:00Z');

const ctx = (d: PredictionEngineData): EngineContext => ({
  userId: 'u1', now: NOW, age: 34, domains: [],
  personalization: { insightIntensity: 'gentle', motivationStyle: 'balanced', declinedTopics: [] },
  priorObservations: [],
  data: { prediction: d } as EngineContext['data'],
});

const data = (over: Partial<PredictionEngineData> = {}): PredictionEngineData => ({
  attentionHistory: [],
  contactGaps: [],
  ...over,
});

describe('linear trend', () => {
  it('refuses to fit below the minimum sample count', () => {
    // A forecast from three points is worse than no forecast.
    expect(linearTrend([10, 20, 30])).toBeNull();
    expect(linearTrend(Array.from({ length: MIN_SAMPLES - 1 }, (_, i) => i))).toBeNull();
  });

  it('recovers a clean slope with a perfect fit', () => {
    const t = linearTrend([10, 20, 30, 40, 50, 60])!;
    expect(t.slope).toBeCloseTo(10, 5);
    expect(t.fit).toBeCloseTo(1, 5);
    expect(t.samples).toBe(6);
  });

  it('reports a poor fit for noise, so callers can refuse to speak', () => {
    const noisy = linearTrend([50, 10, 90, 20, 80, 30, 70, 40])!;
    expect(noisy.fit).toBeLessThan(0.3);
  });

  it('clamps the projection into the 0..100 range', () => {
    const crashing = linearTrend([60, 50, 40, 30, 20, 10])!;
    expect(crashing.projected).toBe(0);
    const soaring = linearTrend([40, 50, 60, 70, 80, 90])!;
    expect(soaring.projected).toBe(100);
  });

  it('handles a flat series without dividing by zero', () => {
    const t = linearTrend([50, 50, 50, 50, 50, 50])!;
    expect(t.slope).toBe(0);
    expect(t.fit).toBe(1);
  });
});

describe('burnout risk', () => {
  it('requires both rising work and falling energy', () => {
    // Working hard is not burnout. Working hard while the tank drains is.
    const busyButFine = predictionEngine.run(ctx(data({
      attentionHistory: [{ domain: 'career', weekly: [50, 56, 62, 68, 74, 80, 86, 92] }],
      energyWeekly: [70, 71, 70, 72, 71, 70, 72, 71],
    })));
    expect(busyButFine.observations.find((o) => o.id === 'prediction:burnout')).toBeUndefined();
  });

  it('fires when the two lines diverge, and states weeks to empty', () => {
    const out = predictionEngine.run(ctx(data({
      attentionHistory: [{ domain: 'career', weekly: [50, 56, 62, 68, 74, 80, 86, 92] }],
      energyWeekly: [80, 72, 65, 57, 50, 42, 35, 27],
    })));
    const o = out.observations.find((x) => x.id === 'prediction:burnout')!;
    expect(o.statement).toMatch(/run empty in roughly \d+ weeks/i);
    expect(o.uncertainty).toBeDefined();
    // Both slopes must be cited — the claim rests on the divergence.
    const labels = o.evidence.map((e) => e.label).join(' ');
    expect(labels).toMatch(/career attention slope/);
    expect(labels).toMatch(/energy slope/);
  });

  it('offers recovery rather than telling them to work less', () => {
    const out = predictionEngine.run(ctx(data({
      attentionHistory: [{ domain: 'career', weekly: [50, 58, 64, 70, 78, 84, 90, 95] }],
      energyWeekly: [80, 71, 63, 55, 46, 38, 30, 22],
    })));
    const p = out.proposals.find((x) => x.id === 'prediction:burnout:recover')!;
    expect(p.because).toMatch(/one block that work is not allowed to take/i);
    expect(p.effortMinutes).toBeLessThanOrEqual(10);
  });

  it('stays silent without energy data, rather than inferring it', () => {
    const out = predictionEngine.run(ctx(data({
      attentionHistory: [{ domain: 'career', weekly: [50, 58, 64, 70, 78, 84, 90, 95] }],
    })));
    expect(out.observations.find((o) => o.id === 'prediction:burnout')).toBeUndefined();
  });
});

describe('relationship drift', () => {
  it('projects widening gaps against the person’s own target', () => {
    const out = predictionEngine.run(ctx(data({
      contactGaps: [{
        id: 'p1', name: 'Sam', desiredGapDays: 14,
        gapsDays: [10, 14, 19, 23, 29, 34, 40, 46],
      }],
    })));
    const o = out.observations.find((x) => x.id === 'prediction:drift:p1')!;
    expect(o.statement).toContain('Sam');
    expect(o.statement).toMatch(/against the 14 you wanted/);
    expect(o.uncertainty!.assumptions.join(' ')).toMatch(/not a prediction about you/i);
  });

  it('says nothing while the projection stays inside their target', () => {
    const out = predictionEngine.run(ctx(data({
      contactGaps: [{
        id: 'p1', name: 'Sam', desiredGapDays: 90,
        gapsDays: [10, 11, 12, 13, 14, 15, 16, 17],
      }],
    })));
    expect(out.observations.find((o) => o.id === 'prediction:drift:p1')).toBeUndefined();
  });

  it('says nothing when the rhythm is steady', () => {
    const out = predictionEngine.run(ctx(data({
      contactGaps: [{
        id: 'p1', name: 'Sam', desiredGapDays: 14,
        gapsDays: [14, 13, 15, 14, 14, 15, 13, 14],
      }],
    })));
    expect(out.observations).toEqual([]);
  });
});

describe('balance trajectory', () => {
  it('names the domain sliding fastest while the slide is still small', () => {
    const out = predictionEngine.run(ctx(data({
      attentionHistory: [
        { domain: 'health', weekly: [70, 64, 58, 52, 46, 40, 34, 28] },
        { domain: 'growth', weekly: [50, 49, 50, 48, 49, 50, 48, 49] },
      ],
    })));
    const o = out.observations.find((x) => x.id === 'prediction:balance:health')!;
    expect(o.statement).toMatch(/sliding for 8 weeks/i);
    expect(o.evidence.some((e) => e.label.includes('in 8 weeks at this pace'))).toBe(true);
  });

  it('reports only the worst, not a list of every wobble', () => {
    const out = predictionEngine.run(ctx(data({
      attentionHistory: [
        { domain: 'health', weekly: [70, 64, 58, 52, 46, 40, 34, 28] },
        { domain: 'growth', weekly: [60, 56, 52, 48, 44, 40, 36, 32] },
      ],
    })));
    expect(out.observations.filter((o) => o.id.startsWith('prediction:balance'))).toHaveLength(1);
  });
});

describe('restraint', () => {
  it('is entirely silent with no data', () => {
    const out = predictionEngine.run({ ...ctx(data()), data: {} });
    expect(out.observations).toEqual([]);
    expect(out.proposals).toEqual([]);
  });

  it('never emits a projection without stated uncertainty', () => {
    const out = predictionEngine.run(ctx(data({
      attentionHistory: [
        { domain: 'career', weekly: [50, 58, 64, 70, 78, 84, 90, 95] },
        { domain: 'health', weekly: [70, 64, 58, 52, 46, 40, 34, 28] },
      ],
      energyWeekly: [80, 72, 64, 56, 48, 40, 32, 24],
      contactGaps: [{ id: 'p1', name: 'Sam', desiredGapDays: 14, gapsDays: [10, 15, 20, 26, 31, 37, 42, 48] }],
    })));
    expect(out.observations.length).toBeGreaterThan(2);
    expect(out.observations.every((o) => o.uncertainty !== undefined)).toBe(true);
  });

  it('never raises pressure above mention — a forecast is not an emergency', () => {
    const out = predictionEngine.run(ctx(data({
      attentionHistory: [{ domain: 'career', weekly: [40, 50, 60, 70, 80, 90, 95, 99] }],
      energyWeekly: [90, 78, 66, 54, 42, 30, 18, 6],
    })));
    expect(out.observations.every((o) => o.pressure !== 'insist')).toBe(true);
  });
});
