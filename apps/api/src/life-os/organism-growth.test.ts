/**
 * What the organism is grown from, and when.
 *
 * Two claims worth holding down.
 *
 * The first is a value judgement, and it should be argued with in the open:
 * the drawing leans toward what cannot be repeated or rushed. Counting every
 * act alike made it a monument to box-ticking — on the profile that prompted
 * this, nine of every ten acts were completed missions, so a life of two
 * hundred errands and no people would have drawn a magnificent organism.
 *
 * The second is plain arithmetic: asked for a year, it must show only the life
 * lived up to the end of that year, in the person's own calendar. A drawing
 * that quietly included next year's acts would make growth unreadable.
 */
import { describe, it, expect } from 'vitest';
import { LifeTimelineService } from './life-timeline.service';

const at = (iso: string) => new Date(iso);

function fakePrisma(opts: {
  timezone?: string;
  missions?: Array<{ completedAt: Date; domainType: string }>;
  memories?: Array<{ occurredAt: Date; domainType: string }>;
  contacts?: Array<{ occurredAt: Date; relationType: string }>;
  journal?: Array<{ createdAt: Date; domainTags: string[] }>;
} = {}) {
  return {
    user: { findUnique: async () => ({ timezone: opts.timezone ?? 'Asia/Kolkata' }) },
    mission: {
      findMany: async () => (opts.missions ?? []).map((m) => ({ ...m, title: 'x' })),
    },
    memory: {
      findMany: async () => (opts.memories ?? []).map((m) => ({ ...m, title: 'x' })),
    },
    contactLog: {
      findMany: async () => (opts.contacts ?? []).map((c) => ({
        occurredAt: c.occurredAt, kind: 'call', note: null,
        relationship: { name: 'Someone', relationType: c.relationType },
      })),
    },
    habitLog: { findMany: async () => [] },
    journalEntry: {
      findMany: async () => (opts.journal ?? []).map((j) => ({
        createdAt: j.createdAt, domainTags: j.domainTags, whatMattered: 'x',
      })),
    },
  } as any;
}

const svc = (p: any) => new LifeTimelineService(p);

describe('what the drawing is grown from', () => {
  it('does not let errands outweigh a life', async () => {
    // Ten ticked tasks in health against two kept moments in family. Counted
    // one apiece, health would be five times family; it must not be.
    const p = fakePrisma({
      missions: Array.from({ length: 10 }, () => ({ completedAt: at('2026-03-01T09:00:00Z'), domainType: 'health' })),
      memories: [
        { occurredAt: at('2026-03-02T09:00:00Z'), domainType: 'family' },
        { occurredAt: at('2026-03-03T09:00:00Z'), domainType: 'family' },
      ],
    });
    const t = await svc(p).actTotalsByDomain('u1');
    expect(t.health).toBe(10);  // 10 missions × 1
    expect(t.family).toBe(10);  // 2 memories × 5
    expect(t.family).toBe(t.health);
  });

  it('values time with a person above a box ticked', async () => {
    const p = fakePrisma({
      contacts: [{ occurredAt: at('2026-03-01T09:00:00Z'), relationType: 'mother' }],
      missions: [{ completedAt: at('2026-03-01T09:00:00Z'), domainType: 'career' }],
    });
    const t = await svc(p).actTotalsByDomain('u1');
    expect(t.family).toBeGreaterThan(t.career);
  });

  it('counts an errand as something, never as nothing', async () => {
    const p = fakePrisma({
      missions: [{ completedAt: at('2026-03-01T09:00:00Z'), domainType: 'career' }],
    });
    const t = await svc(p).actTotalsByDomain('u1');
    expect(t.career).toBeGreaterThan(0);
  });

  it('shows only the life lived up to the year asked for', async () => {
    const p = fakePrisma({
      missions: [
        { completedAt: at('2024-06-01T09:00:00Z'), domainType: 'health' },
        { completedAt: at('2025-06-01T09:00:00Z'), domainType: 'health' },
        { completedAt: at('2026-06-01T09:00:00Z'), domainType: 'health' },
      ],
    });
    expect((await svc(p).actTotalsByDomain('u1', 2024)).health).toBe(1);
    expect((await svc(p).actTotalsByDomain('u1', 2025)).health).toBe(2);
    expect((await svc(p).actTotalsByDomain('u1', 2026)).health).toBe(3);
    expect((await svc(p).actTotalsByDomain('u1')).health).toBe(3);
  });

  it('only ever grows as the years pass', async () => {
    // A drawing that could shrink would be telling someone they had lost
    // something they had actually lived. It accumulates, always.
    const p = fakePrisma({
      missions: [
        { completedAt: at('2024-06-01T09:00:00Z'), domainType: 'health' },
        { completedAt: at('2026-06-01T09:00:00Z'), domainType: 'career' },
      ],
      memories: [{ occurredAt: at('2025-06-01T09:00:00Z'), domainType: 'family' }],
    });
    const s = svc(p);
    let last = -1;
    for (const y of [2024, 2025, 2026]) {
      const total = Object.values(await s.actTotalsByDomain('u1', y))
        .reduce((a, b) => a + b, 0);
      expect(total).toBeGreaterThanOrEqual(last);
      last = total;
    }
  });

  it('draws the year the person lived, not the year UTC saw', async () => {
    // 00:30 IST on 1 January 2026 is 19:00 UTC on 31 December 2025. Asking for
    // 2025 must not include it; asking for 2026 must.
    const p = fakePrisma({
      missions: [{ completedAt: at('2025-12-31T19:00:00Z'), domainType: 'health' }],
    });
    expect((await svc(p).actTotalsByDomain('u1', 2025)).health).toBeUndefined();
    expect((await svc(p).actTotalsByDomain('u1', 2026)).health).toBe(1);
  });

  it('offers a frame for every year on record', async () => {
    const p = fakePrisma({
      missions: [
        { completedAt: at('2024-06-01T09:00:00Z'), domainType: 'health' },
        { completedAt: at('2026-06-01T09:00:00Z'), domainType: 'health' },
      ],
    });
    expect(await svc(p).actYears('u1')).toEqual([2024, 2026]);
  });
});
