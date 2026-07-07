import {
  Body, Controller, Delete, Get, Param, Patch, Post, UseGuards,
} from '@nestjs/common';
import { JwtGuard } from '../auth/jwt.guard';
import { CurrentUser, JwtUser } from '../common/current-user.decorator';
import { RelationshipsService } from './relationships.service';

@UseGuards(JwtGuard)
@Controller('relationships')
export class RelationshipsController {
  constructor(private rels: RelationshipsService) {}

  @Get()
  list(@CurrentUser() u: JwtUser) {
    return this.rels.list(u.userId);
  }

  @Post()
  create(@CurrentUser() u: JwtUser, @Body() body: any) {
    return this.rels.create(u.userId, body);
  }

  @Patch(':id')
  update(@CurrentUser() u: JwtUser, @Param('id') id: string, @Body() body: any) {
    return this.rels.update(u.userId, id, body);
  }

  @Delete(':id')
  remove(@CurrentUser() u: JwtUser, @Param('id') id: string) {
    return this.rels.remove(u.userId, id);
  }

  @Post(':id/contact')
  logContact(
    @CurrentUser() u: JwtUser,
    @Param('id') id: string,
    @Body() body: { kind: 'call' | 'visit' | 'message' | 'activity'; note?: string },
  ) {
    return this.rels.logContact(u.userId, id, body.kind, body.note);
  }
}
