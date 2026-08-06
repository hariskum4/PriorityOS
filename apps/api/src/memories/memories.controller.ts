import {
  Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { JwtGuard } from '../auth/jwt.guard';
import { CurrentUser, JwtUser } from '../common/current-user.decorator';
import { MemoriesService } from './memories.service';
import { CreateMemoryDto, UpdateMemoryDto } from './memories.dto';

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

  /** Untagged archive moments that look like a ritual already being counted. */
  @Get('count-candidates')
  countCandidates(@CurrentUser() u: JwtUser) {
    return this.memories.countCandidates(u.userId);
  }

  /** Recurring words in untagged moments — things done and never counted. */
  @Get('archive-themes')
  archiveThemes(@CurrentUser() u: JwtUser) {
    return this.memories.archiveThemes(u.userId);
  }

  @Post('count-attach')
  attachToCount(
    @CurrentUser() u: JwtUser,
    @Body() body: { countKey: string; memoryIds: string[] },
  ) {
    return this.memories.attachToCount(u.userId, body?.countKey, body?.memoryIds ?? []);
  }

  @Post()
  create(@CurrentUser() u: JwtUser, @Body() body: CreateMemoryDto) {
    return this.memories.create(u.userId, body ?? {});
  }

  @Patch(':id')
  update(@CurrentUser() u: JwtUser, @Param('id') id: string, @Body() body: UpdateMemoryDto) {
    return this.memories.update(u.userId, id, body ?? {});
  }

  @Delete(':id')
  remove(@CurrentUser() u: JwtUser, @Param('id') id: string) {
    return this.memories.remove(u.userId, id);
  }
}
