/**
 * Scheduled work for the Life OS.
 *
 * One job: take the weekly snapshot that the Regret and Prediction engines'
 * history depends on. Without it those engines correctly stay silent forever,
 * because a trend needs points and `LifeDomain` only holds today's.
 *
 * Runs Monday 03:00 so the week it samples is the week that just ended.
 */
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { LifeOsService } from './life-os.service';

/**
 * Whether an external scheduler owns the clock.
 *
 * Set on any deployment where Vercel Cron calls `/cron/daily` and
 * `/cron/weekly`. Left unset locally, where the process runs continuously and
 * the decorators below are the easiest way to exercise a job. Without this, a
 * deployment carrying both clocks would run every job twice.
 */
const EXTERNAL_CRON = process.env.EXTERNAL_CRON === 'true';

@Injectable()
export class LifeOsJobs {
  private readonly log = new Logger(LifeOsJobs.name);

  constructor(
    private prisma: PrismaService,
    private lifeOs: LifeOsService,
  ) {}

  @Cron(CronExpression.EVERY_WEEK)
  async snapshotEveryone() {
    if (EXTERNAL_CRON) return;
    // Only users who have actually onboarded — a snapshot of empty domains is
    // noise that would later read as a real, flat trend.
    /**
     * Paged rather than loaded whole.
     *
     * `findMany` with no take pulls every user who has ever signed up into
     * memory at once — invisible at ten users and an outage at a hundred
     * thousand, on a job nobody is watching at 3am. Keyset pagination on the
     * id keeps the working set flat however far this grows.
     */
    const PAGE = 500;
    let cursor: string | undefined;
    let ok = 0;
    let seen = 0;

    for (;;) {
      const page = await this.prisma.user.findMany({
        where: { onboardingCompleted: true },
        select: { id: true },
        orderBy: { id: 'asc' },
        take: PAGE,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      if (!page.length) break;

      for (const user of page) {
        seen += 1;
        try {
          await this.lifeOs.snapshotWeek(user.id);
          ok += 1;
        } catch (err) {
          // One bad user must not stop the sweep.
          this.log.error(`snapshot failed for ${user.id}: ${String(err)}`);
        }
      }
      cursor = page[page.length - 1].id;
      if (page.length < PAGE) break;
    }

    this.log.log(`weekly domain snapshot: ${ok}/${seen} users`);
  }
}
