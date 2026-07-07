import { Module } from '@nestjs/common';
import { OnboardingController } from './onboarding.controller';
import { OnboardingService } from './onboarding.service';
import { ScoringModule } from '../scoring/scoring.module';
import { InsightsModule } from '../insights/insights.module';

@Module({
  imports: [ScoringModule, InsightsModule],
  controllers: [OnboardingController],
  providers: [OnboardingService],
})
export class OnboardingModule {}
