import { Module } from '@nestjs/common';
import { HabitsController } from './habits.controller';
import { HabitsService } from './habits.service';
import { ScoringModule } from '../scoring/scoring.module';
import { GamificationModule } from '../gamification/gamification.module';

@Module({
  imports: [ScoringModule, GamificationModule],
  controllers: [HabitsController],
  providers: [HabitsService],
  exports: [HabitsService],
})
export class HabitsModule {}
