import { Module } from '@nestjs/common';
import { AnalyticsModule } from '../analytics/analytics.module';
import { MemoriesController } from './memories.controller';
import { MemoriesService } from './memories.service';
import { GamificationModule } from '../gamification/gamification.module';

@Module({
  imports: [GamificationModule, AnalyticsModule],
  controllers: [MemoriesController],
  providers: [MemoriesService],
  exports: [MemoriesService],
})
export class MemoriesModule {}
