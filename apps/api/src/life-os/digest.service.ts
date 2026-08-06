import { Injectable } from '@nestjs/common';
import { buildDigest, type Digest, type DigestPerson, type SlipBand } from '@priority/scoring-engine';
import { PrismaService } from '../prisma/prisma.service';
import { UserClock } from '../common/clock.module';
import { weekBounds } from '../weekly-review/weekly-review.service';

/**
 * The reading of a life, assembled for something that has to reason about it.
 *
 * See `digest.ts` in the engine for why this is a digest rather than the
 * state: the state is 13.7 KB for one screen and grows without limit; this is
 * a fixed shape of about two hundred tokens made of conclusions the engines
 * already reached.
 *
 * Everything is read in one parallel pass and nothing is written, so this is
 * safe to call on any path — including one a person is waiting on.
 */

/** Their own stated rhythm, in days. */
const CADENCE_DAYS: Record<string, number> = {
  daily: 1, weekly: 7, biweekly: 14, monthly: 30, quarterly: 90, yearly: 365,
};

/**
 * How far past their own rhythm somebody is.
 *
 * Bands rather than a raw ratio because the consumer is writing a sentence,
 * and "long overdue" is a thing a sentence can say. The thresholds are the
 * same shape the People list already uses: at their cadence is due, twice it
 * is overdue, three times is long overdue.
 */
function bandFor(daysSince: number | null, wanted: number | null): SlipBand {
  if (daysSince == null || !wanted) return 'due';
  if (daysSince >= wanted * 3) return 'long overdue';
  if (daysSince >= wanted * 2) return 'overdue';
  return 'due';
}

@Injectable()
export class DigestService {
  constructor(private prisma: PrismaService, private clock: UserClock) {}

  async forUser(userId: string): Promise<Digest> {
    const tz = await this.clock.zoneOf(userId);
    const { weekStart, weekEnd } = weekBounds(tz);
    const since = new Date(Date.now() - 30 * 86_400_000);

    const [user, domains, people, habits, missions, journal] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { dob: true, country: true, workType: true, workHoursPerWeek: true, movementLimits: true },
      }),
      this.prisma.lifeDomain.findMany({
        where: { userId },
        select: { domainType: true, importanceScore: true, attentionScore: true },
      }),
      this.prisma.relationship.findMany({
        where: { userId },
        select: { name: true, relationType: true, lastContactAt: true, desiredCallFrequency: true },
        take: 40,
      }),
      this.prisma.habit.findMany({
        where: { userId, isActive: true },
        select: {
          title: true,
          domainType: true,
          targetPerWeek: true,
          logs: { where: { completedAt: { gte: weekStart, lte: weekEnd } }, select: { id: true } },
        },
        take: 20,
      }),
      this.prisma.mission.findMany({
        where: { userId, status: 'completed', completedAt: { gte: weekStart, lte: weekEnd } },
        select: { id: true },
      }),
      this.prisma.journalEntry.findMany({
        where: { userId, createdAt: { gte: since } },
        select: { domainTags: true },
        take: 60,
      }),
    ]);

    /* How many of the week's completions left a moment behind — the same
       count the Sunday Session prints, asked here directly so the digest and
       that screen can never disagree. */
    const kept = missions.length
      ? new Set(
        (await this.prisma.memory.findMany({
          where: { userId, missionId: { in: missions.map((m) => m.id) } },
          select: { missionId: true },
        })).map((m) => m.missionId),
      ).size
      : 0;

    const now = Date.now();
    const waiting: DigestPerson[] = people
      .filter((p) => p.lastContactAt)
      .map((p) => {
        const daysSince = Math.floor((now - p.lastContactAt!.getTime()) / 86_400_000);
        const wanted = CADENCE_DAYS[p.desiredCallFrequency ?? 'monthly'] ?? 30;
        return {
          name: p.name,
          relation: p.relationType ?? 'someone',
          daysSince,
          wantedEveryDays: wanted,
          band: bandFor(daysSince, wanted),
        };
      })
      /* Only people actually past their own rhythm. A digest that lists
         everybody is a contact list, and the point is the exceptions. */
      .filter((p) => (p.daysSince ?? 0) >= (p.wantedEveryDays ?? 30));

    /* Which parts of life their own writing has been about. Tags the app
       derived, never a line anybody typed. */
    const themeCounts = new Map<string, number>();
    for (const entry of journal) {
      for (const tag of (Array.isArray(entry.domainTags) ? entry.domainTags : []) as string[]) {
        themeCounts.set(tag, (themeCounts.get(tag) ?? 0) + 1);
      }
    }
    const recentThemes = [...themeCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([tag]) => tag);

    const age = user?.dob
      ? Math.floor((now - user.dob.getTime()) / (365.25 * 86_400_000))
      : null;

    return buildDigest({
      age,
      country: user?.country ?? null,
      /* The shape of the working life, not the job title — a digest has no
         use for "senior engineer" and every use for "retired". */
      workShape: user?.workHoursPerWeek === 0
        || ['retired', 'not_working'].includes((user?.workType ?? '').toLowerCase())
        ? 'retired'
        : (user?.workType ? 'working' : null),
      movementLimits: user?.movementLimits ?? null,
      domains: domains.map((d) => ({
        domainType: d.domainType,
        importance: Number(d.importanceScore),
        attention: Number(d.attentionScore),
      })),
      people: waiting,
      /* One row per rhythm, however many times it was started. Duplicates are
         a data problem somebody will fix on the Rhythms screen; repeating them
         here would spend tokens saying the same thing twice and invite a
         sentence about keeping something "twice a week and twice a week". */
      rhythms: [...new Map(habits.map((h) => [
        h.title.trim().toLowerCase(),
        {
          title: h.title,
          domain: h.domainType,
          doneThisWeek: h.logs.length,
          targetPerWeek: h.targetPerWeek,
        },
      ])).values()],
      week: { done: missions.length, kept },
      /* The day is drawn on the client from the profile, so the digest does
         not have one to report. Left null rather than guessed — see the
         engine's rule about saying nothing over saying something invented. */
      longestFreeStretchMinutes: null,
      recentThemes,
    });
  }
}
