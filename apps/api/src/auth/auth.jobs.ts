import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Rotation deletes the token that was used; nothing ever deleted the ones
 * that simply expired — every sign-in that wasn't refreshed to death left a
 * row behind forever. One sweep a day keeps the table the size of the number
 * of live sessions instead of the number of sessions that have ever existed.
 */
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
export class AuthJobsService {
  private readonly logger = new Logger(AuthJobsService.name);

  constructor(private prisma: PrismaService) {}

  @Cron('30 4 * * *')
  async pruneExpiredRefreshTokens() {
    if (EXTERNAL_CRON) return;
    const { count } = await this.prisma.refreshToken.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    if (count > 0) this.logger.log(`Pruned ${count} expired refresh token(s)`);

    const reset = await this.prisma.passwordResetToken.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    if (reset.count > 0) {
      this.logger.log(`Pruned ${reset.count} expired reset code(s)`);
    }
  }
}
