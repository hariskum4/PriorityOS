import { describe, it, expect } from 'vitest';
import {
  goalEngine, goalMomentum, goalConfidence, goalRisks, daysStalled,
  GoalRecord, GoalEngineData,
} from './goal';
import { EngineContext } from './contract';

const NOW = new Date('2026-07-28T09:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

const goal = (over: Partial<GoalRecord> = {}): GoalRecord => ({
  id: 'g1',
  title: 'Run a 10K',
  domain: 'health',
  milestonesTotal: 4,
  milestonesDone: 1,
  progressAt: [],
  createdAt: daysAgo(60),
  status: 'active',
  ...over,
});

const ctx = (data: GoalEngineData): EngineContext => ({
  userId: 'u1', now: NOW, age: 34, domains: [],
  personalization: { insightIntensity: 'gentle', motivationStyle: 'balanced', declinedTopics: [] },
  priorObservations: [],
  data: { goal: data } as EngineContext['data'],
});

describe('momentum', () => {
  it('is zero with no progress ever', () => {
    expect(goalMomentum(goal(), NOW)).toBe(0);
  });

  it('is high with recent, regular steps', () => {
    expect(goalMomentum(goal({ progressAt: [daysAgo(2), daysAgo(8), daysAgo(15)] }), NOW))
      .toBeGreaterThan(60);
  });

  it('fades gradually rather than falling off a window edge', () => {
    // Decay, not a 30-day cliff — this is what makes momentum feel fair.
    const recent = goalMomentum(goal({ progressAt: [daysAgo(5)] }), NOW);
    const older = goalMomentum(goal({ progressAt: [daysAgo(25)] }), NOW);
    const ancient = goalMomentum(goal({ progressAt: [daysAgo(60)] }), NOW);
    expect(recent).toBeGreaterThan(older);
    expect(older).toBeGreaterThan(ancient);
    expect(ancient).toBeGreaterThan(0); // still counts for something
  });

  it('does not reward frantic activity beyond a healthy cadence', () => {
    const steady = goalMomentum(goal({ progressAt: [daysAgo(1), daysAgo(5), daysAgo(9)] }), NOW);
    const frantic = goalMomentum(goal({
      progressAt: Array.from({ length: 30 }, (_, i) => daysAgo(i * 0.2)),
    }), NOW);
    expect(steady).toBeGreaterThan(50);
    expect(frantic).toBe(100); // caps — not a leaderboard
  });
});

describe('confidence', () => {
  it('is withheld entirely when there is no target date', () => {
    // No made-up numbers. Absent input means absent answer.
    expect(goalConfidence(goal({ targetDate: null }), NOW)).toBeNull();
  });

  it('is high when the pace comfortably beats what remains', () => {
    const c = goalConfidence(goal({
      milestonesDone: 3, milestonesTotal: 4,
      createdAt: daysAgo(30), targetDate: daysAgo(-60),
    }), NOW);
    expect(c!.value).toBeGreaterThan(70);
  });

  it('reports zero once the date has passed, and blames the date not the person', () => {
    const c = goalConfidence(goal({ targetDate: daysAgo(5) }), NOW);
    expect(c!.value).toBe(0);
    expect(c!.uncertainty.assumptions.join(' ')).toMatch(/not that the goal was wrong/i);
  });

  it('always states its assumptions', () => {
    const c = goalConfidence(goal({ targetDate: daysAgo(-90), progressAt: [daysAgo(3)] }), NOW);
    expect(c!.uncertainty.assumptions.length).toBeGreaterThanOrEqual(3);
    expect(c!.uncertainty.assumptions.join(' ')).toMatch(/not a prediction about you/i);
  });

  it('is less certain with fewer recorded steps', () => {
    const sparse = goalConfidence(goal({ targetDate: daysAgo(-90), progressAt: [daysAgo(3)] }), NOW);
    const rich = goalConfidence(goal({
      targetDate: daysAgo(-90),
      progressAt: [1, 6, 12, 20, 28, 35].map(daysAgo),
    }), NOW);
    expect(sparse!.uncertainty.level).toBe('high');
    expect(rich!.uncertainty.level).not.toBe('high');
  });
});

describe('risk', () => {
  it('names a blocking dependency that has also stopped', () => {
    const blocker = goal({ id: 'b', title: 'Find a coach', progressAt: [] });
    const dependent = goal({ id: 'g2', dependsOn: ['b'] });
    const risks = goalRisks(dependent, NOW, new Map([['b', blocker]]));
    expect(risks.find((r) => r.kind === 'blocked')!.note).toContain('Find a coach');
  });

  it('flags a goal with no date at all', () => {
    const risks = goalRisks(goal({ targetDate: null }), NOW, new Map());
    expect(risks.some((r) => r.kind === 'undated')).toBe(true);
  });
});

describe('the three moves when momentum drops', () => {
  it('move 1 — shrinks the step, and uses their own stated purpose', () => {
    const out = goalEngine.run(ctx({
      goals: [goal({ progressAt: [daysAgo(30)], purpose: 'I want to keep up with my daughter' })],
    }));
    const p = out.proposals.find((x) => x.id.endsWith(':shrink'))!;
    expect(p.action).toMatch(/smallest possible step/i);
    expect(p.because).toContain('keep up with my daughter');
    expect(p.tinyStep).toMatch(/silly/i);
  });

  it('move 2 — unblocks, naming the real obstacle instead of nagging the symptom', () => {
    const out = goalEngine.run(ctx({
      goals: [
        goal({ id: 'blocker', title: 'Find a coach', progressAt: [] }),
        goal({ id: 'g2', title: 'Run a 10K', dependsOn: ['blocker'], progressAt: [] }),
      ],
    }));
    const p = out.proposals.find((x) => x.id === 'goal:g2:unblock')!;
    expect(p.action).toContain('Find a coach');
    expect(p.because).toMatch(/not stalled because you stopped caring/i);
  });

  it('move 3 — offers release once it has been stalled long enough', () => {
    const out = goalEngine.run(ctx({
      goals: [goal({ progressAt: [daysAgo(120)], createdAt: daysAgo(200) })],
    }));
    const p = out.proposals.find((x) => x.id.endsWith(':release'))!;
    expect(p.because).toMatch(/that is allowed/i);
    expect(p.tinyStep).toMatch(/no explanation required/i);
  });

  it('says nothing extra about a goal that is moving', () => {
    const out = goalEngine.run(ctx({
      goals: [goal({ progressAt: [daysAgo(1), daysAgo(6), daysAgo(12)] })],
    }));
    expect(out.observations).toHaveLength(1);
    expect(out.proposals).toHaveLength(0);
  });

  it('never blames the person, in any of the three moves', () => {
    const out = goalEngine.run(ctx({
      goals: [
        goal({ id: 'a', progressAt: [daysAgo(30)] }),
        goal({ id: 'b', progressAt: [daysAgo(120)], createdAt: daysAgo(200), domain: 'career' }),
      ],
    }));
    const words = out.proposals.map((p) => `${p.action} ${p.because}`).join(' ').toLowerCase();
    expect(words).not.toMatch(/you failed|behind schedule|you should have|lazy|excuse/);
  });
});

describe('over-commitment', () => {
  it('treats too many live goals as a system problem, not a personal failing', () => {
    const out = goalEngine.run(ctx({
      goals: [1, 2, 3, 4, 5].map((n) =>
        goal({ id: `g${n}`, title: `Goal ${n}`, domain: 'career', progressAt: [daysAgo(3)] })),
    }));
    const obs = out.observations.find((o) => o.id === 'goal:overcommitted:career')!;
    expect(obs.statement).toMatch(/why none of them move/i);
    const p = out.proposals.find((x) => x.id.endsWith(':choose'))!;
    expect(p.because).toMatch(/nothing is wrong with the others/i);
  });

  it('stays quiet at a workable number', () => {
    const out = goalEngine.run(ctx({
      goals: [1, 2].map((n) => goal({ id: `g${n}`, domain: 'career', progressAt: [daysAgo(3)] })),
    }));
    expect(out.observations.some((o) => o.id.startsWith('goal:overcommitted'))).toBe(false);
  });
});

describe('engine hygiene', () => {
  it('ignores released and achieved goals', () => {
    const out = goalEngine.run(ctx({
      goals: [
        goal({ id: 'r', status: 'released' }),
        goal({ id: 'a', status: 'achieved' }),
      ],
    }));
    expect(out.observations).toEqual([]);
  });

  it('is silent with no data', () => {
    const out = goalEngine.run({ ...ctx({ goals: [] }), data: {} });
    expect(out.observations).toEqual([]);
    expect(out.proposals).toEqual([]);
  });

  it('grounds every proposal in an observation it emitted', () => {
    const out = goalEngine.run(ctx({ goals: [goal({ progressAt: [daysAgo(40)] })] }));
    const ids = new Set(out.observations.map((o) => o.id));
    expect(out.proposals.every((p) => p.addresses.every((a) => ids.has(a)))).toBe(true);
  });

  it('reports stalled days from creation when nothing ever happened', () => {
    expect(daysStalled(goal({ progressAt: [], createdAt: daysAgo(45) }), NOW)).toBe(45);
  });
});
