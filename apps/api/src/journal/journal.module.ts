import { Module } from '@nestjs/common';
import { JournalController } from './journal.controller';
import { JournalService } from './journal.service';
import { ScoringModule } from '../scoring/scoring.module';
import { GamificationModule } from '../gamification/gamification.module';
import { AiModule } from '../ai/ai.module';
import { AnalyticsModule } from '../analytics/analytics.module';

@Module({
  imports: [ScoringModule, GamificationModule, AiModule, AnalyticsModule],
  controllers: [JournalController],
  providers: [JournalService],
})
export class JournalModule {}
