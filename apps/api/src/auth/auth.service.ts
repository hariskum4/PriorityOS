import {
  Injectable,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
/**
 * The prebuilt argon2, not the one that compiles itself.
 *
 * `argon2` is a native addon built with node-gyp at install time. That is
 * fine in a Docker image and impossible in a Vercel function, where there is
 * no compiler and the build machine's binary is not the one that runs. This
 * package ships prebuilt binaries per platform and needs no build step.
 *
 * The hashes are the same thing, which is the only reason this swap is safe.
 * Both write and read standard argon2id in PHC string format, so every
 * password already in the database keeps working — verified against a real
 * hash from the old library before this change was made, because the failure
 * mode is that nobody can log in and the plaintext to re-hash from is gone.
 *
 * The default cost changes with it: `argon2` used m=64MB/t=3/p=4, this uses
 * OWASP's current recommendation of m=19MB/t=2/p=1. Cheaper on purpose — the
 * old settings were most of why registering took seven seconds on a shared
 * CPU — and still the parameters the people who study this recommend. Old
 * hashes carry their own parameters in the string, so they continue to verify
 * at the cost they were written with.
 */
import { hash as argonHash, verify as argonVerify } from '@node-rs/argon2';
import { createHash, randomInt, randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto, LoginDto } from './auth.dto';
import { MailService } from './mail.service';
import { requireSecret, ttlToMs } from '../common/env';
import { ALL_DOMAINS } from '@priority/types';
import { countryFromTimezone } from '@priority/scoring-engine';

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

const RESET_CODE_TTL_MS = 15 * 60_000;
const RESET_MAX_ATTEMPTS = 5;

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private mail: MailService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) throw new ConflictException('Email already registered');

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash: await argonHash(dto.password),
        fullName: dto.fullName,
        timezone: dto.timezone,
        /* A fact the device already told us, read properly for once. It seeds
           the life-expectancy region and the AI's sense of place; the You tab
           can correct it, and an unrecognised zone stays honestly null. */
        country: countryFromTimezone(dto.timezone),
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
    const ok = await argonVerify(user.passwordHash, dto.password);
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

  /**
   * Always answers "sent" — whether or not the address exists. The difference
   * between "no such account" and "check your inbox" is a free directory of
   * every registered email, so both cases get the same reply and only one of
   * them gets a code.
   */
  async forgotPassword(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (user) {
      const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
      // One live code per account: a fresh request retires the old one.
      await this.prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });
      await this.prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          codeHash: sha256(code),
          expiresAt: new Date(Date.now() + RESET_CODE_TTL_MS),
        },
      });
      await this.mail.send(
        email,
        'Your Priority reset code',
        `Your password reset code is ${code}.\n\n`
        + 'It works for 15 minutes and only once. '
        + 'If you did not ask for it, you can ignore this — your password has not changed.',
      );
    }
    return { ok: true };
  }

  async resetPassword(email: string, code: string, password: string) {
    const invalid = () =>
      new UnauthorizedException('That code is not right, or it has expired.');

    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) throw invalid();

    const token = await this.prisma.passwordResetToken.findFirst({
      where: { userId: user.id, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!token || token.attempts >= RESET_MAX_ATTEMPTS) throw invalid();

    if (token.codeHash !== sha256(code)) {
      await this.prisma.passwordResetToken.update({
        where: { id: token.id },
        data: { attempts: { increment: 1 } },
      });
      throw invalid();
    }

    // deleteMany count-as-lock: two requests carrying the same correct code
    // race, exactly one delete wins, the other is told the code is spent.
    const { count } = await this.prisma.passwordResetToken.deleteMany({
      where: { id: token.id },
    });
    if (count === 0) throw invalid();

    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await argonHash(password) },
    });
    // Every session that knew the old password is out. Whoever holds the
    // inbox — presumably the owner — is in, freshly signed in below.
    await this.prisma.refreshToken.deleteMany({ where: { userId: user.id } });

    return this.issueTokens(user.id, user.email);
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
        // Same TTL string as the JWT above, so the row and the token expire
        // together no matter what the env var says.
        expiresAt: new Date(
          Date.now() + ttlToMs(process.env.JWT_REFRESH_TTL, 30 * 24 * 3600 * 1000),
        ),
      },
    });
    return { accessToken, refreshToken };
  }
}
