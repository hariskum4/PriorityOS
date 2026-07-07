import { Module } from '@nestjs/common';
import { JournalController } from './journal.controller';
import { JournalService } from './journal.service';
import { ScoringModule } from '../scoring/scoring.module';
import { GamificationModule } from '../gamification/gamification.module';

@Module({
  imports: [ScoringModule, GamificationModule],
  controllers: [JournalController],
  providers: [JournalService],
})
export class JournalModule {}
