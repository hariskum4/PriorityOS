import { Module } from '@nestjs/common';
import { CronController } from './cron.controller';
import { NotificationsModule } from '../notifications/notifications.module';
import { AuthModule } from '../auth/auth.module';
import { LifeOsModule } from '../life-os/life-os.module';
import { RetentionJobs } from '../common/retention.jobs';

/**
 * Composition only. Every job belongs to the module that owns its data; this
 * just gives an external scheduler a door to each one. See the controller for
 * why the scheduling had to move out of the process.
 */
@Module({
  imports: [NotificationsModule, AuthModule, LifeOsModule],
  controllers: [CronController],
  providers: [RetentionJobs],
})
export class CronModule {}
