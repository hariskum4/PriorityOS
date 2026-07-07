import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtGuard } from '../auth/jwt.guard';
import { CurrentUser, JwtUser } from '../common/current-user.decorator';
import { WeeklyReviewService } from './weekly-review.service';

@UseGuards(JwtGuard)
@Controller('weekly-review')
export class WeeklyReviewController {
  constructor(private reviews: WeeklyReviewService) {}

  @Get('current')
  current(@CurrentUser() u: JwtUser) {
    return this.reviews.current(u.userId);
  }

  @Post('generate')
  generate(@CurrentUser() u: JwtUser) {
    return this.reviews.generate(u.userId);
  }

  @Post('session')
  completeSession(@CurrentUser() u: JwtUser, @Body() body: any) {
    return this.reviews.completeSession(u.userId, body ?? {});
  }

  @Post('acknowledge')
  acknowledge(@CurrentUser() u: JwtUser) {
    return this.reviews.acknowledge(u.userId);
  }
}
