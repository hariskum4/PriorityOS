import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtGuard } from '../auth/jwt.guard';
import { CurrentUser, JwtUser } from '../common/current-user.decorator';
import { HabitsService } from './habits.service';

@UseGuards(JwtGuard)
@Controller('habits')
export class HabitsController {
  constructor(private habits: HabitsService) {}

  /**
   * Active rhythms by default — that is what the day screen ticks off.
   * `?all=1` includes retired ones, which the suggestion surfaces need: a
   * rhythm someone deliberately ended must never be offered back to them.
   */
  @Get()
  list(@CurrentUser() u: JwtUser, @Query('all') all?: string) {
    return this.habits.list(u.userId, all === '1' || all === 'true');
  }

  @Post()
  create(@CurrentUser() u: JwtUser, @Body() body: any) {
    return this.habits.create(u.userId, body);
  }

  @Post(':id/complete')
  complete(@CurrentUser() u: JwtUser, @Param('id') id: string, @Body() body: { note?: string }) {
    return this.habits.complete(u.userId, id, body?.note);
  }

  /** Untick today. The wrong row is easy to tap and midnight is a long wait. */
  @Post(':id/uncomplete')
  uncomplete(@CurrentUser() u: JwtUser, @Param('id') id: string) {
    return this.habits.uncomplete(u.userId, id);
  }

  @Post(':id/retire')
  retire(@CurrentUser() u: JwtUser, @Param('id') id: string) {
    return this.habits.retire(u.userId, id);
  }

  @Post(':id/restore')
  restore(@CurrentUser() u: JwtUser, @Param('id') id: string) {
    return this.habits.restore(u.userId, id);
  }
}
