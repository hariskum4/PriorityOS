/**
 * The lived side of a countable ritual.
 *
 * `countsSummary` used to be a bare groupBy returning a number per key, which
 * is exactly why the Time tab could print "~150 more treks at your current
 * pace" over an archive holding zero treks — a count alone cannot contradict
 * a pace, and a pace nobody has verified is a constant wearing a person's
 * name. It now carries when, and with whom.
 */
import { describe, it, expect } from 'vitest';
import { MemoriesService } from './memories.service';

const at = (iso: string) => new Date(iso);

function svc(opts: {
  memories?: Array<Record<string, any>>;
  answers?: Array<{ key: string; value: any }>;
} = {}) {
  const memories = opts.memories ?? [];
  const updates: Array<{ where: any; data: any }> = [];
  const prisma = {
    memory: {
      findMany: async ({ where, orderBy }: any) => {
        let rows = memories.filter((m) => (
          m.userId === where.userId
          && (where.countKey?.not === null ? m.countKey != null : true)
          && (where.countKey === null ? m.countKey == null : true)
        ));
        if (orderBy?.occurredAt === 'asc') {
          rows = [...rows].sort((a, b) => a.occurredAt - b.occurredAt);
        } else if (orderBy?.occurredAt === 'desc') {
          rows = [...rows].sort((a, b) => b.occurredAt - a.occurredAt);
        }
        return rows;
      },
      updateMany: async ({ where, data }: any) => {
        updates.push({ where, data });
        const hit = memories.filter((m) => (
          m.userId === where.userId && m.countKey == null && where.id.in.includes(m.id)
        ));
        for (const m of hit) m.countKey = data.countKey;
        return { count: hit.length };
      },
    },
    onboardingAnswer: {
      findMany: async () => (opts.answers ?? []).map((a) => ({ ...a, section: 'counts' })),
    },
  };
  return {
    service: new MemoriesService(prisma as any, { award: async () => 0 } as any),
    updates,
    memories,
  };
}

const diwali = (n: number, people: string[] = []) => ({
  id: `d${n}`, userId: 'u1', countKey: 'diwali_home', title: 'Diwali at home',
  occurredAt: at(`202${n}-11-04T00:00:00.000Z`), peoplePresent: people,
});

describe('what the archive knows about a ritual', () => {
  it('reports how many, and the window they span', async () => {
    const { service } = svc({ memories: [diwali(2), diwali(4), diwali(6)] });
    const s = await service.countsSummary('u1');
    expect(s.diwali_home.count).toBe(3);
    expect(s.diwali_home.firstAt).toBe('2022-11-04T00:00:00.000Z');
    expect(s.diwali_home.lastAt).toBe('2026-11-04T00:00:00.000Z');
  });

  it('surfaces who the ritual is actually with', async () => {
    /** The fact the tile was discarding entirely. */
    const { service } = svc({
      memories: [diwali(2, ['Amma', 'Appa']), diwali(4, ['Amma'])],
    });
    const s = await service.countsSummary('u1');
    expect(s.diwali_home.people).toEqual(['Amma', 'Appa']); // most present first
  });

  it('ignores junk in the people list rather than rendering it', async () => {
    const { service } = svc({ memories: [diwali(2, ['Amma', '   ', null as any, 7 as any])] });
    const s = await service.countsSummary('u1');
    expect(s.diwali_home.people).toEqual(['Amma']);
  });

  it('says nothing about a ritual with nothing logged', async () => {
    const { service } = svc({ memories: [] });
    expect(await service.countsSummary('u1')).toEqual({});
  });
});

describe('archive moments that were never counted', () => {
  const untagged = (id: string, title: string) => ({
    id, userId: 'u1', countKey: null, title,
    occurredAt: at('2026-07-30T00:00:00.000Z'), peoplePresent: [],
  });

  it('recognises a moment written in different words', async () => {
    const { service } = svc({
      memories: [untagged('m1', 'Went to trek')],
      answers: [{ key: 'trek', value: { label: 'treks', perYear: 2 } }],
    });
    const c = await service.countCandidates('u1');
    expect(c.trek.map((m: any) => m.id)).toEqual(['m1']);
  });

  it('does not answer one ritual with another that merely shares a word', async () => {
    const { service } = svc({
      memories: [untagged('m1', 'Dinner with Arjun')],
      answers: [{ key: 'dinner_amma', value: { label: 'dinner with Amma', perYear: 4 } }],
    });
    expect(await service.countCandidates('u1')).toEqual({});
  });

  it('never offers a moment that is already counted', async () => {
    const { service } = svc({
      memories: [diwali(4)],
      answers: [{ key: 'diwali_home', value: { label: 'Diwalis at home', perYear: 1 } }],
    });
    expect(await service.countCandidates('u1')).toEqual({});
  });

  it('folds in only what was chosen, and only what is untagged', async () => {
    const { service, memories } = svc({
      memories: [untagged('m1', 'Went to trek'), untagged('m2', 'Went to trek'), diwali(4)],
    });
    const r = await service.attachToCount('u1', 'trek', ['m1', 'd4', 'nonexistent']);
    expect(r.attached).toBe(1);
    expect(memories.find((m) => m.id === 'm1')!.countKey).toBe('trek');
    expect(memories.find((m) => m.id === 'm2')!.countKey).toBeNull();
    // Already counted elsewhere: never re-filed by a stale id or a retry.
    expect(memories.find((m) => m.id === 'd4')!.countKey).toBe('diwali_home');
  });

  it('finds what someone keeps doing and nothing is counting', async () => {
    const { service } = svc({
      memories: [
        untagged('m1', 'Went to trek up Skandagiri'),
        untagged('m2', 'Sunrise trek with Arjun'),
        untagged('m3', 'Graduation day'),
      ],
      answers: [],
    });
    const t = await service.archiveThemes('u1');
    expect(t.map((x: any) => x.label)).toContain('treks');
    // Once is a thing that happened, not a ritual.
    expect(t.some((x: any) => x.label === 'graduations')).toBe(false);
  });

  it('binds a theme to whoever keeps being there', async () => {
    const { service } = svc({
      memories: [
        { ...untagged('m1', 'Sunrise trek'), peoplePresent: ['Arjun'] },
        { ...untagged('m2', 'Long trek'), peoplePresent: ['Arjun', 'Priya'] },
      ],
    });
    const [trek] = await service.archiveThemes('u1');
    expect(trek.people[0]).toBe('Arjun');
  });

  it('does not suggest what is already being counted', async () => {
    const { service } = svc({
      memories: [untagged('m1', 'Sunrise trek'), untagged('m2', 'Long trek')],
      answers: [{ key: 'trek', value: { label: 'treks', perYear: 2 } }],
    });
    expect(await service.archiveThemes('u1')).toEqual([]);
  });

  it('does nothing at all on an empty or malformed request', async () => {
    const { service, updates } = svc({ memories: [untagged('m1', 'Went to trek')] });
    expect(await service.attachToCount('u1', 'trek', [])).toEqual({ attached: 0 });
    expect(await service.attachToCount('u1', '', ['m1'])).toEqual({ attached: 0 });
    expect(updates).toHaveLength(0);
  });
});
