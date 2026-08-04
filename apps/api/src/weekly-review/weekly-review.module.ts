import { Module } from '@nestjs/common';
import { WeeklyReviewController } from './weekly-review.controller';
import { WeeklyReviewService } from './weekly-review.service';
import { GamificationModule } from '../gamification/gamification.module';
import { InsightsModule } from '../insights/insights.module';
import { LifeOsModule } from '../life-os/life-os.module';

@Module({
  imports: [GamificationModule, InsightsModule, LifeOsModule],
  controllers: [WeeklyReviewController],
  providers: [WeeklyReviewService],
  exports: [WeeklyReviewService],
})
export class WeeklyReviewModule {}
