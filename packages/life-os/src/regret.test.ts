import { describe, it, expect } from 'vitest';
import { regretEngine, detectRegretPatterns, RegretEngineData } from './regret';
import { Domain, DomainState, EngineContext } from './contract';

const NOW = new Date('2026-07-28T09:00:00Z');

const flat = (v: number, n = 8) => Array.from({ length: n }, () => v);

const state = (domain: Domain, importance: number, attention: number): DomainState =>
  ({ domain, importance, attention, neglectRisk: Math.max(0, importance - attention) });

const data = (over: Partial<RegretEngineData> = {}): RegretEngineData => ({
  attentionHistory: [],
  contacts: [],
  unsaid: [],
  valueRanking: ['relationships', 'health', 'career'],
  ...over,
});

const ctx = (d: RegretEngineData, domains: DomainState[] = []): EngineContext => ({
  userId: 'u1', now: NOW, age: 34, domains,
  personalization: { insightIntensity: 'gentle', motivationStyle: 'balanced', declinedTopics: [] },
  priorObservations: [],
  data: { regret: d } as EngineContext['data'],
});

describe('living someone else’s life', () => {
  it('fires on a sustained gap between what they said and where hours went', () => {
    const found = detectRegretPatterns(
      data({ attentionHistory: [{ domain: 'relationships', weekly: flat(20) }] }),
      [state('relationships', 85, 20)],
    );
    const p = found.find((f) => f.pattern === 'living-someone-elses-life');
    expect(p).toBeDefined();
    expect(p!.statement).toMatch(/put relationships first/i);
    // The claim is arithmetic on their own two answers — both must be cited.
    expect(p!.evidence.map((e) => e.label).join(' ')).toMatch(/declared importance/);
    expect(p!.evidence.map((e) => e.label).join(' ')).toMatch(/sustained attention/);
  });

  it('stays silent on a single bad week', () => {
    // A hard fortnight must never trigger a lecture about someone's life.
    const found = detectRegretPatterns(
      data({ attentionHistory: [{ domain: 'relationships', weekly: [80, 80, 15] }] }),
      [state('relationships', 85, 15)],
    );
    expect(found.find((f) => f.pattern === 'living-someone-elses-life')).toBeUndefined();
  });

  it('stays silent when they are actually living their priorities', () => {
    const found = detectRegretPatterns(
      data({ attentionHistory: [{ domain: 'relationships', weekly: flat(78) }] }),
      [state('relationships', 85, 78)],
    );
    expect(found.find((f) => f.pattern === 'living-someone-elses-life')).toBeUndefined();
  });
});

describe('worked too hard', () => {
  it('requires a casualty — loving your work is not a regret', () => {
    const onlyBusy = detectRegretPatterns(
      data({
        attentionHistory: [
          { domain: 'career', weekly: flat(85) },
          { domain: 'relationships', weekly: flat(70) },
          { domain: 'health', weekly: flat(65) },
        ],
      }),
      [],
    );
    expect(onlyBusy.find((f) => f.pattern === 'worked-too-hard')).toBeUndefined();
  });

  it('fires when work is high and something close is starving', () => {
    const found = detectRegretPatterns(
      data({
        attentionHistory: [
          { domain: 'career', weekly: flat(88) },
          { domain: 'relationships', weekly: flat(12) },
          { domain: 'health', weekly: flat(60) },
        ],
      }),
      [],
    );
    const p = found.find((f) => f.pattern === 'worked-too-hard');
    expect(p).toBeDefined();
    expect(p!.subjects).toContain('relationships');
    // Not "work less" — one evening. The door is always small.
    expect(p!.action).toMatch(/one evening/i);
  });
});

describe('things left unsaid', () => {
  it('only ever fires on something the person wrote down themselves', () => {
    const inferred = detectRegretPatterns(data({ unsaid: [] }), []);
    expect(inferred.find((f) => f.pattern === 'left-things-unsaid')).toBeUndefined();
  });

  it('fires once something they noted has been waiting long enough', () => {
    const found = detectRegretPatterns(
      data({ unsaid: [{ id: 'u1', note: 'tell dad about the thing', ageDays: 120, personName: 'Dad' }] }),
      [],
    );
    const p = found.find((f) => f.pattern === 'left-things-unsaid');
    expect(p!.action).toBe('Say it to Dad');
    expect(p!.because).toMatch(/already decided this mattered/i);
  });

  it('ignores something noted recently', () => {
    const found = detectRegretPatterns(
      data({ unsaid: [{ id: 'u1', note: 'x', ageDays: 10 }] }),
      [],
    );
    expect(found.find((f) => f.pattern === 'left-things-unsaid')).toBeUndefined();
  });
});

describe('lost touch', () => {
  it('judges against the person’s own target, not a norm we invented', () => {
    const found = detectRegretPatterns(
      data({
        contacts: [
          { id: 'f1', name: 'Sam', relationType: 'friend', daysSinceContact: 130, desiredGapDays: 30 },
          { id: 'f2', name: 'Riya', relationType: 'friend', daysSinceContact: 20, desiredGapDays: 14 },
        ],
      }),
      [],
    );
    const p = found.find((f) => f.pattern === 'lost-touch');
    expect(p!.statement).toContain('Sam');
    expect(p!.evidence.some((e) => e.label.includes('target gap'))).toBe(true);
    expect(p!.effortMinutes).toBeLessThanOrEqual(5);
  });

  it('does not fire on someone inside their own cadence', () => {
    const found = detectRegretPatterns(
      data({ contacts: [{ id: 'f1', name: 'Sam', relationType: 'friend', daysSinceContact: 35, desiredGapDays: 30 }] }),
      [],
    );
    expect(found.find((f) => f.pattern === 'lost-touch')).toBeUndefined();
  });
});

describe('joy deferred and the body', () => {
  it('names sustained starvation of enjoyment', () => {
    const found = detectRegretPatterns(
      data({ attentionHistory: [{ domain: 'experiences', weekly: flat(8) }] }),
      [],
    );
    expect(found.find((f) => f.pattern === 'joy-deferred')).toBeDefined();
  });

  it('names a body being ignored', () => {
    const found = detectRegretPatterns(
      data({ attentionHistory: [{ domain: 'health', weekly: flat(10) }] }),
      [],
    );
    const p = found.find((f) => f.pattern === 'body-ignored');
    expect(p!.tinyStep).toMatch(/shoes/i);
  });
});

describe('as a kernel engine', () => {
  it('is silent with no data at all', () => {
    const out = regretEngine.run({ ...ctx(data()), data: {} });
    expect(out.observations).toEqual([]);
  });

  it('never escalates to insist, however bad the pattern', () => {
    // These land hard enough on their own; nobody asked to be confronted today.
    const out = regretEngine.run(ctx(
      data({
        attentionHistory: [
          { domain: 'career', weekly: flat(95) },
          { domain: 'relationships', weekly: flat(2) },
          { domain: 'health', weekly: flat(2) },
          { domain: 'experiences', weekly: flat(1) },
        ],
        unsaid: [{ id: 'u', note: 'x', ageDays: 400 }],
        contacts: [{ id: 'f', name: 'Sam', relationType: 'friend', daysSinceContact: 400, desiredGapDays: 14 }],
      }),
      [state('relationships', 95, 2)],
    ));
    expect(out.observations.length).toBeGreaterThan(3);
    expect(out.observations.every((o) => o.pressure !== 'insist')).toBe(true);
    expect(out.proposals.every((p) => p.pressure === 'whisper')).toBe(true);
  });

  it('gives every detection a door, a tiny step, and a way out', () => {
    const out = regretEngine.run(ctx(
      data({ attentionHistory: [{ domain: 'health', weekly: flat(10) }] }),
      [],
    ));
    expect(out.proposals.length).toBeGreaterThan(0);
    for (const p of out.proposals) {
      expect(p.action.length).toBeGreaterThan(3);
      expect(p.tinyStep).toBeTruthy();
      expect(p.dismissible).toBe(true);
      expect(p.addresses.length).toBe(1);
    }
  });

  it('grounds every observation in evidence', () => {
    const out = regretEngine.run(ctx(
      data({ attentionHistory: [{ domain: 'experiences', weekly: flat(5) }] }),
      [],
    ));
    expect(out.observations.every((o) => o.evidence.length > 0)).toBe(true);
  });
});
