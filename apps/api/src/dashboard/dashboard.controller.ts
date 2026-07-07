import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtGuard } from '../auth/jwt.guard';
import { CurrentUser, JwtUser } from '../common/current-user.decorator';
import { DashboardService } from './dashboard.service';

@UseGuards(JwtGuard)
@Controller()
export class DashboardController {
  constructor(private dashboard: DashboardService) {}

  @Get('dashboard')
  get(@CurrentUser() u: JwtUser) {
    return this.dashboard.get(u.userId);
  }

  @Get('recommendations/today')
  today(@CurrentUser() u: JwtUser) {
    return this.dashboard.today(u.userId);
  }
}
