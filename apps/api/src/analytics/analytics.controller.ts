import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtGuard } from '../auth/jwt.guard';
import { CurrentUser, JwtUser } from '../common/current-user.decorator';
import { AnalyticsService } from './analytics.service';

@UseGuards(JwtGuard)
@Controller('analytics')
export class AnalyticsController {
  constructor(private analytics: AnalyticsService) {}

  /** Client-only funnel steps (onboarding_started, app_opened, paywall_viewed). */
  @Post('event')
  track(@CurrentUser() u: JwtUser, @Body() body: { name: string; props?: Record<string, unknown> }) {
    return this.analytics.track(u.userId, body.name, body.props ?? {});
  }

  /** Founder metrics: funnel + D1/D7/D30 retention. */
  @Get('metrics')
  metrics() {
    return this.analytics.metrics();
  }
}
