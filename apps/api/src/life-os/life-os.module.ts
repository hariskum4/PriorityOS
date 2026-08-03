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

/**
 * The Life OS host module.
 *
 * Exports the service so other modules (Dashboard, Notifications) can run a
 * cycle without going through HTTP.
 */
@Module({
  controllers: [LifeOsController],
  providers: [
    LifeOsService, LifeOsJobs, LifeDocumentService,
    LifeTimelineService, LifeOrganismService, StacksService, FocusService,
    RhythmsService,
  ],
  exports: [
    LifeOsService, LifeDocumentService, LifeTimelineService,
    LifeOrganismService, StacksService, FocusService, RhythmsService,
  ],
})
export class LifeOsModule {}
