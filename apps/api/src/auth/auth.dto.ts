import { IsEmail, IsString, Matches, MinLength } from 'class-validator';

export class RegisterDto {
  @IsEmail() email: string;
  @IsString() @MinLength(8) password: string;
  @IsString() @MinLength(1) fullName: string;
  @IsString() timezone: string;
}

export class LoginDto {
  @IsEmail() email: string;
  @IsString() password: string;
}

export class RefreshDto {
  @IsString() refreshToken: string;
}

export class ForgotPasswordDto {
  @IsEmail() email: string;
}

export class ResetPasswordDto {
  @IsEmail() email: string;
  @Matches(/^\d{6}$/, { message: 'code must be the 6-digit number from the email' })
  code: string;
  @IsString() @MinLength(8) password: string;
}
