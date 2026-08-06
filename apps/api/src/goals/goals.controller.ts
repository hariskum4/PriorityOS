import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtGuard } from '../auth/jwt.guard';
import { CurrentUser, JwtUser } from '../common/current-user.decorator';
import { GoalsService } from './goals.service';
import { CreateGoalDto, UpdateGoalDto } from './goals.dto';

@UseGuards(JwtGuard)
@Controller('goals')
export class GoalsController {
  constructor(private goals: GoalsService) {}

  @Get()
  list(@CurrentUser() u: JwtUser) {
    return this.goals.list(u.userId);
  }

  @Post()
  create(@CurrentUser() u: JwtUser, @Body() body: CreateGoalDto) {
    return this.goals.create(u.userId, body);
  }

  @Patch(':id')
  update(@CurrentUser() u: JwtUser, @Param('id') id: string, @Body() body: UpdateGoalDto) {
    return this.goals.update(u.userId, id, body);
  }

  @Delete(':id')
  remove(@CurrentUser() u: JwtUser, @Param('id') id: string) {
    return this.goals.remove(u.userId, id);
  }
}
