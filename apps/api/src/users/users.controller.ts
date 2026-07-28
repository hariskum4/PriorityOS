import { Body, Controller, Delete, Get, Patch, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtGuard } from '../auth/jwt.guard';
import { CurrentUser, JwtUser } from '../common/current-user.decorator';
import { UsersService } from './users.service';

@UseGuards(JwtGuard)
@Controller()
export class UsersController {
  constructor(private users: UsersService) {}

  @Get('me')
  me(@CurrentUser() u: JwtUser) {
    return this.users.me(u.userId);
  }

  @Patch('me')
  update(@CurrentUser() u: JwtUser, @Body() body: Record<string, unknown>) {
    return this.users.update(u.userId, body);
  }

  @Get('me/preferences')
  prefs(@CurrentUser() u: JwtUser) {
    return this.users.preferences(u.userId);
  }

  @Patch('me/preferences')
  updatePrefs(@CurrentUser() u: JwtUser, @Body() body: Record<string, unknown>) {
    return this.users.updatePreferences(u.userId, body);
  }

  /** The whole archive, machine-readable. Rate-limited: it is an expensive read. */
  @Throttle({ default: { ttl: 60_000, limit: 3 } })
  @Get('me/export')
  exportAll(@CurrentUser() u: JwtUser) {
    return this.users.exportAll(u.userId);
  }

  /** Erase the account and everything under it. Requires the password again. */
  @Throttle({ default: { ttl: 60_000, limit: 3 } })
  @Delete('me')
  deleteMe(@CurrentUser() u: JwtUser, @Body() body: { password?: string }) {
    return this.users.deleteAccount(u.userId, body?.password ?? '');
  }
}
