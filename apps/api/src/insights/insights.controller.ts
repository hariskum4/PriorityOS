import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtGuard } from '../auth/jwt.guard';
import { CurrentUser, JwtUser } from '../common/current-user.decorator';
import { InsightsService } from './insights.service';

@UseGuards(JwtGuard)
@Controller('insights')
export class InsightsController {
  constructor(private insights: InsightsService) {}

  @Get('opportunities')
  list(@CurrentUser() u: JwtUser) {
    return this.insights.list(u.userId);
  }

  @Post('opportunities/:id/dismiss')
  dismiss(@CurrentUser() u: JwtUser, @Param('id') id: string) {
    return this.insights.dismiss(u.userId, id);
  }
}
