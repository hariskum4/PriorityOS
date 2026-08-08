import { describe, it, expect } from 'vitest';
import {
  Engine, EngineContext, EngineId, Observation, Proposal, PersonalizationState,
} from './contract';
import {
  EngineRegistry, EngineCycleError, runCycleWith, cycleUsedProfound,
} from './orchestrator';

const NOW = new Date('2026-07-28T09:00:00Z');

const personalization = (over: Partial<PersonalizationState> = {}): PersonalizationState => ({
  insightIntensity: 'gentle',
  motivationStyle: 'balanced',
  declinedTopics: [],
  ...over,
});

const ctx = (over: Partial<EngineContext> = {}): EngineContext => ({
  userId: 'u1',
  now: NOW,
  age: 34,
  domains: [],
  personalization: personalization(),
  priorObservations: [],
  data: {},
  ...over,
});

function obs(id: string, engine: EngineId): Observation {
  return {
    id, engine, domain: 'relationships',
    statement: `observation ${id}`,
    pressure: 'mention',
    evidence: [{ label: 'x', value: 1, source: 'test' }],
    observedAt: NOW,
  };
}

function prop(over: Partial<Proposal> & { id: string; engine: EngineId }): Proposal {
  return {
    domain: 'relationships',
    action: `action ${over.id}`,
    because: 'because',
    effortMinutes: 10,
    pressure: 'mention',
    addresses: [],
    ...over,
  } as Proposal;
}

/** An engine that just emits what it is handed. */
function fake(id: EngineId, out: { observations?: Observation[]; proposals?: Proposal[] }, dependsOn?: EngineId[]): Engine {
  return {
    id,
    dependsOn,
    run: () => ({ observations: out.observations ?? [], proposals: out.proposals ?? [] }),
  };
}

describe('engine ordering', () => {
  it('runs dependencies before their dependents', () => {
    const order: EngineId[] = [];
    const reg = new EngineRegistry()
      .register({ id: 'decision', dependsOn: ['regret'], run: () => { order.push('decision'); return { observations: [], proposals: [] }; } })
      .register({ id: 'regret', dependsOn: ['memory'], run: () => { order.push('regret'); return { observations: [], proposals: [] }; } })
      .register({ id: 'memory', run: () => { order.push('memory'); return { observations: [], proposals: [] }; } });

    runCycleWith(reg, { context: ctx() });
    expect(order).toEqual(['memory', 'regret', 'decision']);
  });

  it('tolerates a dependency that is not deployed', () => {
    // A deployment without the Prediction engine should degrade, not crash.
    const reg = new EngineRegistry().register(fake('decision', {}, ['prediction']));
    expect(() => runCycleWith(reg, { context: ctx() })).not.toThrow();
  });

  it('rejects a dependency cycle by name', () => {
    const reg = new EngineRegistry()
      .register(fake('goal', {}, ['habit']))
      .register(fake('habit', {}, ['goal']));
    expect(() => reg.resolveOrder()).toThrow(EngineCycleError);
  });

  it('gives each engine the observations of the ones before it', () => {
    let seenByDecision = 0;
    const reg = new EngineRegistry()
      .register(fake('memory', { observations: [obs('m1', 'memory'), obs('m2', 'memory')] }))
      .register({
        id: 'decision',
        dependsOn: ['memory'],
        run: (c) => { seenByDecision = c.priorObservations.length; return { observations: [], proposals: [] }; },
      });

    runCycleWith(reg, { context: ctx() });
    expect(seenByDecision).toBe(2);
  });
});

describe('engine failure isolation', () => {
  it('records a throwing engine and still runs the rest', () => {
    const reg = new EngineRegistry()
      .register({ id: 'habit', run: () => { throw new Error('boom'); } })
      .register(fake('goal', {
        observations: [obs('g1', 'goal')],
        proposals: [prop({ id: 'p1', engine: 'goal', addresses: ['g1'] })],
      }));

    const r = runCycleWith(reg, { context: ctx() });
    expect(r.failures).toEqual([{ engine: 'habit', error: 'boom' }]);
    expect(r.proposals).toHaveLength(1);
    expect(r.now?.id).toBe('p1');
  });
});

describe('the reduction rules', () => {
  it('drops a proposal with no supporting observation', () => {
    // Nothing reaches a person unless an engine actually measured something.
    const reg = new EngineRegistry().register(fake('goal', {
      proposals: [prop({ id: 'ungrounded', engine: 'goal', addresses: [] })],
    }));
    const r = runCycleWith(reg, { context: ctx() });
    expect(r.proposals).toHaveLength(0);
    expect(r.suppressed[0].reason).toBe('no-supporting-observation');
  });

  it('drops a proposal citing an observation that does not exist', () => {
    const reg = new EngineRegistry().register(fake('goal', {
      proposals: [prop({ id: 'dangling', engine: 'goal', addresses: ['nope'] })],
    }));
    const r = runCycleWith(reg, { context: ctx() });
    expect(r.suppressed[0].reason).toBe('no-supporting-observation');
  });

  it('allows only one insistent thing at a time and demotes the rest', () => {
    const reg = new EngineRegistry().register(fake('goal', {
      observations: [obs('o1', 'goal'), obs('o2', 'goal')],
      proposals: [
        prop({ id: 'a', engine: 'goal', pressure: 'insist', addresses: ['o1'], domain: 'health' }),
        prop({ id: 'b', engine: 'goal', pressure: 'insist', addresses: ['o2'], domain: 'career' }),
      ],
    }));
    const r = runCycleWith(reg, { context: ctx() });
    const insists = r.proposals.filter((p) => p.pressure === 'insist');
    expect(insists).toHaveLength(1);
    // Demoted, not discarded — it still matters, it just stops shouting.
    expect(r.proposals).toHaveLength(2);
    expect(r.proposals[1].pressure).toBe('mention');
  });

  it('honours a declined topic permanently and without asking why', () => {
    const reg = new EngineRegistry().register(fake('relationship', {
      observations: [obs('r1', 'relationship')],
      proposals: [prop({ id: 'call', engine: 'relationship', addresses: ['r1'], domain: 'relationships' })],
    }));
    const r = runCycleWith(reg, {
      context: ctx({ personalization: personalization({ declinedTopics: ['relationships'] }) }),
    });
    expect(r.proposals).toHaveLength(0);
    expect(r.suppressed[0].reason).toBe('muted-topic');
  });

  it('rations profound truths to one per cooldown window', () => {
    const reg = new EngineRegistry().register(fake('regret', {
      observations: [obs('reg1', 'regret')],
      proposals: [prop({ id: 'profound', engine: 'regret', addresses: ['reg1'] })],
    }));

    const blocked = runCycleWith(reg, {
      context: ctx(),
      lastProfoundAt: new Date('2026-07-25T09:00:00Z'), // 3 days ago
    });
    expect(blocked.proposals).toHaveLength(0);
    expect(blocked.suppressed[0].reason).toBe('profound-cooldown');

    const allowed = runCycleWith(reg, {
      context: ctx(),
      lastProfoundAt: new Date('2026-07-10T09:00:00Z'), // 18 days ago
    });
    expect(allowed.proposals).toHaveLength(1);
    expect(cycleUsedProfound(allowed)).toBe(true);
  });

  it('silences mortality framing entirely when intensity is off', () => {
    const reg = new EngineRegistry().register(fake('time', {
      observations: [obs('t1', 'time')],
      proposals: [prop({ id: 'weekends', engine: 'time', addresses: ['t1'] })],
    }));
    const r = runCycleWith(reg, {
      context: ctx({ personalization: personalization({ insightIntensity: 'off' }) }),
    });
    expect(r.proposals).toHaveLength(0);
    expect(r.suppressed[0].reason).toBe('muted-topic');
  });

  it('treats two engines reaching the same conclusion as agreement, not two tasks', () => {
    const reg = new EngineRegistry()
      .register(fake('relationship', {
        observations: [obs('r1', 'relationship')],
        proposals: [prop({ id: 'a', engine: 'relationship', action: 'Call your father', addresses: ['r1'] })],
      }))
      .register(fake('regret', {
        observations: [obs('g1', 'regret')],
        proposals: [prop({ id: 'b', engine: 'regret', action: 'call your father!', addresses: ['g1'] })],
      }));
    const r = runCycleWith(reg, { context: ctx() });
    expect(r.proposals).toHaveLength(1);
    expect(r.suppressed.map((s) => s.reason)).toContain('duplicate-action');
  });

  it('stops one loud domain from owning the whole day', () => {
    const observations = [1, 2, 3, 4].map((n) => obs(`o${n}`, 'habit'));
    const reg = new EngineRegistry().register(fake('habit', {
      observations,
      proposals: [1, 2, 3, 4].map((n) =>
        prop({ id: `h${n}`, engine: 'habit', domain: 'health', addresses: [`o${n}`] })),
    }));
    const r = runCycleWith(reg, { context: ctx(), budget: { maxPerDomain: 2 } });
    expect(r.proposals).toHaveLength(2);
    expect(r.suppressed.filter((s) => s.reason === 'domain-quota')).toHaveLength(2);
  });

  it('sizes proposals to the attention the person actually has', () => {
    const reg = new EngineRegistry().register(fake('goal', {
      observations: [obs('o1', 'goal'), obs('o2', 'goal')],
      proposals: [
        prop({ id: 'long', engine: 'goal', effortMinutes: 90, addresses: ['o1'] }),
        prop({ id: 'short', engine: 'goal', effortMinutes: 10, addresses: ['o2'], domain: 'career' }),
      ],
    }));
    const r = runCycleWith(reg, {
      context: ctx({ personalization: personalization({ attentionSpanMinutes: 20 }) }),
    });
    expect(r.proposals.map((p) => p.id)).toEqual(['short']);
    expect(r.suppressed[0].reason).toBe('exceeds-attention');
  });

  it('does not re-deliver a truth already seen', () => {
    const reg = new EngineRegistry().register(fake('goal', {
      observations: [obs('o1', 'goal')],
      proposals: [prop({ id: 'p1', engine: 'goal', addresses: ['o1'] })],
    }));
    const r = runCycleWith(reg, { context: ctx(), seenObservationIds: ['o1'] });
    expect(r.suppressed[0].reason).toBe('already-seen');
  });

  it('ranks significance above cheapness', () => {
    // Regression: ranking on effort alone let a one-minute bit of tidying beat
    // an eight-week pattern of a starved top value. The trivial thing won every
    // time and the product quietly became a chore list.
    const big: Observation = { ...obs('big', 'regret'), magnitude: 90 };
    const small: Observation = { ...obs('small', 'knowledge'), magnitude: 20 };
    const reg = new EngineRegistry().register(fake('regret', {
      observations: [big, small],
      proposals: [
        prop({ id: 'trivial', engine: 'knowledge', action: 'Let a book go', effortMinutes: 1, addresses: ['small'], domain: 'growth' }),
        prop({ id: 'weighty', engine: 'regret', action: 'Put an hour into the thing you said matters', effortMinutes: 60, addresses: ['big'], domain: 'relationships' }),
      ],
    }));
    const r = runCycleWith(reg, { context: ctx() });
    expect(r.now?.id).toBe('weighty');
  });

  it('nudges about one person once, however many engines noticed', () => {
    // Regression: Regret and Prediction both spotting the same drifting friend
    // produced two differently-worded nudges about Sam in one morning, which
    // reads as broken rather than thorough.
    const a: Observation = { ...obs('r1', 'regret'), subjects: ['sam'] };
    const b: Observation = { ...obs('p1', 'prediction'), subjects: ['sam'] };
    const reg = new EngineRegistry()
      .register(fake('regret', {
        observations: [a],
        proposals: [prop({ id: 'x', engine: 'regret', action: 'Send Sam one message', addresses: ['r1'] })],
      }))
      .register(fake('prediction', {
        observations: [b],
        proposals: [prop({ id: 'y', engine: 'prediction', action: 'Message Sam this week', addresses: ['p1'] })],
      }));
    const r = runCycleWith(reg, { context: ctx() });
    expect(r.proposals).toHaveLength(1);
    expect(r.suppressed.map((s) => s.reason)).toContain('subject-already-addressed');
  });

  /**
   * The same rule, against what other surfaces already put on the plate.
   *
   * A new account picks "Reach out to Vikram this week — one message is
   * enough" at the end of onboarding, and Today opened with that mission
   * sitting directly above this kernel's "Call Vikram — not a text". One
   * screen, one person, two instructions, the second contradicting the first.
   */
  it('says nothing about a person today already has a mission about', () => {
    const a: Observation = { ...obs('r1', 'regret'), subjects: ['person:vikram'] };
    const reg = new EngineRegistry().register(fake('regret', {
      observations: [a],
      proposals: [prop({ id: 'x', engine: 'regret', action: 'Call Vikram — not a text', addresses: ['r1'] })],
    }));
    const r = runCycleWith(reg, {
      context: ctx(),
      addressedSubjects: ['person:vikram'],
    });
    expect(r.proposals).toHaveLength(0);
    expect(r.suppressed.map((s) => s.reason)).toContain('subject-already-addressed');
  });

  /**
   * The half of that rule that was never reachable.
   *
   * The engines tag a person `person:<id>`; the host records a mission's
   * person as a bare id. Seeded from one spelling and compared against the
   * other, the set never collided — so the suppression above read as enforced
   * and, for a mission the host had written from its own records, was not.
   */
  it.each([
    ['engine spelling on both sides', ['person:vikram']],
    ['host spelling, engine tag', ['vikram']],
  ])('matches the same person across %s', (_label, addressedSubjects) => {
    const a: Observation = { ...obs('r1', 'regret'), subjects: ['person:vikram'] };
    const reg = new EngineRegistry().register(fake('regret', {
      observations: [a],
      proposals: [prop({ id: 'x', engine: 'regret', action: 'Call Vikram — not a text', addresses: ['r1'] })],
    }));
    const r = runCycleWith(reg, { context: ctx(), addressedSubjects });
    expect(r.proposals).toHaveLength(0);
    expect(r.suppressed.map((s) => s.reason)).toContain('subject-already-addressed');
  });

  /**
   * An errand with nobody on it.
   *
   * "Book the checkup you have moved three times" carries no person and no
   * goal, so the subject rule cannot see it however the ids are spelled. The
   * only thing the standing copy and the proposed copy share is their wording.
   */
  it('says nothing it has already been said yes to, word for word', () => {
    const reg = new EngineRegistry().register(fake('regret', {
      observations: [obs('r1', 'regret')],
      proposals: [prop({ id: 'x', engine: 'regret', action: 'Book the checkup', addresses: ['r1'] })],
    }));
    const r = runCycleWith(reg, {
      context: ctx(),
      /* Punctuation and case differ, as they will between a catalog title and
         a person's own edit of it. */
      addressedActions: ['  BOOK  the   checkup!  '],
    });
    expect(r.proposals).toHaveLength(0);
    expect(r.suppressed.map((s) => s.reason)).toContain('already-accepted');
  });

  it('still proposes an errand that is merely similar', () => {
    const reg = new EngineRegistry().register(fake('regret', {
      observations: [obs('r1', 'regret')],
      proposals: [prop({ id: 'x', engine: 'regret', action: 'Book the dentist', addresses: ['r1'] })],
    }));
    const r = runCycleWith(reg, {
      context: ctx(),
      addressedActions: ['Book the checkup'],
    });
    expect(r.proposals.map((p) => p.id)).toEqual(['x']);
  });

  it('is unchanged when nothing is standing', () => {
    const reg = new EngineRegistry().register(fake('regret', {
      observations: [obs('r1', 'regret')],
      proposals: [prop({ id: 'x', engine: 'regret', action: 'Book the checkup', addresses: ['r1'] })],
    }));
    expect(runCycleWith(reg, { context: ctx() }).proposals.map((p) => p.id)).toEqual(['x']);
    expect(runCycleWith(reg, { context: ctx(), addressedActions: [] }).proposals.map((p) => p.id))
      .toEqual(['x']);
  });

  it('still speaks about everybody else on the plate', () => {
    const a: Observation = { ...obs('r1', 'regret'), subjects: ['person:vikram'] };
    const b: Observation = { ...obs('r2', 'regret'), subjects: ['person:amma'] };
    const reg = new EngineRegistry().register(fake('regret', {
      observations: [a, b],
      proposals: [
        prop({ id: 'x', engine: 'regret', action: 'Call Vikram — not a text', addresses: ['r1'] }),
        prop({ id: 'y', engine: 'regret', action: 'Call Amma — not a text', addresses: ['r2'] }),
      ],
    }));
    const r = runCycleWith(reg, {
      context: ctx(),
      addressedSubjects: ['person:vikram'],
    });
    expect(r.proposals.map((p) => p.id)).toEqual(['y']);
  });

  it('still nudges about two different people', () => {
    const a: Observation = { ...obs('r1', 'regret'), subjects: ['sam'] };
    const b: Observation = { ...obs('r2', 'regret'), subjects: ['dad'] };
    const reg = new EngineRegistry().register(fake('regret', {
      observations: [a, b],
      proposals: [
        prop({ id: 'x', engine: 'regret', action: 'Send Sam one message', addresses: ['r1'] }),
        prop({ id: 'y', engine: 'regret', action: 'Say it to Dad', addresses: ['r2'] }),
      ],
    }));
    const r = runCycleWith(reg, { context: ctx() });
    expect(r.proposals).toHaveLength(2);
  });

  it('prefers the cheaper door when two proposals matter equally', () => {
    const reg = new EngineRegistry().register(fake('goal', {
      observations: [obs('o1', 'goal'), obs('o2', 'goal')],
      proposals: [
        prop({ id: 'expensive', engine: 'goal', effortMinutes: 45, addresses: ['o1'], domain: 'career' }),
        prop({ id: 'cheap', engine: 'goal', effortMinutes: 5, addresses: ['o2'], domain: 'growth' }),
      ],
    }));
    const r = runCycleWith(reg, { context: ctx() });
    expect(r.now?.id).toBe('cheap');
  });

  it('returns a quiet day rather than inventing something to say', () => {
    const reg = new EngineRegistry().register(fake('goal', {}));
    const r = runCycleWith(reg, { context: ctx() });
    expect(r.proposals).toEqual([]);
    expect(r.now).toBeNull();
    expect(r.failures).toEqual([]);
  });

  it('is deterministic — the same context always produces the same day', () => {
    const build = () => new EngineRegistry()
      .register(fake('goal', {
        observations: [obs('o1', 'goal'), obs('o2', 'goal')],
        proposals: [
          prop({ id: 'a', engine: 'goal', addresses: ['o1'], domain: 'career' }),
          prop({ id: 'b', engine: 'goal', addresses: ['o2'], domain: 'growth' }),
        ],
      }));
    const one = runCycleWith(build(), { context: ctx() });
    const two = runCycleWith(build(), { context: ctx() });
    expect(two.proposals.map((p) => p.id)).toEqual(one.proposals.map((p) => p.id));
    expect(two.ranAt).toEqual(one.ranAt);
  });
});
