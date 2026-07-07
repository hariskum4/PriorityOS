import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtGuard } from '../auth/jwt.guard';
import { CurrentUser, JwtUser } from '../common/current-user.decorator';
import { PartnersService } from './partners.service';

@UseGuards(JwtGuard)
@Controller('partners')
export class PartnersController {
  constructor(private partners: PartnersService) {}

  @Get()
  list(@CurrentUser() u: JwtUser) {
    return this.partners.list(u.userId, u.email);
  }

  @Post('invite')
  invite(@CurrentUser() u: JwtUser, @Body() body: { email: string }) {
    return this.partners.invite(u.userId, body.email);
  }

  @Post(':id/accept')
  accept(@CurrentUser() u: JwtUser, @Param('id') id: string) {
    return this.partners.accept(u.userId, id);
  }
}
