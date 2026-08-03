import { describe, it, expect } from 'vitest';
import { Domain, EngineContext } from './contract';
import { personalGraph } from './lifeGraph';
import { habitEngine, HabitRecord, keptFraction } from './habit';
import { timeEngine, nonPostponable, ClosingWindow } from './time';

const NOW = new Date('2026-08-01T09:00:00Z');
const DAY = 86_400_000;
const ago = (d: number) => new Date(NOW.getTime() - d * DAY);

const FORBIDDEN = /lazy|failed|should have|discipline|excuse|willpower|broke your/i;

function ctx(data: EngineContext['data'], over: Partial<EngineContext> = {}): EngineContext {
  return {
    userId: 'u1',
    now: NOW,
    age: 34,
    domains: [],
    personalization: { insightIntensity: 'gentle', motivationStyle: 'balanced', declinedTopics: [] },
    priorObservations: [],
    data,
    ...over,
  };
}

// ---------------------------------------------------------------------------
// The graph of one life
// ---------------------------------------------------------------------------

describe('the graph holds people, not only abstractions', () => {
  const base = {
    domains: [
      { domain: 'relationships' as Domain, state: 40 },
      { domain: 'career' as Domain, state: 70 },
      { domain: 'health' as Domain, state: 55 },
    ],
  };

  it('puts a person in the graph and connects them both ways', () => {
    const g = personalGraph({
      ...base,
      people: [{ id: 'r1', name: 'Amma', domain: 'relationships', closeness: 9, overdueRatio: 1 }],
    });
    expect(g.node('person:r1')?.label).toBe('Amma');
    // Losing touch with Amma *is* relationships drifting, and a starved
    // relationships domain is how someone stops calling. Both directions.
    expect(g.neighbours('person:r1').map((e) => e.to)).toContain('relationships');
    expect(g.neighbours('relationships').map((e) => e.to)).toContain('person:r1');
  });

  it('the explanation names them, and is read off the edge', () => {
    const g = personalGraph({
      ...base,
      people: [{ id: 'r1', name: 'Amma', domain: 'relationships', closeness: 9 }],
    });
    const path = g.explain('career', 'person:r1');
    expect(path).toBeTruthy();
    expect(path!.hops.some((h) => h.rationale.includes('Amma'))).toBe(true);
  });

  it('a career shock now reaches a named person, not just a domain', () => {
    const g = personalGraph({
      ...base,
      people: [{ id: 'r1', name: 'Amma', domain: 'relationships', closeness: 10 }],
    });
    const reached = g.propagate('career', -30).map((i) => i.nodeId);
    expect(reached).toContain('relationships');
    expect(reached).toContain('person:r1');
  });

  it('standing reflects how the tie is kept, not how close it is', () => {
    const g = personalGraph({
      ...base,
      people: [
        { id: 'kept', name: 'Divya', domain: 'relationships', closeness: 10, overdueRatio: 1 },
        { id: 'slipped', name: 'Ravi', domain: 'relationships', closeness: 10, overdueRatio: 2.5 },
      ],
    });
    expect(g.node('person:kept')!.state).toBeGreaterThan(g.node('person:slipped')!.state!);
  });

  it('keeps telling degrees apart however overdue everyone is', () => {
    /**
     * A linear penalty put everyone who had not been logged in a while at
     * exactly 0, and a graph where every person scores the same cannot rank
     * anything — which is what the API returned before this: four people, all
     * state 0.
     */
    const g = personalGraph({
      ...base,
      people: [
        { id: 'a', name: 'A', domain: 'relationships', closeness: 8, overdueRatio: 3 },
        { id: 'b', name: 'B', domain: 'relationships', closeness: 8, overdueRatio: 6 },
        { id: 'c', name: 'C', domain: 'relationships', closeness: 8, overdueRatio: 12 },
      ],
    });
    const states = ['a', 'b', 'c'].map((id) => g.node(`person:${id}`)!.state!);
    expect(states[0]).toBeGreaterThan(states[1]);
    expect(states[1]).toBeGreaterThan(states[2]);
    // Never quite zero, which is also the truer thing to say about a person.
    expect(states[2]).toBeGreaterThan(0);
  });

  it('carries goals and rhythms too', () => {
    const g = personalGraph({
      ...base,
      goals: [{ id: 'g1', title: 'Get a job', domain: 'career', momentum: 20 }],
      habits: [{ id: 'h1', title: 'Walk 20 minutes', domain: 'health', keptRate: 80 }],
    });
    expect(g.node('goal:g1')?.state).toBe(20);
    expect(g.node('habit:h1')?.state).toBe(80);
    expect(g.neighbours('habit:h1')[0].rationale).toContain('actually gets fed');
  });

  it('ignores anything hung off a domain this person does not have', () => {
    const g = personalGraph({
      ...base,
      people: [{ id: 'x', name: 'Nobody', domain: 'purpose', closeness: 9 }],
    });
    expect(g.node('person:x')).toBeUndefined();
  });

  it('keeps the population priors between the domains it does have', () => {
    const g = personalGraph(base);
    expect(g.explain('career', 'health')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Habit
// ---------------------------------------------------------------------------

function habit(over: Partial<HabitRecord> = {}): HabitRecord {
  return {
    id: 'h1',
    title: 'Walk 20 minutes',
    domain: 'health',
    targetPerWeek: 5,
    perWeek: 4.5,
    windowDays: 28,
    daysSinceKept: 1,
    createdAt: ago(60),
    ...over,
  };
}

describe('the habit engine never reports a miss', () => {
  it('says a stopped rhythm was the wrong size, not the wrong person', () => {
    const out = habitEngine.run(ctx({ habit: { habits: [habit({ perWeek: 0.5, daysSinceKept: 30 })] } }));
    const o = out.observations.find((x) => x.id.includes('stopped'))!;
    expect(o.statement).toMatch(/size was wrong rather than the intention/);
    expect(o.statement).not.toMatch(FORBIDDEN);
  });

  it('offers a smaller rhythm rather than more effort', () => {
    const out = habitEngine.run(ctx({ habit: { habits: [habit({ perWeek: 0.5, daysSinceKept: 30 })] } }));
    expect(out.proposals[0].action).toMatch(/Halve/);
    expect(out.proposals[0].because).toMatch(/smaller rhythm that holds/);
  });

  it('notices success, which nothing else in the system does', () => {
    const out = habitEngine.run(ctx({ habit: { habits: [habit()] } }));
    const kept = out.observations.find((o) => o.id.includes('kept'));
    expect(kept).toBeTruthy();
    expect(kept!.pressure).toBe('whisper');
  });

  it('answers five stalled rhythms with one conversation, not five nudges', () => {
    const many = Array.from({ length: 7 }, (_, i) => habit({
      id: `h${i}`, title: `Rhythm ${i}`, perWeek: 0.2, daysSinceKept: 40,
    }));
    const out = habitEngine.run(ctx({ habit: { habits: many } }));
    expect(out.observations.filter((o) => o.id.includes('stopped'))).toHaveLength(1);
    expect(out.observations.some((o) => o.id === 'habit:crowded')).toBe(true);
  });

  it('leaves a new rhythm alone until it has had a chance to be anything', () => {
    const fresh = habit({ perWeek: 0, daysSinceKept: null, createdAt: ago(3) });
    expect(habitEngine.run(ctx({ habit: { habits: [fresh] } })))
      .toEqual({ observations: [], proposals: [] });
  });

  it('measures kept against what was agreed, not against a house rule', () => {
    expect(keptFraction(habit({ targetPerWeek: 2, perWeek: 2 }))).toBe(1);
    expect(keptFraction(habit({ targetPerWeek: 7, perWeek: 2 }))).toBeLessThan(0.4);
  });
});

// ---------------------------------------------------------------------------
// Time
// ---------------------------------------------------------------------------

const window = (over: Partial<ClosingWindow> = {}): ClosingWindow => ({
  subjectId: 'person:r1',
  label: 'Amma',
  domain: 'relationships',
  qualityYears: 9,
  because: 'She is 79.',
  ...over,
});

describe('the time engine holds the constraint', () => {
  it('calls an impossible week a sum, not a shortcoming', () => {
    const out = timeEngine.run(ctx({ time: { freeHoursPerWeek: 10, claimedHoursPerWeek: 26 } }));
    const o = out.observations.find((x) => x.id === 'time:overcommitted')!;
    expect(o.statement).toMatch(/a sum, not a shortcoming/);
    expect(o.statement).not.toMatch(FORBIDDEN);
    expect(out.proposals[0].action).toMatch(/serve two of these at once/);
  });

  it('stays quiet when the week actually closes', () => {
    const out = timeEngine.run(ctx({ time: { freeHoursPerWeek: 30, claimedHoursPerWeek: 20 } }));
    expect(out.observations.find((o) => o.id === 'time:overcommitted')).toBeUndefined();
  });

  it('names the windows that close on their own schedule', () => {
    const out = timeEngine.run(ctx({
      time: { freeHoursPerWeek: 20, closingWindows: [window(), window({ subjectId: 'person:r2', label: 'Appa', qualityYears: 7 })] },
    }));
    const o = out.observations.find((x) => x.id === 'time:closing-windows')!;
    expect(o.statement).toContain('Appa');
    expect(o.statement).toContain('Amma');
    // A whisper, never an alarm — this is the one thing that could become one.
    expect(o.pressure).toBe('whisper');
    expect(o.uncertainty).toBeTruthy();
  });

  it('the floor is shortest-first and capped, or it is not a floor', () => {
    const many = Array.from({ length: 8 }, (_, i) => window({
      subjectId: `person:${i}`, label: `P${i}`, qualityYears: 11 - i,
    }));
    const floor = nonPostponable(many);
    expect(floor).toHaveLength(3);
    expect(floor[0].qualityYears).toBeLessThan(floor[2].qualityYears);
  });

  it('a long window is not a closing one', () => {
    expect(nonPostponable([window({ qualityYears: 40 })])).toHaveLength(0);
  });

  it('says nothing at all with nothing to say', () => {
    expect(timeEngine.run(ctx({}))).toEqual({ observations: [], proposals: [] });
    expect(timeEngine.run(ctx({ time: { freeHoursPerWeek: 20 } })).observations).toHaveLength(0);
  });

  it('honours a muted topic', () => {
    const muted = ctx({ time: { freeHoursPerWeek: 2, claimedHoursPerWeek: 40 } }, {
      personalization: { insightIntensity: 'gentle', motivationStyle: 'balanced', declinedTopics: ['time'] },
    });
    expect(timeEngine.run(muted)).toEqual({ observations: [], proposals: [] });
  });
});
