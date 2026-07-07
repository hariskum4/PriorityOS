import {
  Body, Controller, Get, Param, Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { JwtGuard } from '../auth/jwt.guard';
import { CurrentUser, JwtUser } from '../common/current-user.decorator';
import { MissionsService } from './missions.service';

@UseGuards(JwtGuard)
@Controller('missions')
export class MissionsController {
  constructor(private missions: MissionsService) {}

  @Get()
  list(@CurrentUser() u: JwtUser, @Query('status') status?: string) {
    return this.missions.list(u.userId, status);
  }

  @Post()
  create(@CurrentUser() u: JwtUser, @Body() body: any) {
    return this.missions.create(u.userId, body);
  }

  @Patch(':id')
  update(@CurrentUser() u: JwtUser, @Param('id') id: string, @Body() body: any) {
    return this.missions.update(u.userId, id, body);
  }

  @Post(':id/complete')
  complete(@CurrentUser() u: JwtUser, @Param('id') id: string) {
    return this.missions.complete(u.userId, id);
  }

  @Post(':id/snooze')
  snooze(@CurrentUser() u: JwtUser, @Param('id') id: string) {
    return this.missions.snooze(u.userId, id);
  }
}
