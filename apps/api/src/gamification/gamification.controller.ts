import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtGuard } from '../auth/jwt.guard';
import { CurrentUser, JwtUser } from '../common/current-user.decorator';
import { GamificationService } from './gamification.service';

@UseGuards(JwtGuard)
@Controller('gamification')
export class GamificationController {
  constructor(private game: GamificationService) {}

  @Get('profile')
  profile(@CurrentUser() u: JwtUser) {
    return this.game.profile(u.userId);
  }

  @Get('domain-xp')
  domainXp(@CurrentUser() u: JwtUser) {
    return this.game.domainXp(u.userId);
  }
}
