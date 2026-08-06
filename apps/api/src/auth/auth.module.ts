import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthJobsService } from './auth.jobs';
import { MailService } from './mail.service';
import { JwtStrategy } from './jwt.strategy';

@Module({
  imports: [PassportModule, JwtModule.register({})],
  controllers: [AuthController],
  providers: [AuthService, AuthJobsService, MailService, JwtStrategy],
  exports: [AuthJobsService, AuthService],
})
export class AuthModule {}
