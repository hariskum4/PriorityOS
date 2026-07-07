import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtGuard } from '../auth/jwt.guard';
import { CurrentUser, JwtUser } from '../common/current-user.decorator';
import { NotificationsService } from './notifications.service';

@UseGuards(JwtGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private notifications: NotificationsService) {}

  @Get()
  list(@CurrentUser() u: JwtUser) {
    return this.notifications.list(u.userId);
  }

  @Post(':id/read')
  read(@CurrentUser() u: JwtUser, @Param('id') id: string) {
    return this.notifications.markRead(u.userId, id);
  }
}
