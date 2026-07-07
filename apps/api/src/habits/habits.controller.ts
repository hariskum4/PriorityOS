import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtGuard } from '../auth/jwt.guard';
import { CurrentUser, JwtUser } from '../common/current-user.decorator';
import { HabitsService } from './habits.service';

@UseGuards(JwtGuard)
@Controller('habits')
export class HabitsController {
  constructor(private habits: HabitsService) {}

  @Get()
  list(@CurrentUser() u: JwtUser) {
    return this.habits.list(u.userId);
  }

  @Post()
  create(@CurrentUser() u: JwtUser, @Body() body: any) {
    return this.habits.create(u.userId, body);
  }

  @Post(':id/complete')
  complete(@CurrentUser() u: JwtUser, @Param('id') id: string, @Body() body: { note?: string }) {
    return this.habits.complete(u.userId, id, body?.note);
  }
}
