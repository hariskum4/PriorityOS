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
import { dayKeyIn } from '../common/time';

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
  /**
   * What actually happened, per day, for the tapped-day read-out.
   *
   * This used to be four bare strings. `DatedAct` has always carried the
   * domain and the kind of each act and both were thrown away here — so a day
   * holding a call to your mother, a health checkup and five quiet minutes
   * rendered as three identical lines in whichever colour happened to
   * dominate that day. The day is the only place the whole shape of a life is
   * visible at once; it should say what each thing was.
   */
  sample: Record<string, Array<{ label: string; domain: string | null; kind: string }>>;
}

/**
 * Which day an act belongs to — the person's day, not the server's.
 *
 * This used UTC, and UTC is nobody's calendar. Caught in use from Bengaluru at
 * 01:20 on a Thursday: a dozen missions completed that minute were filed under
 * Wednesday, because 01:20 IST is 19:50 UTC the day before. Every night
 * between midnight and 05:30 local landed on the wrong square. Going the other
 * way it is worse — from New York, everything after 7pm files under tomorrow,
 * which is most of the hours anyone actually logs a day in.
 *
 * `dayKeyIn` already existed for exactly this; the timeline simply never
 * called it. Worth stating plainly why it matters here more than elsewhere:
 * this record is meant to be read in forty years, so a misfiled act is not a
 * glitch that clears on refresh. It is a permanent error in someone's history,
 * and there is no way to tell later that it was wrong.
 */
const dayOf = (d: Date, tz: string | null | undefined) => dayKeyIn(tz, d);

/** A day either side, so a local year is fully covered by a UTC fetch window. */
const DAY_MS = 86_400_000;

/**
 * What an act is worth to the *shape* of a life, as opposed to its record.
 *
 * The day grid counts acts one apiece and should — a day is a day. The
 * organism is different: it is grown from these totals, and whatever visibly
 * grows is what people will quietly optimise for. Counting every act as one
 * made that a to-do list. On the profile this was caught with, nine of every
 * ten acts were completed missions: 89 ticked tasks against 4 kept memories
 * and 4 written entries. A life of two hundred chores and no people would have
 * drawn a magnificent organism, which is the wrong thing to tell someone.
 *
 * So the weights lean toward what cannot be repeated or rushed. A moment you
 * chose to keep is worth several errands. Time with a person is worth more
 * than a box ticked. None of it is worth zero — the errands are real, and a
 * life is partly made of them.
 *
 * These are a starting point and deliberately legible: they encode what this
 * product thinks a life is made of, so they should be argued with in the open
 * rather than buried in a scoring config.
 */
const ACT_WEIGHT: Record<DatedAct['kind'], number> = {
  memory: 5,      // a moment kept on purpose, unrepeatable
  contact: 3,     // real time with a real person
  reflection: 3,  // sitting with your own life
  habit: 1.5,     // a rhythm actually sustained
  mission: 1,     // a thing done
};

/**
 * How far back a rhythm is measured. Long enough that a quiet fortnight does
 * not reclassify a monthly domain as abandoned; short enough that a cadence
 * someone dropped six months ago stops being reported as current.
 */
const RHYTHM_WINDOW_DAYS = 120;
/** Nothing in a life is honestly faster than daily or slower than half a year. */
const MIN_PERIOD_DAYS = 1;
const MAX_PERIOD_DAYS = 180;
/** Per kind, per domain. The sky shows a shape; the list underneath shows all. */
const RHYTHM_ITEMS_PER_KIND = 6;

export interface DomainRhythm {
  /** Days per act, over the trailing window. Null when there is too little to claim. */
  period: number | null;
  total: number;
  /** Acts inside the window — what the period was computed from. */
  recent: number;
  lastAt: string | null;
  kinds: Array<{
    kind: DatedAct['kind'];
    count: number;
    items: Array<{ label: string; at: string }>;
  }>;
}

@Injectable()
export class LifeTimelineService {
  constructor(private prisma: PrismaService) {}

  /** The zone this person's days are measured in. */
  private async zoneOf(userId: string): Promise<string> {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { timezone: true },
    });
    return u?.timezone ?? 'UTC';
  }

  /** Which calendar years hold anything at all — marks the life-in-years grid. */
  async yearsWithActivity(userId: string): Promise<number[]> {
    const [acts, tz] = await Promise.all([this.gather(userId), this.zoneOf(userId)]);
    // Local years, for the same reason as local days: an act logged late on
    // New Year's Eve belongs to the year the person was living in.
    return [...new Set(acts.map((a) => Number(dayOf(a.at, tz).slice(0, 4))))].sort();
  }

  /**
   * Lifetime act counts per domain, in one pass.
   *
   * The organism needs totals across every year on record. Asking for them a
   * year at a time costs five queries per year — fine for a demo profile with
   * two years, and three hundred round trips for the sixty-year record this
   * product is built to hold. Same five queries here whether someone has been
   * using it for a week or a lifetime.
   */
  async actTotalsByDomain(userId: string, upToYear?: number): Promise<Record<string, number>> {
    const [acts, tz] = await Promise.all([this.gather(userId), this.zoneOf(userId)]);
    const totals: Record<string, number> = {};
    for (const a of acts) {
      if (!a.domain) continue;
      if (upToYear != null && Number(dayOf(a.at, tz).slice(0, 4)) > upToYear) continue;
      totals[a.domain] = (totals[a.domain] ?? 0) + ACT_WEIGHT[a.kind];
    }
    return totals;
  }

  /**
   * The years this life has on record, oldest first — the frames of its growth.
   *
   * One pass, because a person on their sixtieth year of this should not cost
   * sixty round trips to draw.
   */
  async actYears(userId: string): Promise<number[]> {
    return this.yearsWithActivity(userId);
  }

  /**
   * The rhythm of a life, domain by domain: how often each part of it is
   * actually touched, and what is in it.
   *
   * The sky draws a domain's orbit from its period here, so this is the one
   * number that decides how the Today screen moves. Two things it deliberately
   * is not:
   *
   * It is not the median gap between acts. That is the obvious estimator and
   * it is wrong on real data — people log in bursts, six things on a Sunday
   * afternoon, and a median gap reads that as a two-hour rhythm. Rate over a
   * trailing window asks how many times this actually happens per year, which
   * survives bursts.
   *
   * It is not what someone said they wanted. Declared intent and observed
   * behaviour disagree precisely in the domains being neglected, which is
   * exactly where a life record must not flatter its owner. Intent is the
   * caller's fallback for an account too young to have a rhythm, never a blend.
   */
  async rhythm(userId: string): Promise<{
    window: number;
    domains: Record<string, DomainRhythm>;
  }> {
    const acts = await this.gather(userId);
    const since = Date.now() - RHYTHM_WINDOW_DAYS * 86_400_000;

    const out: Record<string, DomainRhythm> = {};
    for (const a of acts) {
      if (!a.domain) continue;
      const d = (out[a.domain] ??= { period: null, total: 0, recent: 0, lastAt: null, kinds: [] });
      d.total += 1;
      if (a.at.getTime() >= since) d.recent += 1;
      if (!d.lastAt || a.at > new Date(d.lastAt)) d.lastAt = a.at.toISOString();

      let k = d.kinds.find((x) => x.kind === a.kind);
      if (!k) { k = { kind: a.kind, count: 0, items: [] }; d.kinds.push(k); }
      k.count += 1;
      k.items.push({ label: a.label.slice(0, 80), at: a.at.toISOString() });
    }

    for (const d of Object.values(out)) {
      /**
       * Two acts is the floor for claiming a rhythm at all. One act is an
       * event; calling it a cadence would have the sky orbiting on a single
       * data point. Below the floor the period is null and the caller decides
       * what to do about it.
       */
      d.period = d.recent >= 2
        ? Math.min(MAX_PERIOD_DAYS, Math.max(MIN_PERIOD_DAYS, RHYTHM_WINDOW_DAYS / d.recent))
        : null;

      /* Newest first, and capped: the sky shows a shape, not a ledger. */
      for (const k of d.kinds) {
        k.items.sort((a, b) => b.at.localeCompare(a.at));
        k.items = k.items.slice(0, RHYTHM_ITEMS_PER_KIND);
      }
      d.kinds.sort((a, b) => ACT_WEIGHT[b.kind] - ACT_WEIGHT[a.kind]);
    }

    return { window: RHYTHM_WINDOW_DAYS, domains: out };
  }

  /**
   * Where the domains of a life sat, week by week.
   *
   * The Today screen draws one frame of a film: a star per domain, positioned
   * by how far it has drifted from what its owner said it was worth. The frame
   * is honest and completely mute about direction — a person looking at it
   * cannot tell whether they are climbing out or sliding in, which is the only
   * question they actually have.
   *
   * These samples have been written weekly since the account existed and were
   * read by nothing but the prediction engine. Same rows, drawn as a ghost.
   */
  async drift(userId: string, weeks?: number | null): Promise<{
    /** How many weeks the returned series actually spans. */
    weeks: number;
    from: string | null;
    series: Record<string, Array<{ weekOf: string; importance: number; attention: number }>>;
  }> {
    /**
     * No window at all, by default.
     *
     * This was a fixed twelve weeks, which is the wrong shape for a record
     * meant to be kept for decades. It is a keyhole for someone four years in,
     * and for someone four weeks in it is a promise of history that does not
     * exist yet — the sky captioned "twelve weeks ago" over an account that
     * has no twelve weeks. Showing everything held is right at both ends: it
     * starts as small as the account is and grows with it.
     *
     * A caller that genuinely wants a recent slice can still ask for one.
     */
    const span = weeks == null ? null : Math.min(Math.max(weeks, 2), 520);
    const since = span == null ? null : new Date(Date.now() - span * 7 * 86_400_000);

    const rows = await this.prisma.domainAttentionSample.findMany({
      where: { userId, ...(since ? { weekOf: { gte: since } } : {}) },
      orderBy: { weekOf: 'asc' },
      select: { domainType: true, weekOf: true, importance: true, attention: true },
    });

    const series: Record<string, Array<{ weekOf: string; importance: number; attention: number }>> = {};
    for (const r of rows) {
      (series[r.domainType] ??= []).push({
        weekOf: r.weekOf.toISOString().slice(0, 10),
        importance: Number(r.importance),
        attention: Number(r.attention),
      });
    }

    /**
     * The span actually covered, not the one asked for. A caption that says
     * "12 weeks ago" over four weeks of data is the app inventing a past.
     */
    const first = rows.length ? rows[0].weekOf : null;
    const covered = first
      ? Math.max(1, Math.round((Date.now() - first.getTime()) / (7 * 86_400_000)))
      : 0;

    return {
      weeks: covered,
      from: first ? first.toISOString().slice(0, 10) : null,
      series,
    };
  }

  /**
   * What has happened since a person last looked.
   *
   * Opening the app gave no sense of continuity at all: the same sky, the same
   * card, no acknowledgement that four days had passed or that anything had
   * been done in them. A life OS that cannot say "here is what changed while
   * you were gone" is a dashboard, not a companion.
   */
  async since(userId: string, since: Date): Promise<{
    since: string;
    days: number;
    missionsCompleted: number;
    momentsKept: number;
    entriesWritten: number;
    /**
     * Which parts of the life actually grew while they were away, in the same
     * weighted currency the Organism is drawn from — heaviest first.
     *
     * This is the return moment the product is allowed to have. A strategy
     * game pulls people back by threatening what they will lose; the honest
     * version of that pull is showing what they built and cannot lose. It is
     * deliberately about domains rather than counts: "family grew" is a fact
     * about a life, "3 tasks done" is a fact about a list.
     */
    grew: Array<{ domain: string; weight: number }>;
    slipped: Array<{ name: string; days: number; wanted: string | null }>;
  }> {
    const [missionsCompleted, momentsKept, entriesWritten, people, acts] = await Promise.all([
      this.prisma.mission.count({ where: { userId, status: 'completed', completedAt: { gte: since } } }),
      this.prisma.memory.count({ where: { userId, createdAt: { gte: since } } }),
      this.prisma.journalEntry.count({ where: { userId, createdAt: { gte: since } } }),
      this.prisma.relationship.findMany({
        where: { userId },
        select: { name: true, lastContactAt: true, desiredCallFrequency: true },
      }),
      // Everything dated in the gap, so growth is measured the same way the
      // drawing measures it rather than by counting rows in three tables.
      this.gather(userId, since, new Date(Date.now() + 60_000)),
    ]);

    const grewBy: Record<string, number> = {};
    for (const a of acts) {
      if (a.domain) grewBy[a.domain] = (grewBy[a.domain] ?? 0) + ACT_WEIGHT[a.kind];
    }
    const grew = Object.entries(grewBy)
      .map(([domain, weight]) => ({ domain, weight: Math.round(weight * 10) / 10 }))
      .sort((a, b) => b.weight - a.weight);

    /**
     * People who crossed their own cadence while you were away — the ones who
     * were fine last time you looked and are not now. Deliberately not "who is
     * overdue": that list never changes and stops being read. This is the
     * change, which is the only part that is news.
     */
    const CADENCE: Record<string, number> = {
      daily: 1, weekly: 7, biweekly: 14, monthly: 30, quarterly: 90, yearly: 365,
    };
    const now = Date.now();
    const slipped = people
      .filter((p) => p.lastContactAt)
      .map((p) => {
        /**
         * Three days, or the cadence, whichever is longer.
         *
         * Someone you talk to daily crosses their cadence every single morning,
         * so a bare `days >= target` put the same three names here every day
         * and turned the one line meant to carry news into nagging. A day late
         * on a daily call is not an event; three days of silence is.
         */
        const target = Math.max(3, CADENCE[p.desiredCallFrequency ?? 'monthly'] ?? 30);
        const daysNow = Math.floor((now - p.lastContactAt!.getTime()) / 86_400_000);
        const daysThen = Math.floor((since.getTime() - p.lastContactAt!.getTime()) / 86_400_000);
        return { name: p.name, days: daysNow, wanted: p.desiredCallFrequency, target, daysThen };
      })
      .filter((p) => p.days >= p.target && p.daysThen < p.target)
      .sort((a, b) => b.days - a.days)
      .slice(0, 3)
      .map(({ name, days, wanted }) => ({ name, days, wanted }));

    return {
      since: since.toISOString(),
      days: Math.max(0, Math.floor((now - since.getTime()) / 86_400_000)),
      missionsCompleted,
      momentsKept,
      entriesWritten,
      grew,
      slipped,
    };
  }

  async year(userId: string, year: number): Promise<TimelineYear> {
    const tz = await this.zoneOf(userId);
    // A local year is not a UTC year. Fetch a day wider at each end — every
    // zone on earth sits within ±14 hours — and then let the local day key
    // decide what actually belongs to this year.
    const from = new Date(Date.UTC(year, 0, 1) - DAY_MS);
    const to = new Date(Date.UTC(year + 1, 0, 1) + DAY_MS);
    const spill = await this.gather(userId, from, to);

    const dated = spill
      .map((a) => ({ act: a, key: dayOf(a.at, tz) }))
      .filter((e) => e.key.startsWith(`${year}-`));
    const acts = dated.map((e) => e.act);

    // Year-wide domain totals first: the tie-break needs to know what is rare.
    const byDomain: Record<string, number> = {};
    for (const a of acts) {
      if (a.domain) byDomain[a.domain] = (byDomain[a.domain] ?? 0) + 1;
    }

    const buckets = new Map<string, DatedAct[]>();
    for (const { act, key } of dated) {
      buckets.set(key, [...(buckets.get(key) ?? []), act]);
    }

    // Every day of the year, present or not — the grid is a calendar, and a
    // sparse array would silently reflow it.
    const days: TimelineDay[] = [];
    const sample: TimelineYear['sample'] = {};
    // Jan 1 to Dec 31 of the requested year, independent of the fetch window,
    // which is now a day wider at each end. UTC is used here purely as
    // calendar arithmetic for enumerating dates — never as a zone.
    for (
      let d = new Date(Date.UTC(year, 0, 1));
      d.getUTCFullYear() === year;
      d.setUTCDate(d.getUTCDate() + 1)
    ) {
      const key = d.toISOString().slice(0, 10);
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
        /**
         * The cap exists only to bound a year's payload — 365 uncapped days of
         * a busy life is megabytes over the wire. Day totals and per-domain
         * counts are always exact (`total`, `byDomain`), so the client can
         * state honestly what it is not showing rather than guessing from the
         * length of this list.
         *
         * It keeps the *end* of the day, newest first, and that is the whole
         * point. Keeping the first twenty-four was keeping the wrong end: on a
         * day with thirty-seven things the count said thirty-seven, the list
         * showed the morning, and the thing someone had just finished — the
         * only reason they opened the day at all — was never in it. Whatever
         * was done most recently is now the first line.
         */
        sample[key] = dayActs.slice(-24).reverse().map((a) => ({
          label: a.label,
          domain: a.domain,
          kind: a.kind,
        }));
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
