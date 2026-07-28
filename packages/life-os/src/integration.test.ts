/**
 * Integration: all five engines through one kernel cycle.
 *
 * The architectural claim is that engines cooperate through the contract
 * without knowing about each other, and that the orchestrator's reduction keeps
 * a whole life's worth of findings down to something a person can actually
 * face. That claim is worth verifying rather than asserting.
 *
 * The fixture is one plausible person: a 34-year-old whose career is eating
 * everything, with a stalled goal, a drifting friend, an abandoned book, and an
 * open job decision. Every engine has something to say about him. The test is
 * about what reaches him.
 */
import { describe, it, expect } from 'vitest';
import { EngineRegistry, runCycleWith, cycleUsedProfound } from './orchestrator';
import { EngineContext, DomainState, Domain } from './contract';
import { decisionEngine } from './decision';
import { regretEngine } from './regret';
import { goalEngine } from './goal';
import { predictionEngine } from './prediction';
import { knowledgeEngine } from './knowledge';

const NOW = new Date('2026-07-28T09:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);
const flat = (v: number, n = 8) => Array.from({ length: n }, () => v);

const domains: DomainState[] = [
  { domain: 'relationships', importance: 90, attention: 18, neglectRisk: 72 },
  { domain: 'health', importance: 75, attention: 15, neglectRisk: 60 },
  { domain: 'career', importance: 60, attention: 92, neglectRisk: 0 },
  { domain: 'experiences', importance: 55, attention: 8, neglectRisk: 47 },
];

const attentionHistory: Array<{ domain: Domain; weekly: number[] }> = [
  { domain: 'career', weekly: [60, 66, 72, 78, 84, 88, 90, 92] },
  { domain: 'relationships', weekly: flat(18) },
  { domain: 'health', weekly: [55, 48, 42, 36, 30, 24, 19, 15] },
  { domain: 'experiences', weekly: flat(8) },
];

function fullContext(): EngineContext {
  return {
    userId: 'harish',
    now: NOW,
    age: 34,
    domains,
    personalization: {
      insightIntensity: 'gentle',
      motivationStyle: 'balanced',
      declinedTopics: [],
      attentionSpanMinutes: 30,
    },
    priorObservations: [],
    data: {
      regret: {
        attentionHistory,
        valueRanking: ['relationships', 'health', 'experiences', 'career'],
        contacts: [
          { id: 'sam', name: 'Sam', relationType: 'friend', daysSinceContact: 140, desiredGapDays: 30 },
        ],
        unsaid: [{ id: 'u1', note: 'thank Dad properly', ageDays: 150, personName: 'Dad' }],
      },
      goal: {
        goals: [
          {
            id: 'g1', title: 'Run a 10K', domain: 'health' as Domain,
            purpose: 'I want to keep up with my daughter',
            milestonesTotal: 4, milestonesDone: 1,
            progressAt: [daysAgo(50)], createdAt: daysAgo(120),
            targetDate: daysAgo(-60), status: 'active' as const,
          },
        ],
      },
      prediction: {
        attentionHistory,
        energyWeekly: [78, 71, 64, 57, 50, 43, 36, 29],
        contactGaps: [
          { id: 'sam', name: 'Sam', desiredGapDays: 30, gapsDays: [20, 26, 33, 41, 48, 56, 63, 71] },
        ],
      },
      knowledge: {
        items: [
          {
            id: 'k1', kind: 'book' as const, title: 'Deep Work',
            topics: ['focus', 'career', 'attention'], status: 'active' as const,
            lastTouchedAt: daysAgo(95), progress: 0.35,
          },
        ],
        targets: [
          { id: 'g1', kind: 'goal' as const, label: 'Run a 10K', topics: ['health', 'habits'], needsHelp: true },
        ],
      },
      decision: {
        open: [{
          id: 'london',
          question: 'whether to take the London offer',
          horizonYears: 10,
          valueRanking: ['relationships', 'health', 'experiences', 'career'] as Domain[],
          options: [
            {
              id: 'take', label: 'Take the offer', reversible: false,
              scores: {
                valuesAlignment: 30, financialImpact: 90, relationshipImpact: 15,
                healthImpact: 25, regretProbability: 65, stress: 85, timeCost: 80,
              },
            },
            {
              id: 'stay', label: 'Stay where you are', isStatusQuo: true, reversible: true,
              scores: {
                valuesAlignment: 72, financialImpact: 45, relationshipImpact: 80,
                healthImpact: 65, regretProbability: 35, stress: 30, timeCost: 35,
              },
            },
          ],
        }],
      },
    } as EngineContext['data'],
  };
}

function fullRegistry(): EngineRegistry {
  return new EngineRegistry()
    .register(regretEngine)
    .register(goalEngine)
    .register(predictionEngine)
    .register(knowledgeEngine)
    .register(decisionEngine);
}

describe('five engines, one cycle', () => {
  it('runs every engine without failure', () => {
    const r = runCycleWith(fullRegistry(), { context: fullContext() });
    expect(r.failures).toEqual([]);
    const speaking = new Set(r.observations.map((o) => o.engine));
    // Everyone with something to say has said it.
    expect(speaking).toContain('regret');
    expect(speaking).toContain('goal');
    expect(speaking).toContain('prediction');
    expect(speaking).toContain('knowledge');
    expect(speaking).toContain('decision');
  });

  it('notices a great deal and surfaces very little', () => {
    // This is the entire product thesis: notice everything, say almost nothing.
    const r = runCycleWith(fullRegistry(), { context: fullContext() });
    expect(r.observations.length).toBeGreaterThan(8);
    expect(r.proposals.length).toBeLessThanOrEqual(5);
    expect(r.suppressed.length).toBeGreaterThan(0);
  });

  it('gives him exactly one thing to do first', () => {
    const r = runCycleWith(fullRegistry(), { context: fullContext() });
    expect(r.now).not.toBeNull();
    expect(r.proposals.filter((p) => p.pressure === 'insist').length).toBeLessThanOrEqual(1);
  });

  it('never asks for more attention than he has', () => {
    const r = runCycleWith(fullRegistry(), { context: fullContext() });
    expect(r.proposals.every((p) => p.effortMinutes <= 30)).toBe(true);
  });

  it('grounds everything it surfaces in something an engine measured', () => {
    const r = runCycleWith(fullRegistry(), { context: fullContext() });
    const ids = new Set(r.observations.map((o) => o.id));
    expect(r.proposals.every((p) => p.addresses.some((a) => ids.has(a)))).toBe(true);
  });

  it('carries provenance on every observation', () => {
    const r = runCycleWith(fullRegistry(), { context: fullContext() });
    expect(r.observations.every((o) => o.evidence.length > 0)).toBe(true);
  });

  it('states uncertainty on everything that looks forward', () => {
    const r = runCycleWith(fullRegistry(), { context: fullContext() });
    const forward = r.observations.filter((o) => o.engine === 'prediction');
    expect(forward.length).toBeGreaterThan(0);
    expect(forward.every((o) => o.uncertainty !== undefined)).toBe(true);
  });

  it('lets a decision be reasoned about after regret has spoken', () => {
    // Ordering is what makes cross-engine reasoning possible at all.
    const r = runCycleWith(fullRegistry(), { context: fullContext() });
    const regretIndex = r.observations.findIndex((o) => o.engine === 'regret');
    const decisionIndex = r.observations.findIndex((o) => o.engine === 'decision');
    expect(regretIndex).toBeGreaterThanOrEqual(0);
    expect(decisionIndex).toBeGreaterThan(regretIndex);
  });

  it('honours a declined topic across every engine at once', () => {
    const ctx = fullContext();
    ctx.personalization.declinedTopics = ['relationships'];
    const r = runCycleWith(fullRegistry(), { context: ctx });
    expect(r.proposals.every((p) => p.domain !== 'relationships')).toBe(true);
  });

  it('goes quiet about mortality entirely when he asks it to', () => {
    const ctx = fullContext();
    ctx.personalization.insightIntensity = 'off';
    const r = runCycleWith(fullRegistry(), { context: ctx });
    expect(r.proposals.every((p) => p.engine !== 'regret' && p.engine !== 'time')).toBe(true);
    // The rest of the system keeps working.
    expect(r.failures).toEqual([]);
  });

  it('rations the profound truth, and the day survives without it', () => {
    const withCooldown = runCycleWith(fullRegistry(), {
      context: fullContext(),
      lastProfoundAt: daysAgo(2),
    });
    expect(cycleUsedProfound(withCooldown)).toBe(false);
    // Suppressing the heaviest thing must not leave him with an empty screen.
    expect(withCooldown.proposals.length).toBeGreaterThan(0);
  });

  it('never blames him, anywhere in the output', () => {
    const r = runCycleWith(fullRegistry(), { context: fullContext() });
    const text = [
      ...r.observations.map((o) => o.statement),
      ...r.proposals.map((p) => `${p.action} ${p.because} ${p.tinyStep ?? ''}`),
    ].join(' ').toLowerCase();
    expect(text).not.toMatch(/you failed|you should have|behind schedule|lazy|no excuse|disappointing/);
  });

  it('is reproducible — the same day twice', () => {
    const a = runCycleWith(fullRegistry(), { context: fullContext() });
    const b = runCycleWith(fullRegistry(), { context: fullContext() });
    expect(b.proposals.map((p) => p.id)).toEqual(a.proposals.map((p) => p.id));
    expect(b.observations.map((o) => o.id)).toEqual(a.observations.map((o) => o.id));
  });

  it('gives a person with a calm life a quiet day', () => {
    // The good outcome is silence, and it must be reachable.
    const calm: EngineContext = {
      ...fullContext(),
      domains: [{ domain: 'relationships', importance: 80, attention: 78, neglectRisk: 2 }],
      data: {},
    };
    const r = runCycleWith(fullRegistry(), { context: calm });
    expect(r.observations).toEqual([]);
    expect(r.proposals).toEqual([]);
    expect(r.now).toBeNull();
    expect(r.failures).toEqual([]);
  });
});
