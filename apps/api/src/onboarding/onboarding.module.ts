import { Module } from '@nestjs/common';
import { OnboardingController } from './onboarding.controller';
import { OnboardingService } from './onboarding.service';
import { ScoringModule } from '../scoring/scoring.module';
import { InsightsModule } from '../insights/insights.module';
import { LifeOsModule } from '../life-os/life-os.module';

@Module({
  imports: [ScoringModule, InsightsModule, LifeOsModule],
  controllers: [OnboardingController],
  providers: [OnboardingService],
})
export class OnboardingModule {}
