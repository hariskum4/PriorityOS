import { Module } from '@nestjs/common';
import { LifeOsController } from './life-os.controller';
import { LifeOsService } from './life-os.service';
import { LifeOsJobs } from './life-os.jobs';
import { LifeDocumentService } from './life-document.service';
import { LifeTimelineService } from './life-timeline.service';
import { LifeOrganismService } from './life-organism.service';

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
    LifeTimelineService, LifeOrganismService,
  ],
  exports: [LifeOsService, LifeDocumentService, LifeTimelineService, LifeOrganismService],
})
export class LifeOsModule {}
