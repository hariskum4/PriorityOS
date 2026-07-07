import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { MissionsModule } from '../missions/missions.module';
import { GamificationModule } from '../gamification/gamification.module';
import { InsightsModule } from '../insights/insights.module';

@Module({
  imports: [MissionsModule, GamificationModule, InsightsModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
