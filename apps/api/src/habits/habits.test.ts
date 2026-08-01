/**
 * Ending a rhythm.
 *
 * For most of this app's life there was no way to. `isActive` existed on the
 * model and was read in three places and written in none, which was survivable
 * while exactly four habits could ever exist — all health, all created by one
 * button. Now every domain can offer one, so someone will be carrying ten by
 * March and will need to end a few.
 *
 * The verb matters. A rhythm kept for six months and no longer needed is not a
 * mistake to be undone: the logs, the streak and the XP already awarded all
 * stay, and the app simply stops asking. Deleting it would erase the evidence
 * that the person did the thing, which is the opposite of what this app is for.
 */
import { describe, it, expect, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { HabitsService } from './habits.service';

const DAY = 86_400_000;

function make(habits: Array<Record<string, any>>) {
  const updates: Array<{ id: string; data: any }> = [];
  const prisma = {
    habit: {
      findFirst: async ({ where }: any) =>
        habits.find((h) => h.id === where.id && h.userId === where.userId) ?? null,
      findMany: async ({ where }: any) => habits.filter((h) => (
        h.userId === where.userId
        && (where.isActive === undefined || h.isActive === where.isActive)
      )).map((h) => ({ ...h, logs: [], _count: { logs: h.recent ?? 0 } })),
      update: async ({ where, data }: any) => {
        updates.push({ id: where.id, data });
        const h = habits.find((x) => x.id === where.id)!;
        Object.assign(h, data);
        return h;
      },
    },
  };
  const clock = {
    daysAgo: async () => new Date(Date.now() - 28 * DAY),
    startOfWeek: async () => new Date(Date.now() - 3 * DAY),
  };
  const svc = new HabitsService(
    prisma as any,
    { recalcUserDomains: vi.fn() } as any,
    { award: vi.fn() } as any,
    clock as any,
  );
  return { svc, updates };
}

const active = { id: 'h1', userId: 'u1', title: 'Weekly money review', isActive: true, streakCurrent: 9 };
const retired = { id: 'h2', userId: 'u1', title: 'Thirty minutes a day', isActive: false, streakCurrent: 4 };

describe('retiring a rhythm', () => {
  it('stops it being asked for without deleting anything', async () => {
    const { svc, updates } = make([{ ...active }]);
    await svc.retire('u1', 'h1');
    expect(updates).toEqual([{ id: 'h1', data: { isActive: false } }]);
  });

  it('keeps the streak, because the person really did keep it', async () => {
    const habits = [{ ...active }];
    const { svc } = make(habits);
    await svc.retire('u1', 'h1');
    expect(habits[0].streakCurrent).toBe(9);
  });

  it('can be picked back up', async () => {
    const habits = [{ ...retired }];
    const { svc } = make(habits);
    await svc.restore('u1', 'h2');
    expect(habits[0].isActive).toBe(true);
    expect(habits[0].streakCurrent).toBe(4);
  });

  it('refuses to touch someone else\'s rhythm', async () => {
    const { svc, updates } = make([{ ...active }]);
    await expect(svc.retire('someone-else', 'h1')).rejects.toThrow(NotFoundException);
    await expect(svc.restore('someone-else', 'h1')).rejects.toThrow(NotFoundException);
    expect(updates).toHaveLength(0);
  });
});

describe('which rhythms get listed', () => {
  it('shows only the live ones by default — that is what a day screen ticks', async () => {
    const { svc } = make([{ ...active }, { ...retired }]);
    const list = await svc.list('u1');
    expect(list.map((h: any) => h.id)).toEqual(['h1']);
  });

  it('includes the ended ones when asked, so they are never re-offered', async () => {
    /**
     * The suggestion surfaces read this. A rung someone took up and later
     * ended must not be handed back the next morning as if it never happened.
     */
    const { svc } = make([{ ...active }, { ...retired }]);
    const list = await svc.list('u1', true);
    expect(list.map((h: any) => h.id).sort()).toEqual(['h1', 'h2']);
    expect(list.find((h: any) => h.id === 'h2')?.isActive).toBe(false);
  });

  it('still reports the four-week rate alongside the week', async () => {
    const { svc } = make([{ ...active, recent: 12 }]);
    const [h] = await svc.list('u1') as any[];
    expect(h.rateWindowDays).toBe(28);
    expect(h.perWeek).toBe(3);
  });
});
