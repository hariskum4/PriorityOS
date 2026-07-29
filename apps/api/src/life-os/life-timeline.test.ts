/**
 * Which square an act lands on.
 *
 * Caught in use, not in review: a dozen missions completed at 01:20 on a
 * Thursday in Bengaluru all appeared under Wednesday, because 01:20 IST is
 * 19:50 UTC the day before. The grid was bucketing by UTC, which is nobody's
 * calendar, and `dayKeyIn` had existed for months without this file calling it.
 *
 * These tests are worth their weight because the failure is invisible from a
 * screen — a wrongly filed act looks exactly like a correctly filed one — and
 * permanent, in a record meant to be read decades from now.
 */
import { describe, it, expect } from 'vitest';
import { LifeTimelineService } from './life-timeline.service';

/** Only the reads `gather` actually makes, and only the fields it selects. */
function fakePrisma(opts: {
  timezone: string;
  missions?: Array<{ completedAt: Date; domainType: string; title: string }>;
}) {
  const none = { findMany: async () => [] };
  return {
    user: { findUnique: async () => ({ timezone: opts.timezone }) },
    mission: {
      findMany: async ({ where }: any) => (opts.missions ?? []).filter((m) => {
        const w = where?.completedAt;
        if (!w || !w.gte) return true;
        return m.completedAt >= w.gte && m.completedAt < w.lt;
      }),
    },
    contactLog: none,
    memory: none,
    habitLog: none,
    journalEntry: none,
  } as any;
}

const service = (prisma: any) => new LifeTimelineService(prisma);

const mission = (iso: string, domainType = 'health', title = 'A thing') => ({
  completedAt: new Date(iso),
  domainType,
  title,
});

describe('timeline day bucketing', () => {
  it('files an act under the day the person was living, not the server', async () => {
    // 01:20 on Thursday 30 July in Bengaluru. UTC calls it Wednesday the 29th.
    const at = '2026-07-29T19:50:00Z';
    const svc = service(fakePrisma({ timezone: 'Asia/Kolkata', missions: [mission(at)] }));

    const year = await svc.year('u1', 2026);
    const lit = year.days.filter((d) => d.total > 0).map((d) => d.date);
    expect(lit).toEqual(['2026-07-30']);
  });

  it('does not push an American evening into tomorrow', async () => {
    // 20:00 on 29 July in New York is 00:00 UTC on the 30th. The mirror of the
    // bug above, and the larger window: five hours of every evening.
    const svc = service(fakePrisma({
      timezone: 'America/New_York',
      missions: [mission('2026-07-30T00:00:00Z')],
    }));

    const year = await svc.year('u1', 2026);
    expect(year.days.filter((d) => d.total > 0).map((d) => d.date)).toEqual(['2026-07-29']);
  });

  it('keeps a year exactly as long as the calendar says', async () => {
    const svc = service(fakePrisma({ timezone: 'Asia/Kolkata' }));
    expect((await svc.year('u1', 2026)).days).toHaveLength(365);
    expect((await svc.year('u1', 2024)).days).toHaveLength(366); // a leap year
    const y = await svc.year('u1', 2026);
    expect(y.days[0].date).toBe('2026-01-01');
    expect(y.days[y.days.length - 1].date).toBe('2026-12-31');
  });

  it('claims the New Year act the person actually lived through', async () => {
    // 00:30 IST on 1 January 2026 is 19:00 UTC on 31 December 2025. Asking for
    // 2026 has to reach back past the UTC year boundary to find it.
    const svc = service(fakePrisma({
      timezone: 'Asia/Kolkata',
      missions: [mission('2025-12-31T19:00:00Z')],
    }));

    const y2026 = await svc.year('u1', 2026);
    expect(y2026.events).toBe(1);
    expect(y2026.days.find((d) => d.date === '2026-01-01')!.total).toBe(1);

    // And it must not also be counted in the year it merely passed through.
    expect((await svc.year('u1', 2025)).events).toBe(0);
  });

  it('counts only what belongs to the year, despite the wider fetch', async () => {
    // The window now reaches a day past each end; the day key decides.
    const svc = service(fakePrisma({
      timezone: 'Asia/Kolkata',
      missions: [
        mission('2025-12-30T12:00:00Z'),  // solidly 2025
        mission('2026-06-15T12:00:00Z'),  // solidly 2026
        mission('2027-01-02T12:00:00Z'),  // solidly 2027
      ],
    }));

    const y = await svc.year('u1', 2026);
    expect(y.events).toBe(1);
    expect(y.activeDays).toBe(1);
    expect(y.restDays).toBe(364);
  });

  it('marks the years a life was lived in, not the years UTC saw', async () => {
    // The only act is 00:30 IST on 1 Jan 2026 — a 2026 act by every measure
    // that matters to the person who lived it.
    const svc = service(fakePrisma({
      timezone: 'Asia/Kolkata',
      missions: [mission('2025-12-31T19:00:00Z')],
    }));
    expect(await svc.yearsWithActivity('u1')).toEqual([2026]);
  });

  it('falls back to UTC rather than to whatever zone the server sits in', async () => {
    const svc = service(fakePrisma({
      timezone: null as any,
      missions: [mission('2026-07-29T19:50:00Z')],
    }));
    expect((await svc.year('u1', 2026)).days.filter((d) => d.total > 0).map((d) => d.date))
      .toEqual(['2026-07-29']);
  });
});
