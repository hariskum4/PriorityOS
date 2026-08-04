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
import { validateSync } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { HabitsService } from './habits.service';
import { SetHabitScheduleDto } from './habits.dto';

const DAY = 86_400_000;

function make(habits: Array<Record<string, any>>, logs: Array<Record<string, any>> = []) {
  const updates: Array<{ id: string; data: any }> = [];
  const startOfToday = new Date(new Date().setHours(0, 0, 0, 0));
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
    habitLog: {
      findMany: async ({ where }: any) => logs
        .filter((l) => (
          (where.habitId?.in ?? [l.habitId]).includes(l.habitId)
          && (!where.completedAt?.gte || l.completedAt >= where.completedAt.gte)
        ))
        .sort((a, b) => b.completedAt - a.completedAt)
        .map((l) => ({ habitId: l.habitId, completedAt: l.completedAt })),
      findFirst: async ({ where }: any) => logs.find((l) => (
        l.habitId === where.habitId && l.completedAt >= where.completedAt.gte
      )) ?? null,
      count: async ({ where }: any) => logs.filter((l) => (
        l.habitId === where.habitId && l.completedAt >= where.completedAt.gte
      )).length,
      create: async ({ data }: any) => {
        const row = { id: `l${logs.length + 1}`, completedAt: new Date(), ...data };
        logs.push(row);
        return row;
      },
      update: async ({ where, data }: any) => {
        const l = logs.find((x) => x.id === where.id)!;
        Object.assign(l, data);
        return l;
      },
      deleteMany: async ({ where }: any) => {
        const keep = logs.filter((l) => !(
          l.habitId === where.habitId && l.completedAt >= where.completedAt.gte
        ));
        const removed = logs.length - keep.length;
        logs.length = 0;
        logs.push(...keep);
        return { count: removed };
      },
    },
  };
  const clock = {
    daysAgo: async () => new Date(Date.now() - 28 * DAY),
    startOfWeek: async () => new Date(Date.now() - 3 * DAY),
    startOfToday: async () => startOfToday,
  };
  const award = vi.fn();
  const svc = new HabitsService(
    prisma as any,
    { recalcUserDomains: vi.fn() } as any,
    { award } as any,
    clock as any,
  );
  return { svc, updates, logs, award };
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

/**
 * The day is the unit.
 *
 * `complete` had no guard at all: six calls in the same second wrote six logs
 * and awarded 60 XP, and `perWeek` — the figure the healthspan card reads to
 * decide whether a lever is kept — reported 1.5 off the back of it. Nobody had
 * to be dishonest for this to fire, either: mutations run offlineFirst with
 * three retries, so one tap on a bad connection could write three.
 */
describe('checking a rhythm off', () => {
  const twice = { id: 'h1', userId: 'u1', title: 'Strength training twice a week', isActive: true, domainType: 'health', targetPerWeek: 2, streakCurrent: 0 };

  it('writes one log however many times it is tapped', async () => {
    const { svc, logs, award } = make([{ ...twice }]);
    for (let i = 0; i < 6; i++) await svc.complete('u1', 'h1');
    expect(logs).toHaveLength(1);
    expect(award).toHaveBeenCalledOnce();
  });

  it('says plainly that today was already counted', async () => {
    const { svc } = make([{ ...twice }]);
    const first = await svc.complete('u1', 'h1') as any;
    const second = await svc.complete('u1', 'h1') as any;
    expect(first.alreadyToday).toBe(false);
    expect(second.alreadyToday).toBe(true);
    expect(second.xp).toBeNull();
  });

  it('reports the week against the target, not a boolean', async () => {
    const { svc } = make([{ ...twice }]);
    const r = await svc.complete('u1', 'h1') as any;
    // Half of a twice-a-week commitment is not a finished one.
    expect(r.doneThisWeek).toBe(1);
    expect(r.targetPerWeek).toBe(2);
  });

  it('keeps a note added after the tick, without double-counting the day', async () => {
    const { svc, logs } = make([{ ...twice }]);
    await svc.complete('u1', 'h1');
    await svc.complete('u1', 'h1', '  5x5 squats, 60kg  ');
    expect(logs).toHaveLength(1);
    expect(logs[0].note).toBe('5x5 squats, 60kg');
  });

  it('stores a note trimmed, and blank as nothing', async () => {
    const { svc, logs } = make([{ ...twice }]);
    await svc.complete('u1', 'h1', '   ');
    expect(logs[0].note).toBeNull();
  });

  it('unticks today and lets the day be counted again', async () => {
    const { svc, logs } = make([{ ...twice }]);
    await svc.complete('u1', 'h1');
    expect(logs).toHaveLength(1);
    const undone = await svc.uncomplete('u1', 'h1') as any;
    expect(logs).toHaveLength(0);
    expect(undone.doneThisWeek).toBe(0);
    await svc.complete('u1', 'h1');
    expect(logs).toHaveLength(1);
  });

  it('unticking leaves earlier days alone', async () => {
    const yesterday = { id: 'old', habitId: 'h1', completedAt: new Date(Date.now() - DAY), note: null };
    const { svc, logs } = make([{ ...twice }], [yesterday]);
    await svc.complete('u1', 'h1');
    expect(logs).toHaveLength(2);
    await svc.uncomplete('u1', 'h1');
    expect(logs).toEqual([yesterday]);
  });

  it("refuses to tick someone else's rhythm", async () => {
    const { svc, logs } = make([{ ...twice }]);
    await expect(svc.complete('someone-else', 'h1')).rejects.toThrow(NotFoundException);
    await expect(svc.uncomplete('someone-else', 'h1')).rejects.toThrow(NotFoundException);
    expect(logs).toHaveLength(0);
  });
});

/**
 * When a rhythm runs, kept with the account.
 *
 * These answers lived in device storage first, so the walk somebody set to
 * Tuesday on a phone was still on the engine's guess on their laptop. The
 * two halves move independently, and clearing one is a real instruction —
 * not the same as saying nothing about it.
 */
describe('the schedule a reader sets themselves', () => {
  it('stores chosen days, sorted and without repeats', async () => {
    const { svc } = make([{ ...active }]);
    const out = await svc.setSchedule('u1', 'h1', { plannedDays: [5, 1, 5] });
    expect(out.plannedDays).toEqual([1, 5]);
  });

  it('stores an hour as minutes from midnight', async () => {
    const { svc } = make([{ ...active }]);
    const out = await svc.setSchedule('u1', 'h1', { plannedMinute: 435 });
    expect(out.plannedMinute).toBe(435);
  });

  it('moves each half without disturbing the other', async () => {
    const { svc } = make([{ ...active }]);
    await svc.setSchedule('u1', 'h1', { plannedDays: [2], plannedMinute: 420 });
    const out = await svc.setSchedule('u1', 'h1', { plannedMinute: 1140 });
    expect(out.plannedDays).toEqual([2]);
    expect(out.plannedMinute).toBe(1140);
  });

  /**
   * The same claim, made against the object the controller really passes.
   *
   * A DTO from class-transformer carries every declared property, so a
   * request naming only the hour still has a `plannedDays` key holding
   * undefined. Asserted with a plain literal the test above passes while
   * the wire wipes the days — which is exactly what it did.
   */
  it('leaves the days alone when the request only named the hour', async () => {
    const { svc } = make([{ ...active }]);
    await svc.setSchedule('u1', 'h1', { plannedDays: [2], plannedMinute: 420 });
    const asControllerSends = plainToInstance(SetHabitScheduleDto, { plannedMinute: 1140 });
    expect('plannedDays' in asControllerSends).toBe(true); // the trap itself
    const out = await svc.setSchedule('u1', 'h1', asControllerSends);
    expect(out.plannedDays).toEqual([2]);
    expect(out.plannedMinute).toBe(1140);
  });

  it('clears an answer when told to, rather than ignoring it', async () => {
    const { svc } = make([{ ...active }]);
    await svc.setSchedule('u1', 'h1', { plannedDays: [2], plannedMinute: 420 });
    const out = await svc.setSchedule('u1', 'h1', { plannedDays: null, plannedMinute: null });
    expect(out.plannedDays).toBeNull();
    expect(out.plannedMinute).toBeNull();
  });

  it('treats an emptied week as no answer, never as a week with no days', async () => {
    // Stored as [] it would read to the due check as "no planned days left",
    // which offers the rhythm every day — the opposite of clearing it.
    const { svc } = make([{ ...active }]);
    const out = await svc.setSchedule('u1', 'h1', { plannedDays: [] });
    expect(out.plannedDays).toBeNull();
  });

  it("refuses to reschedule someone else's rhythm", async () => {
    const { svc, updates } = make([{ ...active }]);
    await expect(svc.setSchedule('someone-else', 'h1', { plannedMinute: 60 }))
      .rejects.toThrow(NotFoundException);
    expect(updates).toHaveLength(0);
  });
});

describe('the schedule request is checked at the door', () => {
  const check = (body: Record<string, unknown>) =>
    validateSync(plainToInstance(SetHabitScheduleDto, body));

  it('accepts a real week and a real minute', () => {
    expect(check({ plannedDays: [0, 6], plannedMinute: 1439 })).toHaveLength(0);
    expect(check({})).toHaveLength(0);
  });

  it('rejects a day that is not a day', () => {
    expect(check({ plannedDays: [7] }).length).toBeGreaterThan(0);
    expect(check({ plannedDays: [-1] }).length).toBeGreaterThan(0);
  });

  it('rejects an hour outside the day', () => {
    expect(check({ plannedMinute: 1440 }).length).toBeGreaterThan(0);
    expect(check({ plannedMinute: -1 }).length).toBeGreaterThan(0);
  });

  it('rejects a week longer than a week', () => {
    expect(check({ plannedDays: [0, 1, 2, 3, 4, 5, 6, 0] }).length).toBeGreaterThan(0);
  });
});
