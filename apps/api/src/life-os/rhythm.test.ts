/**
 * How often a life is actually lived, per part of it.
 *
 * The sky's orbits are drawn from this number, so a wrong estimator does not
 * produce a wrong statistic — it produces a moving picture that lies. Two
 * claims are held here, and both were found by drawing the thing rather than
 * by reasoning about it.
 *
 * The first: median gap between acts is the obvious estimator and it is wrong.
 * On the profile that prompted this, thirty-four family acts sat in a handful
 * of afternoons and the median gap reported a rhythm of zero days. People log
 * in bursts. Rate over a window asks how often this happens per year, which is
 * the question, and bursts do not fool it.
 *
 * The second: a rhythm claimed from one act is not a rhythm. Below the floor
 * the answer is null and the caller decides — because a sky orbiting on a
 * single data point is a confident drawing of nothing.
 */
import { describe, it, expect } from 'vitest';
import { LifeTimelineService } from './life-timeline.service';

const DAY = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * DAY);

function fakePrisma(opts: {
  missions?: Array<{ completedAt: Date; domainType: string; title?: string }>;
  memories?: Array<{ occurredAt: Date; domainType: string; title?: string }>;
  contacts?: Array<{ occurredAt: Date; relationType: string; name?: string }>;
} = {}) {
  return {
    user: { findUnique: async () => ({ timezone: 'Asia/Kolkata' }) },
    mission: {
      findMany: async () => (opts.missions ?? []).map((m) => ({ title: 'Did a thing', ...m })),
    },
    memory: {
      findMany: async () => (opts.memories ?? []).map((m) => ({ title: 'A moment', ...m })),
    },
    contactLog: {
      findMany: async () => (opts.contacts ?? []).map((c) => ({
        occurredAt: c.occurredAt, kind: 'call', note: null,
        relationship: { name: c.name ?? 'Amma', relationType: c.relationType },
      })),
    },
    habitLog: { findMany: async () => [] },
    journalEntry: { findMany: async () => [] },
  } as any;
}

const svc = (p: any) => new LifeTimelineService(p);
const burst = (n: number, day: number, domainType: string) =>
  Array.from({ length: n }, () => ({ completedAt: ago(day), domainType }));

describe('the rhythm of a life', () => {
  it('is not fooled by everything being logged on one afternoon', async () => {
    // Twelve acts, all the same day. A median gap would call this continuous.
    // Twelve in 120 days is a ten-day rhythm, and that is the truth of it.
    const p = fakePrisma({ missions: burst(12, 3, 'family') });
    const { domains } = await svc(p).rhythm('u1');
    expect(domains.family.period).toBe(10);
  });

  it('reports a faster rhythm for a domain touched more often', async () => {
    const p = fakePrisma({
      missions: [
        ...Array.from({ length: 40 }, (_, i) => ({ completedAt: ago(i * 3), domainType: 'health' })),
        ...Array.from({ length: 4 }, (_, i) => ({ completedAt: ago(i * 25), domainType: 'purpose' })),
      ],
    });
    const { domains } = await svc(p).rhythm('u1');
    expect(domains.health.period).toBeLessThan(domains.purpose.period!);
  });

  it('says nothing rather than guessing from a single act', async () => {
    // One thing that happened is an event. Calling it a cadence would have the
    // sky orbiting on one data point.
    const p = fakePrisma({ missions: [{ completedAt: ago(5), domainType: 'purpose' }] });
    const { domains } = await svc(p).rhythm('u1');
    expect(domains.purpose.period).toBeNull();
    expect(domains.purpose.total).toBe(1);
  });

  it('forgets a cadence that was dropped months ago', async () => {
    // Daily for a while, then silence since. The window must not keep
    // reporting the old rhythm as if it were current.
    const p = fakePrisma({
      missions: Array.from({ length: 30 }, (_, i) => ({
        completedAt: ago(200 + i), domainType: 'career',
      })),
    });
    const { domains } = await svc(p).rhythm('u1');
    expect(domains.career.period).toBeNull();
    expect(domains.career.recent).toBe(0);
    expect(domains.career.total).toBe(30);   // still on the record, never erased
  });

  it('keeps every period inside what a life can honestly be', async () => {
    // 400 acts in the window is faster than daily; the floor holds it to daily.
    const p = fakePrisma({ missions: burst(400, 2, 'health') });
    const { domains } = await svc(p).rhythm('u1');
    expect(domains.health.period).toBeGreaterThanOrEqual(1);
    expect(domains.health.period).toBeLessThanOrEqual(180);
  });

  it('hands back what is in a domain, newest first and capped', async () => {
    const p = fakePrisma({
      missions: Array.from({ length: 9 }, (_, i) => ({
        completedAt: ago(i + 1), domainType: 'family', title: `Thing ${i}`,
      })),
      memories: [{ occurredAt: ago(2), domainType: 'family', title: 'Diwali at home' }],
    });
    const { domains } = await svc(p).rhythm('u1');
    const mission = domains.family.kinds.find((k) => k.kind === 'mission')!;

    expect(mission.count).toBe(9);          // the true count is never lost
    expect(mission.items).toHaveLength(6);  // but the sky is sent a shape
    expect(mission.items[0].label).toBe('Thing 0');
    expect(new Date(mission.items[0].at) > new Date(mission.items[1].at)).toBe(true);
  });

  it('leads with what a life is least able to repeat', async () => {
    // Same ordering the drawing is weighted by: a kept moment outranks errands.
    const p = fakePrisma({
      missions: burst(20, 4, 'family'),
      memories: [{ occurredAt: ago(4), domainType: 'family' }],
      contacts: [{ occurredAt: ago(4), relationType: 'mother' }],
    });
    const { domains } = await svc(p).rhythm('u1');
    expect(domains.family.kinds.map((k) => k.kind)).toEqual(['memory', 'contact', 'mission']);
  });

  it('says nothing at all about a life with nothing in it', async () => {
    const { domains, window } = await svc(fakePrisma()).rhythm('u1');
    expect(domains).toEqual({});
    expect(window).toBe(120);
  });
});
