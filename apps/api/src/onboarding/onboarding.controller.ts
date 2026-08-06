import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtGuard } from '../auth/jwt.guard';
import { CurrentUser, JwtUser } from '../common/current-user.decorator';
import { OnboardingService } from './onboarding.service';
import { SaveAnswersDto } from './onboarding.dto';

@UseGuards(JwtGuard)
@Controller('onboarding')
export class OnboardingController {
  constructor(private onboarding: OnboardingService) {}

  @Post('answers')
  save(
    @CurrentUser() u: JwtUser,
    @Body() body: SaveAnswersDto,
  ) {
    return this.onboarding.saveAnswers(u.userId, body.answers);
  }

  @Get('answers')
  get(@CurrentUser() u: JwtUser) {
    return this.onboarding.getAnswers(u.userId);
  }

  @Post('complete')
  complete(@CurrentUser() u: JwtUser) {
    return this.onboarding.complete(u.userId);
  }
}
