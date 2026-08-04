import { Module } from '@nestjs/common';
import { MissionsController } from './missions.controller';
import { MissionsService } from './missions.service';
import { ScoringModule } from '../scoring/scoring.module';
import { GamificationModule } from '../gamification/gamification.module';
import { RelationshipsModule } from '../relationships/relationships.module';

@Module({
  imports: [ScoringModule, GamificationModule, RelationshipsModule],
  controllers: [MissionsController],
  providers: [MissionsService],
  exports: [MissionsService],
})
export class MissionsModule {}
