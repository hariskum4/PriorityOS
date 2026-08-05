import { describe, it, expect } from 'vitest';
import { EngineContext } from './contract';
import {
  relationshipEngine, mostWanting, overdueRatio, RelationshipRecord,
} from './relationship';

const NOW = new Date('2026-08-01T09:00:00Z');
const DAY = 86_400_000;
const ago = (days: number) => new Date(NOW.getTime() - days * DAY);

const FORBIDDEN = /death|dying|lifespan|running out|too late|failed|should have|neglect/i;

function person(over: Partial<RelationshipRecord> = {}): RelationshipRecord {
  return {
    id: 'r1',
    name: 'Amma',
    relationType: 'mother',
    domain: 'relationships',
    closeness: 9,
    desiredCadence: 'weekly',
    lastContactAt: ago(7),
    wantsMoreTime: false,
    ...over,
  };
}

function ctx(rels: RelationshipRecord[], over: Partial<EngineContext> = {}): EngineContext {
  return {
    userId: 'u1',
    now: NOW,
    age: 34,
    domains: [],
    personalization: {
      insightIntensity: 'gentle',
      motivationStyle: 'balanced',
      declinedTopics: [],
    },
    priorObservations: [],
    data: { relationship: { relationships: rels } },
    ...over,
  };
}

describe('lateness is measured against their own rhythm', () => {
  it('a fortnight is nothing for a quarterly friend and a lot for a daily parent', () => {
    const friend = person({ desiredCadence: 'quarterly', lastContactAt: ago(14) });
    const parent = person({ desiredCadence: 'daily', lastContactAt: ago(14) });
    expect(overdueRatio(friend, NOW)).toBeLessThan(0.2);
    expect(overdueRatio(parent, NOW)).toBeGreaterThan(10);
  });

  it('never logged is treated as overdue, not as fine', () => {
    expect(overdueRatio(person({ lastContactAt: null }), NOW)).toBeGreaterThanOrEqual(3);
  });
});

describe('what it notices, in order of what it costs to miss', () => {
  it('a closing window outranks a longer drift elsewhere', () => {
    const drifting = person({ id: 'r2', name: 'Sanjay', relationType: 'friend', closeness: 6, lastContactAt: ago(200) });
    const closing = person({ id: 'r3', name: 'Appa', relationType: 'father', windowYears: 8, lastContactAt: ago(30) });
    const top = mostWanting([drifting, closing], NOW)!;
    expect(top.rel.name).toBe('Appa');
    expect(top.kind).toBe('window');
  });

  it('their own stated wish outranks plain drift', () => {
    const plain = person({ id: 'a', name: 'Ravi', relationType: 'friend', closeness: 8, lastContactAt: ago(120), desiredCadence: 'monthly' });
    const wished = person({ id: 'b', name: 'Nithya', relationType: 'friend', closeness: 8, lastContactAt: ago(120), desiredCadence: 'monthly', wantsMoreTime: true });
    expect(mostWanting([plain, wished], NOW)!.rel.name).toBe('Nithya');
  });

  it('a close tie with no rhythm at all is worth naming', () => {
    const unfed = person({ name: 'Wei', relationType: 'friend', closeness: 9, lastContactAt: null, desiredCadence: null });
    expect(mostWanting([unfed], NOW)!.kind).toBeTruthy();
  });

  it('says nothing when everyone is on rhythm', () => {
    const ok = [
      person({ id: 'a', name: 'Amma', lastContactAt: ago(3) }),
      person({ id: 'b', name: 'Divya', relationType: 'spouse', desiredCadence: 'daily', lastContactAt: ago(0), closeness: 10 }),
    ];
    expect(mostWanting(ok, NOW)).toBeNull();
    expect(relationshipEngine.run(ctx(ok)).proposals).toHaveLength(0);
  });
});

describe('one person, with their name in it', () => {
  it('produces exactly one observation and one door', () => {
    const out = relationshipEngine.run(ctx([
      person({ id: 'a', name: 'Amma', lastContactAt: ago(90) }),
      person({ id: 'b', name: 'Ravi', relationType: 'friend', lastContactAt: ago(200), closeness: 8 }),
      person({ id: 'c', name: 'Sara', relationType: 'friend', lastContactAt: ago(300), closeness: 7 }),
    ]));
    // Fourteen overdue friendships is a list, and a list is what closes the app.
    expect(out.observations).toHaveLength(1);
    expect(out.proposals).toHaveLength(1);
  });

  it('names the person in both the truth and the door', () => {
    const out = relationshipEngine.run(ctx([person({ lastContactAt: ago(90) })]));
    expect(out.observations[0].statement).toContain('Amma');
    expect(out.proposals[0].action).toContain('Amma');
    expect(out.proposals[0].tinyStep).toContain('Amma');
  });

  it('carries its receipts', () => {
    const out = relationshipEngine.run(ctx([person({ lastContactAt: ago(90), windowYears: 9 })]));
    const sources = out.observations[0].evidence.map((e) => e.source);
    expect(sources).toContain('ContactLog');
    expect(sources).toContain('engine:time');
    // Anything looking forward has to state what it does not know.
    expect(out.observations[0].uncertainty).toBeTruthy();
    expect(out.observations[0].uncertainty!.assumptions.length).toBeGreaterThan(1);
  });

  it('proposes what suits the relationship, not one script', () => {
    const spouse = relationshipEngine.run(ctx([
      person({ name: 'Divya', relationType: 'spouse', closeness: 10, desiredCadence: 'daily', lastContactAt: ago(20) }),
    ]));
    expect(spouse.proposals[0].action).toMatch(/out of the house/);
    const friend = relationshipEngine.run(ctx([
      person({ name: 'Ravi', relationType: 'friend', closeness: 8, desiredCadence: 'monthly', lastContactAt: ago(200) }),
    ]));
    expect(friend.proposals[0].action).toMatch(/Call Ravi/);
  });

  /**
   * "Near" was decided by relation type alone, so a father whose 25-year-old
   * son lives in another city and is seen quarterly was told to "Take Sean
   * out of the house for an hour". Sean is not in the house. Distance vetoes
   * the outing; the relation type only picks it when both are possible.
   */
  it('does not propose an outing to somebody who would need a flight', () => {
    const remote = relationshipEngine.run(ctx([
      person({
        name: 'Sean', relationType: 'child', closeness: 9,
        desiredCadence: 'weekly', lastContactAt: ago(30), locationType: 'different_city',
      }),
    ]));
    expect(remote.proposals[0].action).not.toMatch(/out of the house/);
    expect(remote.proposals[0].action).toMatch(/Call Sean/);

    const abroad = relationshipEngine.run(ctx([
      person({
        name: 'Mira', relationType: 'spouse', closeness: 10,
        desiredCadence: 'daily', lastContactAt: ago(20), locationType: 'abroad',
      }),
    ]));
    expect(abroad.proposals[0].action).toMatch(/Call Mira/);
  });

  it('an unknown address keeps the old behaviour — co-located', () => {
    const unknown = relationshipEngine.run(ctx([
      person({ name: 'Divya', relationType: 'spouse', closeness: 10, desiredCadence: 'daily', lastContactAt: ago(20), locationType: null }),
    ]));
    expect(unknown.proposals[0].action).toMatch(/out of the house/);
  });

  it('a closing window is the one thing not permanently dismissible', () => {
    const out = relationshipEngine.run(ctx([person({ windowYears: 7, lastContactAt: ago(60) })]));
    expect(out.proposals[0].dismissible).toBe(false);
    const drift = relationshipEngine.run(ctx([person({ lastContactAt: ago(90) })]));
    expect(drift.proposals[0].dismissible).toBe(true);
  });
});

describe('the tone rules are not optional', () => {
  it('never scolds, never counts missed calls at anyone', () => {
    const cases = [
      person({ lastContactAt: ago(400) }),
      person({ windowYears: 5, lastContactAt: ago(200) }),
      person({ lastContactAt: null, closeness: 10, desiredCadence: null }),
      person({ wantsMoreTime: true, lastContactAt: ago(180) }),
    ];
    for (const p of cases) {
      const out = relationshipEngine.run(ctx([p]));
      for (const o of out.observations) expect(o.statement).not.toMatch(FORBIDDEN);
      for (const pr of out.proposals) {
        expect(pr.because).not.toMatch(FORBIDDEN);
        expect(pr.action).not.toMatch(FORBIDDEN);
      }
    }
  });

  it('honours a muted topic completely', () => {
    const muted = ctx([person({ lastContactAt: ago(400) })], {
      personalization: {
        insightIntensity: 'gentle',
        motivationStyle: 'balanced',
        declinedTopics: ['relationships'],
      },
    });
    expect(relationshipEngine.run(muted)).toEqual({ observations: [], proposals: [] });
  });

  it('is deterministic — the same life produces the same day', () => {
    const rels = [
      person({ id: 'a', name: 'Amma', lastContactAt: ago(90) }),
      person({ id: 'b', name: 'Ravi', relationType: 'friend', lastContactAt: ago(90), closeness: 9 }),
    ];
    const a = relationshipEngine.run(ctx(rels));
    const b = relationshipEngine.run(ctx([...rels].reverse()));
    expect(a.observations[0].id).toBe(b.observations[0].id);
  });

  it('says nothing at all when there is nobody to say it about', () => {
    expect(relationshipEngine.run(ctx([]))).toEqual({ observations: [], proposals: [] });
  });
});
