/**
 * The way back in.
 *
 * A forgotten password used to be the end of the account. These pin down the
 * whole loop — code mailed, code checked, password replaced — and the ways it
 * must refuse: wrong codes burn attempts, five burns the code, a spent code
 * is spent for everyone, and asking about a stranger's email tells you
 * nothing you did not already know.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import * as argon2 from 'argon2';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import type { PrismaService } from '../src/prisma/prisma.service';
import { testPrisma, truncateAll } from './db';
import { AuthService } from '../src/auth/auth.service';
import type { MailService } from '../src/auth/mail.service';

let prisma: PrismaService;
let auth: AuthService;
let sent: { to: string; subject: string; text: string }[];

const mailStub = {
  send: async (to: string, subject: string, text: string) => {
    sent.push({ to, subject, text });
  },
};

/** The six digits that were actually mailed. */
const mailedCode = () => /\b(\d{6})\b/.exec(sent.at(-1)!.text)![1];

const EMAIL = 'meera@example.com';

beforeAll(async () => {
  process.env.DATA_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
  prisma = await testPrisma();
  auth = new AuthService(prisma, new JwtService({}), mailStub as MailService);
});

beforeEach(async () => {
  sent = [];
  await truncateAll(prisma);
  await prisma.user.create({
    data: {
      email: EMAIL,
      fullName: 'Meera Pillai',
      passwordHash: await argon2.hash('old-password'),
    },
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('asking for a code', () => {
  it('mails a six-digit code and stores only its hash', async () => {
    const res = await auth.forgotPassword(EMAIL);
    expect(res).toEqual({ ok: true });
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe(EMAIL);
    const code = mailedCode();
    const row = await prisma.passwordResetToken.findFirstOrThrow();
    expect(row.codeHash).not.toContain(code);
    expect(row.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('answers identically for an address that has no account', async () => {
    const res = await auth.forgotPassword('nobody@example.com');
    expect(res).toEqual({ ok: true });
    expect(sent).toHaveLength(0);
    expect(await prisma.passwordResetToken.count()).toBe(0);
  });

  it('a second request retires the first code', async () => {
    await auth.forgotPassword(EMAIL);
    const first = mailedCode();
    await auth.forgotPassword(EMAIL);
    expect(await prisma.passwordResetToken.count()).toBe(1);
    await expect(auth.resetPassword(EMAIL, first, 'brand-new-pass'))
      .rejects.toThrow(UnauthorizedException);
  });
});

describe('using the code', () => {
  it('replaces the password, signs the person in, and signs everyone else out', async () => {
    // A pre-existing session that knew the old password.
    await prisma.refreshToken.create({
      data: {
        userId: (await prisma.user.findUniqueOrThrow({ where: { email: EMAIL } })).id,
        tokenHash: 'stale-session',
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });

    await auth.forgotPassword(EMAIL);
    const tokens = await auth.resetPassword(EMAIL, mailedCode(), 'brand-new-pass');
    expect(tokens.accessToken).toBeTruthy();

    const user = await prisma.user.findUniqueOrThrow({ where: { email: EMAIL } });
    expect(await argon2.verify(user.passwordHash!, 'brand-new-pass')).toBe(true);
    expect(await argon2.verify(user.passwordHash!, 'old-password')).toBe(false);

    // The stale session is gone; only the freshly issued one remains.
    const remaining = await prisma.refreshToken.findMany();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].tokenHash).not.toBe('stale-session');
  });

  it('is single-use — the same code cannot reset twice', async () => {
    await auth.forgotPassword(EMAIL);
    const code = mailedCode();
    await auth.resetPassword(EMAIL, code, 'brand-new-pass');
    await expect(auth.resetPassword(EMAIL, code, 'another-pass'))
      .rejects.toThrow(UnauthorizedException);
  });

  it('burns after five wrong guesses, even if the sixth is right', async () => {
    await auth.forgotPassword(EMAIL);
    const code = mailedCode();
    const wrong = code === '000000' ? '000001' : '000000';
    for (let i = 0; i < 5; i++) {
      await expect(auth.resetPassword(EMAIL, wrong, 'x'.repeat(8)))
        .rejects.toThrow(UnauthorizedException);
    }
    await expect(auth.resetPassword(EMAIL, code, 'brand-new-pass'))
      .rejects.toThrow(UnauthorizedException);
  });

  it('rejects an expired code', async () => {
    await auth.forgotPassword(EMAIL);
    await prisma.passwordResetToken.updateMany({
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await expect(auth.resetPassword(EMAIL, mailedCode(), 'brand-new-pass'))
      .rejects.toThrow(UnauthorizedException);
  });

  it('rejects a code presented with the wrong email', async () => {
    await auth.forgotPassword(EMAIL);
    await expect(auth.resetPassword('nobody@example.com', mailedCode(), 'brand-new-pass'))
      .rejects.toThrow(UnauthorizedException);
  });
});
