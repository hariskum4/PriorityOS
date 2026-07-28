/**
 * The timeline — a life as dated acts.
 *
 * The Time tab already shows a life at one zoom level: a square per year. This
 * is the second level: tap a year, see its days. What fills a day is every
 * *dated act* the app records, not just missions — a completed mission, a call
 * logged, a moment kept, a habit ticked, a reflection written. Using missions
 * alone would render most years nearly empty when they were not.
 *
 * ── Why this is not a contributions graph ──────────────────────────────────
 *
 * The obvious shape here is GitHub's green grid, and it is the wrong one. That
 * graph is a streak device: intensity encodes *volume*, more is better, and an
 * empty square reads as a failure you can see from across the room. This product
 * explicitly forbids that psychology — "do not create streak addiction",
 * "missing one day should never feel like failure", "no streaks/shame
 * mechanics" — and the Habit engine already carries `refillGrace` to avoid it.
 *
 * So a day is coloured by **which part of life it belonged to**, never by how
 * much was done. One call to your mother is not a lesser day than five admin
 * tasks. Read across a year, the grid answers "where did my life actually go",
 * and an all-one-colour year is the most useful thing it can tell you.
 *
 * Consequences, deliberately: no streak is computed, no total is presented as a
 * headline, and `restDays` is named as rest rather than reported as a gap.
 */
import { Injectable } from '@nestjs/common';
import { DomainType, domainForRelationType } from '@priority/types';
import { PrismaService } from '../prisma/prisma.service';

/** One thing that happened, once we have flattened every source. */
interface DatedAct {
  at: Date;
  domain: DomainType | null;
  kind: 'mission' | 'contact' | 'memory' | 'habit' | 'reflection';
  label: string;
}

export interface TimelineDay {
  /** YYYY-MM-DD in UTC. */
  date: string;
  total: number;
  byDomain: Record<string, number>;
  /**
   * The domain the day mostly belonged to — what colours the square. Ties break
   * toward the domain with fewer acts across the whole year, so a day shared
   * between career and family shows the rarer one. The point is to surface what
   * a life is short of, not to reward whatever is already dominant.
   */
  dominant: DomainType | null;
  kinds: Record<string, number>;
}

export interface TimelineYear {
  year: number;
  days: TimelineDay[];
  /** Days with nothing recorded. Named as rest, because that is what they are. */
  restDays: number;
  activeDays: number;
  events: number;
  byDomain: Record<string, number>;
  /** Sample acts per day, so a tapped square can say what it was. */
  sample: Record<string, string[]>;
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

@Injectable()
export class LifeTimelineService {
  constructor(private prisma: PrismaService) {}

  /** Which calendar years hold anything at all — marks the life-in-years grid. */
  async yearsWithActivity(userId: string): Promise<number[]> {
    const acts = await this.gather(userId);
    return [...new Set(acts.map((a) => a.at.getUTCFullYear()))].sort();
  }

  async year(userId: string, year: number): Promise<TimelineYear> {
    const from = new Date(Date.UTC(year, 0, 1));
    const to = new Date(Date.UTC(year + 1, 0, 1));
    const acts = (await this.gather(userId, from, to));

    // Year-wide domain totals first: the tie-break needs to know what is rare.
    const byDomain: Record<string, number> = {};
    for (const a of acts) {
      if (a.domain) byDomain[a.domain] = (byDomain[a.domain] ?? 0) + 1;
    }

    const buckets = new Map<string, DatedAct[]>();
    for (const a of acts) {
      const key = ymd(a.at);
      buckets.set(key, [...(buckets.get(key) ?? []), a]);
    }

    // Every day of the year, present or not — the grid is a calendar, and a
    // sparse array would silently reflow it.
    const days: TimelineDay[] = [];
    const sample: Record<string, string[]> = {};
    for (let d = new Date(from); d < to; d.setUTCDate(d.getUTCDate() + 1)) {
      const key = ymd(d);
      const dayActs = buckets.get(key) ?? [];

      const dayDomains: Record<string, number> = {};
      const kinds: Record<string, number> = {};
      for (const a of dayActs) {
        if (a.domain) dayDomains[a.domain] = (dayDomains[a.domain] ?? 0) + 1;
        kinds[a.kind] = (kinds[a.kind] ?? 0) + 1;
      }

      let dominant: DomainType | null = null;
      const entries = Object.entries(dayDomains);
      if (entries.length) {
        entries.sort((x, y) =>
          (y[1] - x[1])                                    // more acts that day
          || ((byDomain[x[0]] ?? 0) - (byDomain[y[0]] ?? 0)) // then the rarer one
          || x[0].localeCompare(y[0]));                     // then stable
        dominant = entries[0][0] as DomainType;
      }

      days.push({ date: key, total: dayActs.length, byDomain: dayDomains, dominant, kinds });
      if (dayActs.length) {
        sample[key] = dayActs.slice(0, 4).map((a) => a.label);
      }
    }

    const activeDays = days.filter((d) => d.total > 0).length;
    return {
      year,
      days,
      activeDays,
      restDays: days.length - activeDays,
      events: acts.length,
      byDomain,
      sample,
    };
  }

  /**
   * Flatten every dated act into one list.
   *
   * Each source is queried with the same window so a year view never pulls a
   * whole history into memory. Habit logs and contact logs reach their domain
   * through their parent, which is why those two include a relation.
   */
  private async gather(userId: string, from?: Date, to?: Date): Promise<DatedAct[]> {
    const window = from && to ? { gte: from, lt: to } : undefined;

    const [missions, contacts, memories, habitLogs, journal] = await Promise.all([
      this.prisma.mission.findMany({
        where: {
          userId,
          status: 'completed',
          ...(window ? { completedAt: window } : { completedAt: { not: null } }),
        },
        select: { completedAt: true, domainType: true, title: true },
      }),
      this.prisma.contactLog.findMany({
        where: {
          relationship: { userId },
          ...(window ? { occurredAt: window } : {}),
        },
        select: {
          occurredAt: true, kind: true, note: true,
          relationship: { select: { name: true, relationType: true } },
        },
      }),
      this.prisma.memory.findMany({
        where: { userId, ...(window ? { occurredAt: window } : {}) },
        select: { occurredAt: true, domainType: true, title: true },
      }),
      this.prisma.habitLog.findMany({
        where: {
          habit: { userId },
          ...(window ? { completedAt: window } : {}),
        },
        select: { completedAt: true, habit: { select: { title: true, domainType: true } } },
      }),
      this.prisma.journalEntry.findMany({
        where: { userId, ...(window ? { createdAt: window } : {}) },
        select: { createdAt: true, domainTags: true, whatMattered: true },
      }),
    ]);

    const acts: DatedAct[] = [];

    for (const m of missions) {
      if (!m.completedAt) continue;
      acts.push({
        at: m.completedAt,
        domain: m.domainType as DomainType,
        kind: 'mission',
        label: m.title,
      });
    }
    for (const c of contacts) {
      acts.push({
        at: c.occurredAt,
        // A person's own relationType is finer than any domain guess.
        domain: domainForRelationType(c.relationship.relationType),
        kind: 'contact',
        label: `${c.kind} with ${c.relationship.name}${c.note ? ` — ${c.note}` : ''}`,
      });
    }
    for (const mem of memories) {
      acts.push({
        at: mem.occurredAt,
        domain: (mem.domainType as DomainType) ?? null,
        kind: 'memory',
        label: mem.title,
      });
    }
    for (const h of habitLogs) {
      acts.push({
        at: h.completedAt,
        domain: h.habit.domainType as DomainType,
        kind: 'habit',
        label: h.habit.title,
      });
    }
    for (const j of journal) {
      const tags = (j.domainTags as string[]) ?? [];
      acts.push({
        at: j.createdAt,
        domain: (tags[0] as DomainType) ?? null,
        kind: 'reflection',
        label: j.whatMattered?.slice(0, 80) || 'Reflected',
      });
    }

    return acts.sort((a, b) => a.at.getTime() - b.at.getTime());
  }
}
