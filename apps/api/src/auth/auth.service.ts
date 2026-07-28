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
import { requireSecret } from '../common/env';
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
        secret: requireSecret('JWT_REFRESH_SECRET'),
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
    //
    // deleteMany, not delete, and the count is the lock. Two requests can
    // arrive with the same valid token — a client waking several screens at
    // once — and exactly one of them deletes the row. The loser used to hit a
    // Prisma "record not found" and surface as a 500; it now gets a plain 401
    // and retries with whatever the winner stored.
    const { count } = await this.prisma.refreshToken.deleteMany({ where: { id: stored.id } });
    if (count === 0) throw new UnauthorizedException('Refresh token already used');

    return this.issueTokens(payload.sub, payload.email);
  }

  private async issueTokens(userId: string, email: string) {
    const accessToken = this.jwt.sign(
      { sub: userId, email },
      {
        secret: requireSecret('JWT_ACCESS_SECRET'),
        expiresIn: process.env.JWT_ACCESS_TTL ?? '15m',
      },
    );
    const refreshToken = this.jwt.sign(
      { sub: userId, email, jti: randomUUID() },
      {
        secret: requireSecret('JWT_REFRESH_SECRET'),
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
