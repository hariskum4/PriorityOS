import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Throwing away what nobody reads any more.
 *
 * Nothing in this database was ever deleted. At roughly thirty rows per
 * active user per week that is 1.6 million rows a year at a thousand users,
 * against a free tier that holds about 2.5 million — and the failure mode is
 * already documented: the database stops, and the API dies behind it without
 * saying why.
 *
 * Two tables are pruned here, and the choice of which is the whole point.
 *
 *   **`AnalyticsEvent`** is telemetry. Its purpose is answering questions
 *   about how the catalog performs across many people over months, and
 *   `neglectBandFor`-style aggregates are computed from recent windows. A
 *   year is more than any of those questions need.
 *
 *   **`AiRecommendation`** is a cache with a day-level key. `AiService` looks
 *   only for rows created since the start of today; anything older is dead
 *   weight that has never been read again.
 *
 * What is deliberately NOT pruned, and must not be added here casually:
 *
 *   `DomainAttentionSample` is the twelve-week trail the sky is drawn from —
 *   deleting it deletes a picture somebody can see. `Memory`, `JournalEntry`
 *   and `Mission` are the record itself; this app's entire proposition is
 *   that they are still there in ten years. `HabitLog` is what streaks and
 *   weekly counts are computed from. Every one of those is a thing a person
 *   would notice going missing, which is the line: this job removes only
 *   what nothing reads and nobody can see.
 */
/**
 * Whether an external scheduler owns the clock.
 *
 * Set on any deployment where Vercel Cron calls `/cron/daily` and
 * `/cron/weekly`. Left unset locally, where the process runs continuously and
 * the decorators below are the easiest way to exercise a job. Without this, a
 * deployment carrying both clocks would run every job twice.
 */
/**
 * The guard belongs on the clock, not on the work.
 *
 * The first version of this put `if (EXTERNAL_CRON) return;` inside the job
 * itself — which also silenced the HTTP endpoint that exists to run it, since
 * both call the same method. Production reported four jobs "ok" in two
 * milliseconds: the exact failure this whole change was meant to end, put
 * back by the fix for it.
 *
 * So the decorator now wraps rather than guards. `@Cron` calls a thin
 * scheduled-only shim; the work underneath is a plain method that always does
 * what it says, whoever calls it.
 */
const EXTERNAL_CRON = process.env.EXTERNAL_CRON === 'true';

@Injectable()
export class RetentionJobs {
  private readonly log = new Logger(RetentionJobs.name);

  /** Telemetry older than this answers no question anybody is asking. */
  private static readonly ANALYTICS_DAYS = 365;

  /** The AI cache is keyed by day; a week is already generous. */
  private static readonly AI_CACHE_DAYS = 30;

  constructor(private prisma: PrismaService) {}

  /**
   * Sunday 03:30 — after the weekly snapshot at 03:00, so a prune can never
   * race the job whose history it would otherwise be deleting.
   */
  @Cron('30 3 * * 0')
  scheduledPrune() {
    if (EXTERNAL_CRON) return undefined;
    return this.prune();
  }

  async prune() {
    const cutoff = (days: number) => new Date(Date.now() - days * 86_400_000);

    /* Independent tables, and neither is read by the other. Failing one must
       not stop the other: a job that gives up halfway is a job that quietly
       stops reclaiming anything. */
    const results = await Promise.allSettled([
      this.prisma.analyticsEvent.deleteMany({
        where: { createdAt: { lt: cutoff(RetentionJobs.ANALYTICS_DAYS) } },
      }),
      this.prisma.aiRecommendation.deleteMany({
        where: { createdAt: { lt: cutoff(RetentionJobs.AI_CACHE_DAYS) } },
      }),
    ]);

    const names = ['AnalyticsEvent', 'AiRecommendation'];
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') {
        /* Logged even at zero. A retention job that only speaks when it
           deletes something is indistinguishable from one that has silently
           stopped running. */
        this.log.log(`pruned ${r.value.count} rows from ${names[i]}`);
      } else {
        this.log.error(`prune of ${names[i]} failed`, r.reason as Error);
      }
    });
  }
}
