import { Global, Injectable, Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { startOfDayIn, startOfWeekIn, dayKeyIn, daysAgoIn } from './time';

/**
 * "Today", from the user's own position on the planet.
 *
 * Every service that needs a day boundary needs the user's timezone, and
 * fetching it on each call would add a query to the hot path for a value that
 * changes when someone emigrates. So it is cached briefly and by id.
 *
 * Global on purpose: a day boundary is not a feature of one module, and the
 * failure mode this replaces — a service quietly using server-local midnight
 * because wiring the clock in was a nuisance — is exactly what we are fixing.
 */
@Injectable()
export class UserClock {
  private zones = new Map<string, { tz: string; at: number }>();
  private static readonly TTL_MS = 5 * 60 * 1000;

  constructor(private prisma: PrismaService) {}

  async zoneOf(userId: string): Promise<string> {
    const hit = this.zones.get(userId);
    if (hit && Date.now() - hit.at < UserClock.TTL_MS) return hit.tz;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { timezone: true },
    });
    const tz = user?.timezone || 'UTC';
    this.zones.set(userId, { tz, at: Date.now() });
    return tz;
  }

  /** Call after a user edits their profile, so a move takes effect at once. */
  forget(userId: string) {
    this.zones.delete(userId);
  }

  async startOfToday(userId: string, at?: Date): Promise<Date> {
    return startOfDayIn(await this.zoneOf(userId), at);
  }

  async startOfWeek(userId: string, at?: Date): Promise<Date> {
    return startOfWeekIn(await this.zoneOf(userId), at);
  }

  async daysAgo(userId: string, days: number, at?: Date): Promise<Date> {
    return daysAgoIn(await this.zoneOf(userId), days, at);
  }

  /** YYYY-MM-DD in the user's zone — the correct key for a per-day cache. */
  async dayKey(userId: string, at?: Date): Promise<string> {
    return dayKeyIn(await this.zoneOf(userId), at);
  }
}

@Global()
@Module({
  providers: [UserClock],
  exports: [UserClock],
})
export class ClockModule {}
