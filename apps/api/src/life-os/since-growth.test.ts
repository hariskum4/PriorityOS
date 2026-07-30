/**
 * The one return-pull this product is allowed.
 *
 * A strategy game brings people back by threatening what they will lose:
 * timers, decay, raids while you sleep. Applied to a record of someone's life
 * that is grotesque, and it is also unnecessary — the honest version of the
 * same pull is showing what they built and cannot lose.
 *
 * So the rules these tests hold are as much about restraint as arithmetic.
 * Growth is measured in the currency the drawing is grown from, it is reported
 * as domains rather than tallies, and a gap in which nothing was recorded
 * reports nothing rather than reporting a deficit.
 */
import { describe, it, expect } from 'vitest';
import { LifeTimelineService } from './life-timeline.service';

const DAY = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * DAY);

function fakePrisma(opts: {
  missions?: Array<{ completedAt: Date; domainType: string }>;
  memories?: Array<{ occurredAt: Date; domainType: string }>;
  contacts?: Array<{ occurredAt: Date; relationType: string }>;
} = {}) {
  const inWindow = <T>(rows: T[], at: (r: T) => Date, where: any) => {
    const gte = where?.completedAt?.gte ?? where?.occurredAt?.gte ?? where?.createdAt?.gte;
    return gte ? rows.filter((r) => at(r) >= gte) : rows;
  };
  return {
    user: { findUnique: async () => ({ timezone: 'Asia/Kolkata' }) },
    mission: {
      count: async () => (opts.missions ?? []).length,
      findMany: async ({ where }: any) =>
        inWindow(opts.missions ?? [], (m) => m.completedAt, where)
          .map((m) => ({ ...m, title: 'x' })),
    },
    memory: {
      count: async () => (opts.memories ?? []).length,
      findMany: async ({ where }: any) =>
        inWindow(opts.memories ?? [], (m) => m.occurredAt, where)
          .map((m) => ({ ...m, title: 'x' })),
    },
    contactLog: {
      findMany: async ({ where }: any) =>
        inWindow(opts.contacts ?? [], (c) => c.occurredAt, where).map((c) => ({
          occurredAt: c.occurredAt, kind: 'call', note: null,
          relationship: { name: 'Amma', relationType: c.relationType },
        })),
    },
    habitLog: { findMany: async () => [] },
    journalEntry: { count: async () => 0, findMany: async () => [] },
    relationship: { findMany: async () => [] },
  } as any;
}

const svc = (p: any) => new LifeTimelineService(p);

describe('what grew while you were away', () => {
  it('reports the parts of a life that grew, heaviest first', async () => {
    const p = fakePrisma({
      missions: [{ completedAt: ago(1), domainType: 'career' }],
      memories: [{ occurredAt: ago(1), domainType: 'family' }],
    });
    const out = await svc(p).since('u1', ago(3));

    // family: one kept moment (5). career: one task done (1).
    expect(out.grew.map((g) => g.domain)).toEqual(['family', 'career']);
    expect(out.grew[0].weight).toBeGreaterThan(out.grew[1].weight);
  });

  it('measures growth the way the drawing measures it', async () => {
    // Five errands must not outrank a single kept moment plus a call.
    const p = fakePrisma({
      missions: Array.from({ length: 5 }, () => ({ completedAt: ago(1), domainType: 'career' })),
      memories: [{ occurredAt: ago(1), domainType: 'family' }],
      contacts: [{ occurredAt: ago(1), relationType: 'mother' }],
    });
    const out = await svc(p).since('u1', ago(3));
    const by = Object.fromEntries(out.grew.map((g) => [g.domain, g.weight]));
    expect(by.family).toBe(8);   // memory 5 + contact 3
    expect(by.career).toBe(5);   // five tasks
    expect(out.grew[0].domain).toBe('family');
  });

  it('says nothing at all about a gap in which nothing was recorded', async () => {
    // Never a deficit, never a number in red. Absence is not a debt.
    const out = await svc(fakePrisma()).since('u1', ago(30));
    expect(out.grew).toEqual([]);
  });

  it('counts only the gap, not the life before it', async () => {
    const p = fakePrisma({
      missions: [
        { completedAt: ago(1), domainType: 'career' },
        { completedAt: ago(90), domainType: 'career' },
      ],
    });
    const out = await svc(p).since('u1', ago(3));
    expect(out.grew).toEqual([{ domain: 'career', weight: 1 }]);
  });

  it('includes something recorded moments ago', async () => {
    // The window ends slightly ahead of now, so an act logged during the
    // request itself is not lost to a clock race.
    const p = fakePrisma({ missions: [{ completedAt: new Date(), domainType: 'health' }] });
    const out = await svc(p).since('u1', ago(1));
    expect(out.grew.map((g) => g.domain)).toContain('health');
  });

  it('still reports the plain counts alongside it', async () => {
    const p = fakePrisma({
      missions: [{ completedAt: ago(1), domainType: 'career' }],
      memories: [{ occurredAt: ago(1), domainType: 'family' }],
    });
    const out = await svc(p).since('u1', ago(3));
    expect(out.missionsCompleted).toBe(1);
    expect(out.momentsKept).toBe(1);
    expect(out.days).toBe(3);
  });
});
