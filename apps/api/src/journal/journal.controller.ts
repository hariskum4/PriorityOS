import {
  Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { JwtGuard } from '../auth/jwt.guard';
import { CurrentUser, JwtUser } from '../common/current-user.decorator';
import { JournalService } from './journal.service';
import { CreateJournalEntryDto, UpdateJournalEntryDto } from './journal.dto';
import { DraftJournalDto } from './journal-draft.dto';

@UseGuards(JwtGuard)
@Controller('journal')
export class JournalController {
  constructor(private journal: JournalService) {}

  /**
   * A first line for an entry about something just finished.
   *
   * Drafts only — nothing is written here. The reader gets a sentence in the
   * composer they can accept, rewrite or clear, and the entry is saved by the
   * ordinary POST below like any other. An app that wrote the journal itself
   * would be keeping its own diary about somebody else's life.
   */
  @Post('draft')
  draft(@CurrentUser() u: JwtUser, @Body() body: DraftJournalDto) {
    return this.journal.draft(u.userId, body);
  }

  @Get()
  list(
    @CurrentUser() u: JwtUser,
    @Query('before') before?: string,
    @Query('take') take?: string,
  ) {
    return this.journal.list(u.userId, { before, take: take ? Number(take) : undefined });
  }

  @Post()
  create(@CurrentUser() u: JwtUser, @Body() body: CreateJournalEntryDto) {
    return this.journal.create(u.userId, body);
  }

  @Patch(':id')
  update(@CurrentUser() u: JwtUser, @Param('id') id: string, @Body() body: UpdateJournalEntryDto) {
    return this.journal.update(u.userId, id, body);
  }

  /** Taking something back out is part of what makes it private. */
  @Delete(':id')
  remove(@CurrentUser() u: JwtUser, @Param('id') id: string) {
    return this.journal.remove(u.userId, id);
  }
}
