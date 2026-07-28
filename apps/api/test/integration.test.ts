/**
 * The half a mock cannot test.
 *
 * Every bug in this file's remit was one a mocked Prisma would have cheerfully
 * agreed did not exist: a unique index that was never created, a rotation that
 * raced two callers against one row, an encryption hook that has to fire on
 * every call site including the ones written next year. These talk to Postgres.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { JwtService } from '@nestjs/jwt';
import type { PrismaService } from '../src/prisma/prisma.service';
import { testPrisma, truncateAll } from './db';
import { AuthService } from '../src/auth/auth.service';
import { UsersService } from '../src/users/users.service';
import { RelationshipsService } from '../src/relationships/relationships.service';

let prisma: PrismaService;
let auth: AuthService;
let users: UsersService;
let people: RelationshipsService;

/** Relationships reach for the model to write a nudge; tests must not. */
const aiStub = { generate: async (_u: string, _k: string, _t: unknown, _c: unknown, fallback: unknown) => fallback };

beforeAll(async () => {
  process.env.JWT_ACCESS_SECRET = 'test-access-secret';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
  process.env.DATA_ENCRYPTION_KEY = Buffer.alloc(32, 3).toString('base64');

  prisma = await testPrisma();
  auth = new AuthService(prisma, new JwtService({}));
  users = new UsersService(prisma);
  people = new RelationshipsService(prisma, aiStub as never);
});

beforeEach(() => truncateAll(prisma));
afterAll(() => prisma.$disconnect());

const register = () => auth.register({
  email: `person-${Math.random().toString(36).slice(2)}@example.com`,
  password: 'a-real-password',
  fullName: 'Test Person',
  timezone: 'Asia/Kolkata',
} as never);

async function newUser() {
  const tokens = await register();
  const decoded = new JwtService({}).decode(tokens.accessToken) as { sub: string };
  return { userId: decoded.sub, tokens };
}

describe('refresh token rotation', () => {
  it('lets exactly one of two simultaneous refreshes win', async () => {
    /**
     * The bug this pins: several screens waking at once each sent a refresh,
     * the first deleted the row, and the rest hit a Prisma "record not found"
     * that surfaced as a 500. One winner, clean failures, no crash.
     */
    const { tokens } = await newUser();

    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => auth.refresh(tokens.refreshToken)),
    );

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    for (const r of results) {
      if (r.status === 'rejected') expect(r.reason?.status).toBe(401);
    }
  });

  it('will not accept a token that has already been rotated', async () => {
    const { tokens } = await newUser();
    await auth.refresh(tokens.refreshToken);
    await expect(auth.refresh(tokens.refreshToken)).rejects.toThrow();
  });

  it('issues a usable new pair to the winner', async () => {
    const { tokens } = await newUser();
    const next = await auth.refresh(tokens.refreshToken);
    expect(next.refreshToken).not.toBe(tokens.refreshToken);
    await expect(auth.refresh(next.refreshToken)).resolves.toBeTruthy();
  });
});

describe('one person, one row', () => {
  it('updates in place instead of creating a second mother', async () => {
    const { userId } = await newUser();

    await people.create(userId, { name: 'Amma', relationType: 'mother', closenessScore: 8 });
    await people.create(userId, { name: 'amma', relationType: 'mother', city: 'Ranchi' });

    const rows = await prisma.relationship.findMany({ where: { userId } });
    expect(rows).toHaveLength(1);
    expect(rows[0].city).toBe('Ranchi');
    // The second entry said nothing about closeness; it must not have erased it.
    expect(rows[0].closenessScore).toBe(8);
  });

  it('is enforced by the database, not only by the service', async () => {
    const { userId } = await newUser();
    await people.create(userId, { name: 'Appa', relationType: 'father' });

    await expect(
      prisma.relationship.create({
        data: { userId, name: 'APPA', relationType: 'father' },
      }),
    ).rejects.toThrow();
  });

  it('still lets two different people share a name', async () => {
    const { userId } = await newUser();
    await people.create(userId, { name: 'Jai', relationType: 'mother' });
    await people.create(userId, { name: 'Jai', relationType: 'friend' });
    expect(await prisma.relationship.count({ where: { userId } })).toBe(2);
  });

  it('does not collide across users', async () => {
    const a = await newUser();
    const b = await newUser();
    await people.create(a.userId, { name: 'Amma', relationType: 'mother' });
    await people.create(b.userId, { name: 'Amma', relationType: 'mother' });
    expect(await prisma.relationship.count()).toBe(2);
  });
});

describe('encryption at rest', () => {
  it('writes ciphertext to the column and reads back the sentence', async () => {
    const { userId } = await newUser();
    const secret = 'I have not told anyone that I am frightened';

    await prisma.journalEntry.create({ data: { userId, whatMattered: secret } });

    // Through Prisma: the person's own words.
    const read = await prisma.journalEntry.findFirst({ where: { userId } });
    expect(read?.whatMattered).toBe(secret);

    // Straight from Postgres, bypassing the middleware: nothing readable.
    const raw = await prisma.$queryRawUnsafe<Array<{ whatMattered: string }>>(
      'SELECT "whatMattered" FROM "JournalEntry" WHERE "userId" = $1',
      userId,
    );
    expect(raw[0].whatMattered).toMatch(/^enc:v1:/);
    expect(raw[0].whatMattered).not.toContain('frightened');
  });

  it('covers updates, not just the first write', async () => {
    const { userId } = await newUser();
    const entry = await prisma.journalEntry.create({ data: { userId, whatMattered: 'first' } });
    await prisma.journalEntry.update({
      where: { id: entry.id },
      data: { whatMattered: 'the thing I actually meant' },
    });

    const raw = await prisma.$queryRawUnsafe<Array<{ whatMattered: string }>>(
      'SELECT "whatMattered" FROM "JournalEntry" WHERE "id" = $1',
      entry.id,
    );
    expect(raw[0].whatMattered).not.toContain('actually meant');
    const read = await prisma.journalEntry.findUnique({ where: { id: entry.id } });
    expect(read?.whatMattered).toBe('the thing I actually meant');
  });

  it('decrypts inside lists as well as single rows', async () => {
    const { userId } = await newUser();
    await prisma.journalEntry.createMany({
      data: [
        { userId, whatMattered: 'one' },
        { userId, whatMattered: 'two' },
      ],
    });
    const rows = await prisma.journalEntry.findMany({ where: { userId } });
    expect(rows.map((r) => r.whatMattered).sort()).toEqual(['one', 'two']);
  });

  it('leaves plaintext written before encryption existed readable', async () => {
    const { userId } = await newUser();
    const entry = await prisma.journalEntry.create({ data: { userId, whatMattered: 'x' } });
    await prisma.$executeRawUnsafe(
      'UPDATE "JournalEntry" SET "whatMattered" = $1 WHERE "id" = $2',
      'an old row from before any of this',
      entry.id,
    );
    const read = await prisma.journalEntry.findUnique({ where: { id: entry.id } });
    expect(read?.whatMattered).toBe('an old row from before any of this');
  });
});

describe('leaving', () => {
  it('exports every collection without exporting credentials', async () => {
    const { userId } = await newUser();
    await people.create(userId, { name: 'Priya', relationType: 'spouse' });
    await prisma.journalEntry.create({ data: { userId, whatMattered: 'a good week' } });

    const archive = await users.exportAll(userId);
    const serialised = JSON.stringify(archive);

    expect(archive.format).toBe('priority-archive');
    expect(archive.relationships).toHaveLength(1);
    expect(archive.journal[0].whatMattered).toBe('a good week');
    expect(serialised).not.toContain('passwordHash');
    expect(serialised).not.toContain('tokenHash');
  });

  it('refuses to erase an account on a wrong password', async () => {
    const { userId } = await newUser();
    await expect(users.deleteAccount(userId, 'not-the-password')).rejects.toThrow();
    expect(await prisma.user.count()).toBe(1);
  });

  it('erases everything the user owns when the password is right', async () => {
    const { userId } = await newUser();
    await people.create(userId, { name: 'Meera', relationType: 'child' });
    await prisma.journalEntry.create({ data: { userId, whatMattered: 'goodbye' } });

    await users.deleteAccount(userId, 'a-real-password');

    expect(await prisma.user.count()).toBe(0);
    expect(await prisma.relationship.count()).toBe(0);
    expect(await prisma.journalEntry.count()).toBe(0);
    expect(await prisma.refreshToken.count()).toBe(0);
  });
});

describe('moments outlive people', () => {
  it('keeps the name on a memory after the person is deleted', async () => {
    const { userId } = await newUser();
    const person = await people.create(userId, { name: 'Amma', relationType: 'mother' });

    await prisma.memory.create({
      data: {
        userId,
        relationshipId: person.id,
        title: 'The afternoon by the river',
        occurredAt: new Date('2019-04-02'),
      },
    });

    await people.remove(userId, person.id);

    const memory = await prisma.memory.findFirst({ where: { userId } });
    expect(memory?.title).toBe('The afternoon by the river');
    expect(memory?.relationshipId).toBeNull();
    // Without the snapshot this moment would have no subject at all.
    expect(memory?.personName).toBe('Amma');
  });
});
