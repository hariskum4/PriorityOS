import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { JwtGuard } from '../auth/jwt.guard';
import { CurrentUser, JwtUser } from '../common/current-user.decorator';
import { MemoriesService } from './memories.service';

@UseGuards(JwtGuard)
@Controller('memories')
export class MemoriesController {
  constructor(private memories: MemoriesService) {}

  @Get()
  list(
    @CurrentUser() u: JwtUser,
    @Query('person') person?: string,
    @Query('countKey') countKey?: string,
  ) {
    return this.memories.list(u.userId, { person, countKey });
  }

  @Get('on-this-day')
  onThisDay(@CurrentUser() u: JwtUser) {
    return this.memories.onThisDay(u.userId);
  }

  @Get('counts-summary')
  countsSummary(@CurrentUser() u: JwtUser) {
    return this.memories.countsSummary(u.userId);
  }

  @Post()
  create(@CurrentUser() u: JwtUser, @Body() body: any) {
    return this.memories.create(u.userId, body ?? {});
  }
}
