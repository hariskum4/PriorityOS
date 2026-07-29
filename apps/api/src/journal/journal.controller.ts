import {
  Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { JwtGuard } from '../auth/jwt.guard';
import { CurrentUser, JwtUser } from '../common/current-user.decorator';
import { JournalService } from './journal.service';

@UseGuards(JwtGuard)
@Controller('journal')
export class JournalController {
  constructor(private journal: JournalService) {}

  @Get()
  list(
    @CurrentUser() u: JwtUser,
    @Query('before') before?: string,
    @Query('take') take?: string,
  ) {
    return this.journal.list(u.userId, { before, take: take ? Number(take) : undefined });
  }

  @Post()
  create(@CurrentUser() u: JwtUser, @Body() body: any) {
    return this.journal.create(u.userId, body);
  }

  @Patch(':id')
  update(@CurrentUser() u: JwtUser, @Param('id') id: string, @Body() body: any) {
    return this.journal.update(u.userId, id, body);
  }

  /** Taking something back out is part of what makes it private. */
  @Delete(':id')
  remove(@CurrentUser() u: JwtUser, @Param('id') id: string) {
    return this.journal.remove(u.userId, id);
  }
}
