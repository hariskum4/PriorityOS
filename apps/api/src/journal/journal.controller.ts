import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtGuard } from '../auth/jwt.guard';
import { CurrentUser, JwtUser } from '../common/current-user.decorator';
import { JournalService } from './journal.service';

@UseGuards(JwtGuard)
@Controller('journal')
export class JournalController {
  constructor(private journal: JournalService) {}

  @Get()
  list(@CurrentUser() u: JwtUser) {
    return this.journal.list(u.userId);
  }

  @Post()
  create(@CurrentUser() u: JwtUser, @Body() body: any) {
    return this.journal.create(u.userId, body);
  }
}
