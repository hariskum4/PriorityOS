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

@Injectable()
export class LifeOsJobs {
  private readonly log = new Logger(LifeOsJobs.name);

  constructor(
    private prisma: PrismaService,
    private lifeOs: LifeOsService,
  ) {}

  @Cron(CronExpression.EVERY_WEEK)
  async snapshotEveryone() {
    // Only users who have actually onboarded — a snapshot of empty domains is
    // noise that would later read as a real, flat trend.
    const users = await this.prisma.user.findMany({
      where: { onboardingCompleted: true },
      select: { id: true },
    });

    let ok = 0;
    for (const user of users) {
      try {
        await this.lifeOs.snapshotWeek(user.id);
        ok += 1;
      } catch (err) {
        // One bad user must not stop the sweep.
        this.log.error(`snapshot failed for ${user.id}: ${String(err)}`);
      }
    }
    this.log.log(`weekly domain snapshot: ${ok}/${users.length} users`);
  }
}
