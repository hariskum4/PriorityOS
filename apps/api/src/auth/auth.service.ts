import {
  Injectable,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { createHash, randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto, LoginDto } from './auth.dto';
import { ALL_DOMAINS } from '@priority/types';

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) throw new ConflictException('Email already registered');

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash: await argon2.hash(dto.password),
        fullName: dto.fullName,
        timezone: dto.timezone,
        preferences: { create: {} },
        gamification: { create: {} },
        // Pre-create the 10 life domains so scoring always has rows to update.
        lifeDomains: {
          create: ALL_DOMAINS.map((domainType) => ({ domainType })),
        },
      },
    });
    return this.issueTokens(user.id, user.email);
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (!user?.passwordHash) throw new UnauthorizedException('Invalid credentials');
    const ok = await argon2.verify(user.passwordHash, dto.password);
    if (!ok) throw new UnauthorizedException('Invalid credentials');
    return this.issueTokens(user.id, user.email);
  }

  async refresh(refreshToken: string) {
    let payload: { sub: string; email: string; jti: string };
    try {
      payload = this.jwt.verify(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET ?? 'dev-refresh',
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
    const stored = await this.prisma.refreshToken.findFirst({
      where: { userId: payload.sub, tokenHash: sha256(refreshToken) },
    });
    if (!stored || stored.expiresAt < new Date())
      throw new UnauthorizedException('Refresh token revoked or expired');

    // Rotation: revoke the used token, issue a new pair.
    await this.prisma.refreshToken.delete({ where: { id: stored.id } });
    return this.issueTokens(payload.sub, payload.email);
  }

  private async issueTokens(userId: string, email: string) {
    const accessToken = this.jwt.sign(
      { sub: userId, email },
      {
        secret: process.env.JWT_ACCESS_SECRET ?? 'dev-secret',
        expiresIn: process.env.JWT_ACCESS_TTL ?? '15m',
      },
    );
    const refreshToken = this.jwt.sign(
      { sub: userId, email, jti: randomUUID() },
      {
        secret: process.env.JWT_REFRESH_SECRET ?? 'dev-refresh',
        expiresIn: process.env.JWT_REFRESH_TTL ?? '30d',
      },
    );
    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: sha256(refreshToken),
        expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000),
      },
    });
    return { accessToken, refreshToken };
  }
}
