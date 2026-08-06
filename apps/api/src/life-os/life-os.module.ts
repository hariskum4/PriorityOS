import { Module } from '@nestjs/common';
import { LifeOsController } from './life-os.controller';
import { LifeOsService } from './life-os.service';
import { LifeOsJobs } from './life-os.jobs';
import { LifeDocumentService } from './life-document.service';
import { LifeTimelineService } from './life-timeline.service';
import { LifeOrganismService } from './life-organism.service';
import { StacksService } from './stacks.service';
import { RhythmsService } from './rhythms.service';
import { FocusService } from './focus.service';
import { BlueprintService } from './blueprint.service';
import { RankingService } from './ranking.service';
import { DigestService } from './digest.service';
import { ScoringModule } from '../scoring/scoring.module';

/**
 * The Life OS host module.
 *
 * Exports the service so other modules (Dashboard, Notifications) can run a
 * cycle without going through HTTP.
 */
@Module({
  imports: [ScoringModule],
  controllers: [LifeOsController],
  providers: [
    LifeOsService, LifeOsJobs, LifeDocumentService,
    LifeTimelineService, LifeOrganismService, StacksService, FocusService,
    RhythmsService, BlueprintService, RankingService, DigestService,
  ],
  exports: [
    LifeOsService, LifeDocumentService, LifeTimelineService,
    LifeOrganismService, StacksService, FocusService, RhythmsService,
    BlueprintService, DigestService,
  ],
})
export class LifeOsModule {}
