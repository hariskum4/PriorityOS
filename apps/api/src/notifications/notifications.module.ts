import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { JobsService } from './jobs.service';
import { MissionsModule } from '../missions/missions.module';
import { HabitsModule } from '../habits/habits.module';
import { WeeklyReviewModule } from '../weekly-review/weekly-review.module';
import { ScoringModule } from '../scoring/scoring.module';
import { RelationshipsModule } from '../relationships/relationships.module';

@Module({
  imports: [
    MissionsModule,
    HabitsModule,
    WeeklyReviewModule,
    ScoringModule,
    RelationshipsModule,
  ],
  controllers: [NotificationsController],
  providers: [NotificationsService, JobsService],
})
export class NotificationsModule {}
