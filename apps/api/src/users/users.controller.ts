import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
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
}
