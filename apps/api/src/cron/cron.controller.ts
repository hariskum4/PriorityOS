import {
  Controller, Headers, Logger, Post, UnauthorizedException,
} from '@nestjs/common';
import { JobsService } from '../notifications/jobs.service';
import { AuthJobsService } from '../auth/auth.jobs';
import { LifeOsJobs } from '../life-os/life-os.jobs';
import { RetentionJobs } from '../common/retention.jobs';

/**
 * The scheduled work, reachable over HTTP so something awake can start it.
 *
 * Seven `@Cron` decorators have been sitting in this codebase since July and
 * none of them has ever fired in production. The reason is not a bug in the
 * jobs: Render's free tier spins the service down after about fifteen minutes
 * of inactivity, and `@nestjs/schedule` only fires inside a live process. At
 * six in the morning there is no process. The evidence is flat — seven
 * onboarded users, five with a pending mission every day for three weeks, and
 * the `Notification` table has never held a single row.
 *
 * So scheduling moves outside. Vercel Cron is an external clock that makes an
 * HTTP request whether or not this service happens to be awake; the request
 * itself wakes it. The decorators stay for local development, where the
 * process does run continuously — `EXTERNAL_CRON` is what stops both clocks
 * firing the same job twice.
 *
 * Two endpoints rather than seven, because the Vercel Hobby plan allows two
 * cron jobs. That constraint turned out to be a better design than the one it
 * replaced: the daily batch runs in a defined order, and one failure is
 * reported against one named job rather than disappearing into a log.
 */
@Controller('cron')
export class CronController {
  private readonly log = new Logger(CronController.name);

  constructor(
    private notifications: JobsService,
    private auth: AuthJobsService,
    private lifeOs: LifeOsJobs,
    private retention: RetentionJobs,
  ) {}

  /**
   * The shared secret, compared in constant time.
   *
   * These endpoints start work for every user in the database, so an open one
   * is a way to make the server do the heaviest thing it knows on demand.
   * `timingSafeEqual` because a plain `===` leaks the answer one character at
   * a time to anybody willing to measure.
   */
  private assertInvited(header?: string) {
    const expected = process.env.CRON_SECRET;
    if (!expected) {
      throw new UnauthorizedException('CRON_SECRET is not configured');
    }
    const given = (header ?? '').replace(/^Bearer\s+/i, '');
    // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
    const { timingSafeEqual } = require('crypto');
    const a = Buffer.from(given);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new UnauthorizedException('bad cron secret');
    }
  }

  /**
   * One job, reported by name.
   *
   * `allSettled` rather than a loop of awaits: these are independent, and a
   * morning where the drift nudges throw must still prune expired tokens.
   * The response says what ran and what did not, because a scheduler that
   * only ever returns 200 tells you nothing about the night it stopped
   * working.
   */
  private async runAll(jobs: Array<[string, () => Promise<unknown>]>) {
    const started = Date.now();
    const results = await Promise.allSettled(jobs.map(([, run]) => run()));
    const report = results.map((r, i) => ({
      job: jobs[i][0],
      ok: r.status === 'fulfilled',
      ...(r.status === 'rejected' ? { error: String((r.reason as Error)?.message ?? r.reason) } : {}),
    }));
    for (const line of report) {
      if (line.ok) this.log.log(`cron ${line.job}: ok`);
      else this.log.error(`cron ${line.job}: ${line.error}`);
    }
    return { ranAt: new Date().toISOString(), ms: Date.now() - started, jobs: report };
  }

  @Post('daily')
  daily(@Headers('authorization') auth?: string) {
    this.assertInvited(auth);
    return this.runAll([
      ['morningRefresh', () => this.notifications.morningRefresh()],
      ['driftNudges', () => this.notifications.driftNudges()],
      ['reengageQuietUsers', () => this.notifications.reengageQuietUsers()],
      ['pruneExpiredRefreshTokens', () => this.auth.pruneExpiredRefreshTokens()],
    ]);
  }

  @Post('weekly')
  weekly(@Headers('authorization') auth?: string) {
    this.assertInvited(auth);
    return this.runAll([
      ['weeklyRollover', () => this.notifications.weeklyRollover()],
      ['snapshotEveryone', () => this.lifeOs.snapshotEveryone()],
      ['retentionPrune', () => this.retention.prune()],
    ]);
  }
}
