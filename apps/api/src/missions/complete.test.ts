/**
 * Pressing Done.
 *
 * Measured on production: 28.5 seconds against a client that gives up at
 * fifteen, so somebody tapped the one thing their day was asking for and
 * watched "Saving…" until it failed — over a mission the server had marked
 * complete in the first second.
 *
 * The completion was never slow. It was twenty-two database round trips in
 * single file, and only the first two are the thing that happened: the row
 * flips, and that is what the reader is owed an answer about. The XP award,
 * the contact log, the twelve-domain rescore, the telemetry and the engine
 * picking the next mission are all consequences, and none of them is read by
 * the screen that is waiting.
 *
 * These tests are about that line — what has to have happened when the
 * response goes, and what merely has to happen. The bookkeeping is asserted
 * too, because "runs behind the response" and "quietly stopped running" look
 * identical from the outside, and that is exactly how a deferred job dies.
 */
import { describe, it, expect, vi } from 'vitest';
import { MissionsService } from './missions.service';

const MISSION = {
  id: 'm1',
  userId: 'u1',
  title: 'Call Amma',
  domainType: 'family',
  relationshipId: 'r1',
  sourceKey: 'family.call',
  status: 'pending',
  completedAt: null,
};

/** Resolves only when told to, so "before the response" is a real question. */
function gate() {
  let release!: () => void;
  const opened = new Promise<void>((r) => { release = r; });
  return { opened, release };
}

function make(over: { rescore?: () => Promise<void> } = {}) {
  const rows = [{ ...MISSION }];
  const calls: string[] = [];

  const prisma = {
    mission: {
      findFirst: async ({ where }: any) =>
        rows.find((m) => m.id === where.id && m.userId === where.userId) ?? null,
      findUniqueOrThrow: async ({ where }: any) => {
        calls.push('mission.findUniqueOrThrow');
        return rows.find((m) => m.id === where.id)!;
      },
      updateMany: async ({ where, data }: any) => {
        const hit = rows.filter((m) => m.id === where.id && m.status !== 'completed');
        hit.forEach((m) => Object.assign(m, data));
        return { count: hit.length };
      },
      findMany: async () => [],
    },
    contactLog: { create: async () => { calls.push('contactLog'); } },
    relationship: { update: async () => { calls.push('relationship.touch'); } },
    lifeDomain: { findFirst: async () => ({ neglectRiskScore: 70 }), findMany: async () => [] },
    goal: { findMany: async () => [] },
  } as any;

  const svc = new MissionsService(
    prisma,
    { recalcUserDomains: vi.fn(over.rescore ?? (async () => { calls.push('rescore'); })) } as any,
    { award: vi.fn(async () => { calls.push('xp'); return { xp: 30 }; }) } as any,
    { track: vi.fn(async () => { calls.push('analytics'); }) } as any,
    { enabled: false, generate: vi.fn() } as any,
    { recalcPriority: vi.fn(async () => { calls.push('recalcPriority'); }) } as any,
  );
  /* The adaptive loop is exercised by its own tests; here it only has to be
     observed running after the reader has gone. */
  (svc as any).ensureNextMission = vi.fn(async () => { calls.push('nextMission'); return null; });

  return { svc, rows, calls };
}

/* Settlement is observable on the service itself — see `whenSettled`. Waiting
   on a timer instead would make these tests pass for the wrong reason on a
   fast machine and flake on a slow one. */

describe('pressing Done', () => {
  it('answers as soon as the row has flipped', async () => {
    const held = gate();
    const { svc, calls } = make({ rescore: async () => { await held.opened; calls.push('rescore'); } });

    const res = await svc.complete('u1', 'm1');

    /* The response is out while the rescore is still blocked, which is the
       whole point: nothing downstream of the tick can hold the screen. */
    expect(res.mission.status).toBe('completed');
    expect(res.mission.completedAt).toBeInstanceOf(Date);
    expect(calls).not.toContain('rescore');
    held.release();
  });

  it('does not read the row back to describe what it just wrote', async () => {
    /* A round trip for two fields this method chose itself. The idempotent
       branch below is the one case that genuinely does not know. */
    const { svc, calls } = make();
    await svc.complete('u1', 'm1');
    await svc.whenSettled();
    expect(calls).not.toContain('mission.findUniqueOrThrow');
  });

  it('records the completion instant, because a kept moment takes its hour', async () => {
    const { svc, rows } = make();
    const before = Date.now();
    const res = await svc.complete('u1', 'm1');
    const stored = rows[0].completedAt as unknown as Date;
    expect(res.mission.completedAt).toEqual(stored);
    expect(stored.getTime()).toBeGreaterThanOrEqual(before);
  });

  it('still does every piece of the bookkeeping, just afterwards', async () => {
    const { svc, calls } = make();
    await svc.complete('u1', 'm1');
    await svc.whenSettled();
    for (const step of [
      'contactLog', 'relationship.touch', 'recalcPriority',
      'xp', 'rescore', 'analytics', 'nextMission',
    ]) {
      expect(calls, `${step} never ran`).toContain(step);
    }
  });

  it('rescores before choosing what comes next', async () => {
    /* The adaptive loop reads the refreshed life-graph. Deferring the chain
       must not reorder it. */
    const { svc, calls } = make();
    await svc.complete('u1', 'm1');
    await svc.whenSettled();
    expect(calls.indexOf('rescore')).toBeLessThan(calls.indexOf('nextMission'));
  });

  it('awards nothing twice when the button is tapped twice', async () => {
    const { svc, calls } = make();
    await svc.complete('u1', 'm1');
    const second = await svc.complete('u1', 'm1');
    await svc.whenSettled();
    expect(second.completed).toBe(false);
    expect(second.mission.status).toBe('completed');
    expect(calls.filter((c) => c === 'xp')).toHaveLength(1);
    expect(calls.filter((c) => c === 'contactLog')).toHaveLength(1);
    /* And the second tap is the one branch that reads the row, because it is
       the branch that did not write it. */
    expect(calls).toContain('mission.findUniqueOrThrow');
  });

  it('lets the reader keep their tick when the bookkeeping falls over', async () => {
    /* The record is the completion. A rescore that throws must not turn a
       finished thing into an error on somebody's screen. */
    const { svc } = make({ rescore: async () => { throw new Error('db gone'); } });
    const res = await svc.complete('u1', 'm1');
    await svc.whenSettled();
    expect(res.mission.status).toBe('completed');
  });
});
