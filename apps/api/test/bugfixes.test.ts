/**
 * Regressions from the launch-readiness simulation (2026-08-04).
 *
 * Each of these encodes a bug that was reproduced against the running API by
 * driving it as a user would: a person added and never nudged, a double-tap
 * that paid twice, a completed call that left the urgency shouting, a 500
 * where a 400 should have named the field, and a token table that only grew.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { validateSync } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../src/prisma/prisma.service';
import { testPrisma, truncateAll } from './db';
import { RelationshipsService } from '../src/relationships/relationships.service';
import { MissionsService } from '../src/missions/missions.service';
import { AuthJobsService } from '../src/auth/auth.jobs';
import { UsersService } from '../src/users/users.service';
import { normalizeDomains, OnboardingService } from '../src/onboarding/onboarding.service';
import { ALL_DOMAINS } from '@priority/types';
import { ttlToMs } from '../src/common/env';
import { CreateRelationshipDto } from '../src/relationships/relationships.dto';
import { CreateJournalEntryDto } from '../src/journal/journal.dto';
import { CreateMissionDto } from '../src/missions/missions.dto';

let prisma: PrismaService;
let people: RelationshipsService;
let missions: MissionsService;
let userId: string;
let awards: number;

const aiStub = {
  generate: async (_u: string, _k: string, _t: unknown, _c: unknown, fb: unknown) => fb,
};
const scoringStub = { recalcUserDomains: async () => {} };
const analyticsStub = { track: async () => {} };
const gameStub = {
  award: async () => {
    awards++;
    return { amount: 25, totalXp: 25, level: 1, newBadges: [] };
  },
};

/** Amma as onboarding creates her: close, wanted weekly, never yet contacted. */
const AMMA = {
  name: 'Amma',
  relationType: 'mother',
  age: 58,
  closenessScore: 9,
  desiredCallFrequency: 'weekly',
  wantsMoreTime: true,
};

beforeAll(async () => {
  process.env.DATA_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
  prisma = await testPrisma();
  people = new RelationshipsService(prisma, aiStub as never);
  missions = new MissionsService(
    prisma,
    scoringStub as never,
    gameStub as never,
    analyticsStub as never,
    aiStub as never,
    people,
  );
});

beforeEach(async () => {
  awards = 0;
  await truncateAll(prisma);
  const user = await prisma.user.create({
    data: {
      email: `bugfix-${Math.random().toString(36).slice(2)}@example.com`,
      fullName: 'Test',
      timezone: 'UTC',
    },
  });
  userId = user.id;
});

afterAll(() => prisma.$disconnect());

describe('a new person is urgent from the moment they exist', () => {
  it('scores on create, not on first contact', async () => {
    const rel = await people.create(userId, AMMA);
    // Never contacted + wants weekly + close + aging parent: well past the
    // cron's 70 gate — the exact profile that used to sit at 0 forever.
    expect(Number(rel!.priorityScore)).toBeGreaterThanOrEqual(70);
  });

  it('re-scores on update', async () => {
    const rel = await people.create(userId, AMMA);
    const cooled = await people.update(userId, rel!.id, {
      wantsMoreTime: false,
      closenessScore: 2,
    });
    expect(Number(cooled!.priorityScore)).toBeLessThan(Number(rel!.priorityScore));
  });

  it('hands back the re-scored row from a one-tap contact log', async () => {
    const rel = await people.create(userId, AMMA);
    const after = await people.logContact(userId, rel!.id, 'call');
    // Contact today: no longer overdue, so urgency must drop, visibly, now.
    expect(Number(after!.priorityScore)).toBeLessThan(Number(rel!.priorityScore));
    expect(after!.lastContactAt).not.toBeNull();
  });
});

describe('completing a mission pays exactly once', () => {
  it('second complete is a no-op with the same shape', async () => {
    const m = await missions.create(userId, { title: 'Call Amma', domainType: 'family' });
    const first = await missions.complete(userId, m.id);
    const second = await missions.complete(userId, m.id);
    expect(first.xp).not.toBeNull();
    expect(second.xp).toBeNull();
    expect(second.next).toBeNull();
    expect(second.mission.status).toBe('completed');
    expect(awards).toBe(1);
  });

  it('two concurrent taps award once and log one contact', async () => {
    const rel = await people.create(userId, AMMA);
    const m = await missions.create(userId, {
      title: 'Video call with Amma',
      domainType: 'family',
      relationshipId: rel!.id,
    });
    const [a, b] = await Promise.all([
      missions.complete(userId, m.id),
      missions.complete(userId, m.id),
    ]);
    const winners = [a, b].filter((r) => r.xp !== null);
    expect(winners).toHaveLength(1);
    expect(await prisma.contactLog.count({ where: { relationshipId: rel!.id } })).toBe(1);
  });

  it('a linked complete refreshes the person’s urgency, not just their date', async () => {
    const rel = await people.create(userId, AMMA);
    const before = Number(rel!.priorityScore);
    const m = await missions.create(userId, {
      title: 'Video call with Amma',
      domainType: 'family',
      relationshipId: rel!.id,
    });
    await missions.complete(userId, m.id);
    const after = await prisma.relationship.findUniqueOrThrow({ where: { id: rel!.id } });
    expect(after.lastContactAt).not.toBeNull();
    expect(Number(after.priorityScore)).toBeLessThan(before);
  });

  it('refuses a mission linked to somebody else’s person', async () => {
    const stranger = await prisma.user.create({
      data: { email: `s-${Math.random().toString(36).slice(2)}@example.com`, fullName: 'S', timezone: 'UTC' },
    });
    const theirs = await people.create(stranger.id, AMMA);
    await expect(
      missions.create(userId, {
        title: 'Call their Amma',
        domainType: 'family',
        relationshipId: theirs!.id,
      }),
    ).rejects.toThrow(NotFoundException);
  });
});

describe('requests that are wrong get told, not 500', () => {
  it('a relationship without a relationType fails validation by name', () => {
    const dto = plainToInstance(CreateRelationshipDto, { name: 'Amma' });
    const errors = validateSync(dto);
    expect(errors.map((e) => e.property)).toContain('relationType');
  });

  it('a journal mood must be the 1–5 the schema has always meant', () => {
    const dto = plainToInstance(CreateJournalEntryDto, { mood: 'mixed' });
    expect(validateSync(dto).map((e) => e.property)).toContain('mood');
    const ok = plainToInstance(CreateJournalEntryDto, { mood: 3 });
    expect(validateSync(ok)).toHaveLength(0);
  });

  it('a mission domain must be one the engine can score', () => {
    const dto = plainToInstance(CreateMissionDto, { title: 'x', domainType: 'vibes' });
    expect(validateSync(dto).map((e) => e.property)).toContain('domainType');
  });

  /**
   * Quiet hours are non-nullable Int columns with defaults, so there is no
   * unsetting one — and a null went to Prisma unchecked and came back a 500,
   * an unhandled server error for a client mistake. Found by trying to undo a
   * test edit on the demo account.
   */
  it('an hour that is not an hour is a 400, not a crash', async () => {
    const users = new UsersService(prisma);
    await prisma.userPreferences.upsert({
      where: { userId }, create: { userId }, update: {},
    });
    // Thrown synchronously, before any query runs — the request never
    // reaches Prisma, which is the whole point.
    for (const bad of [null, 24, -1, 'evening', 9.5]) {
      expect(
        () => users.updatePreferences(userId, { quietHoursStart: bad }),
      ).toThrow(/between 0 and 23/);
    }
    // 0 is midnight and is a real answer; 23 is the last hour there is.
    for (const good of [0, 9, 23]) {
      const r = await users.updatePreferences(userId, { quietHoursStart: good });
      expect(r.quietHoursStart).toBe(good);
    }
  });
});

describe('a name typed lowercase renders as a name', () => {
  it('title-cases fully-lowercase input', async () => {
    const rel = await people.create(userId, { name: 'harish kumar', relationType: 'friend' });
    expect(rel!.name).toBe('Harish Kumar');
  });
  it('never argues with deliberate casing', async () => {
    const rel = await people.create(userId, { name: 'Ana de Souza', relationType: 'friend' });
    expect(rel!.name).toBe('Ana de Souza');
  });
});

describe('domain names people actually use still rank', () => {
  it('maps the common variants onto canonical slugs, in order', () => {
    expect(normalizeDomains(['family', 'finances', 'friendships', 'personal growth']))
      .toEqual(['family', 'finance', 'friends', 'growth']);
  });
  it('drops what it cannot resolve without dropping the rest', () => {
    expect(normalizeDomains(['vibes', 'health'])).toEqual(['health']);
    expect(normalizeDomains('not-an-array')).toEqual([]);
  });
});

describe('refresh tokens die on schedule', () => {
  it('the sweep removes expired rows and keeps live ones', async () => {
    await prisma.refreshToken.createMany({
      data: [
        { userId, tokenHash: 'dead', expiresAt: new Date(Date.now() - 1000) },
        { userId, tokenHash: 'live', expiresAt: new Date(Date.now() + 3_600_000) },
      ],
    });
    await new AuthJobsService(prisma).pruneExpiredRefreshTokens();
    const left = await prisma.refreshToken.findMany({ where: { userId } });
    expect(left.map((t) => t.tokenHash)).toEqual(['live']);
  });

  it('the stored row expiry follows the same TTL string as the JWT', () => {
    expect(ttlToMs('30d', 0)).toBe(30 * 86_400_000);
    expect(ttlToMs('12h', 0)).toBe(12 * 3_600_000);
    expect(ttlToMs('900s', 0)).toBe(900_000);
    expect(ttlToMs('900', 0)).toBe(900_000); // bare number = seconds, as jsonwebtoken reads it
    expect(ttlToMs('nonsense', 123)).toBe(123);
    expect(ttlToMs(undefined, 123)).toBe(123);
  });
});

/**
 * The Life Reveal used to open with "rated yourself 5/5 on actually living
 * it — that distance is the whole story" for every score, because the
 * sentence was written for the drifting case and applied to all of them.
 * Onboarding could also produce the score and the contradiction together:
 * the old "what's drifting?" screen asked the same question the 1-5 scores
 * had just answered, and nothing reconciled the two.
 */
describe('the reveal reads the number it quotes', () => {
  const reveal = async (
    reality: Record<string, number>,
    neglected: string[] = [],
    extraAnswers: { section: string; key: string; value: unknown }[] = [],
  ) => {
    const svc = new OnboardingService(
      prisma,
      scoringStub as never,
      { regenerateForUser: async () => {} } as never,
      aiStub as never,
      analyticsStub as never,
      /* Deliberately a blueprint that throws. Writing a personal catalog runs
         behind the Reveal and must never be able to cost somebody theirs —
         if that stops being true, these tests are where it shows. */
      { refresh: () => { throw new Error('blueprint down'); } } as never,
    );
    await svc.saveAnswers(userId, [
      { section: 'values', key: 'priorityRanking', value: ['health', 'family', 'career'] },
      { section: 'values', key: 'currentReality', value: reality },
      { section: 'values', key: 'neglectedDomains', value: neglected },
      ...extraAnswers,
    ]);
    return (await svc.complete(userId)).reveal as { narrative: string; driftWarning: string };
  };

  it('does not call a top score a distance', async () => {
    const r = await reveal({ health: 5, family: 5, career: 5 });
    expect(r.narrative).toContain('already living it 5/5');
    expect(r.narrative).not.toContain('That distance is the whole story');
  });

  it('still names the gap when the score is genuinely low', async () => {
    const r = await reveal({ health: 2, family: 4, career: 3 }, ['health']);
    expect(r.narrative).toContain('2/5');
    expect(r.narrative).toContain('That distance is the whole story');
    expect(r.driftWarning).toContain('You rated health 2/5');
  });

  it('does not claim they flagged a screen that no longer exists', async () => {
    const r = await reveal({ health: 1, family: 4, career: 3 }, ['health']);
    expect(r.driftWarning).not.toContain('flagged');
  });

  it('describes an unscored slipping area as named, not rated', async () => {
    const r = await reveal({ health: 4, family: 4, career: 3 }, ['friends']);
    expect(r.driftWarning).toContain('You named friends as slipping');
  });

  it('calls the middle the middle', async () => {
    const r = await reveal({ health: 3, family: 3, career: 3 });
    expect(r.narrative).toContain('the honest middle');
  });

  it('a fully-lived top domain is never also the drift warning', async () => {
    const r = await reveal({ health: 5, family: 5, career: 5 });
    expect(r.driftWarning).not.toContain('health');
  });

  /**
   * The first mission has to be postable.
   *
   * This screen is the only place a new account gets a mission, and the
   * client used to read the domain off the end of the sentence. Once the
   * options became personal their last words were "enough", "times" and
   * "1/5"; every POST failed validation, a bare catch swallowed it, and the
   * account arrived at an empty Today. So the assertion is not about wording
   * — it is that every option carries a domain the API will actually accept.
   */
  it('every first-week option carries a real domain, not a parsed one', async () => {
    const r = await reveal({ health: 1, family: 4, career: 3 }, ['health']) as any;
    const options = r.firstWeekFocus as Array<{ title: string; domainType: string }>;

    expect(options.length).toBeGreaterThan(0);
    for (const o of options) {
      expect(typeof o.title).toBe('string');
      expect(o.title.length).toBeGreaterThan(0);
      expect(ALL_DOMAINS).toContain(o.domainType);
    }

    /* The exact shape that broke it: copy ending in a score, filed correctly
       anyway. A generic option may still end in its own domain name — that
       is a coincidence of wording, and no longer something anything reads. */
    const drift = options.find((o) => o.title.includes('you rated it'));
    expect(drift).toBeTruthy();
    expect(drift!.title.split(' ').pop()).toBe('1/5');
    expect(drift!.domainType).toBe('health');
  });

  /**
   * The countable life, on day one.
   *
   * "~490 more evenings out with Carol" is the most affecting thing this app
   * produces, and the section was empty for every new account — a count only
   * existed once somebody found the ritual card in the Time tab and tapped a
   * suggestion. The people were already named at onboarding.
   */
  it('starts the countables from the people they named', async () => {
    await people.create(userId, { ...AMMA } as never);
    await reveal({ health: 3, family: 4, career: 3 });

    const counts = await prisma.onboardingAnswer.findMany({
      where: { userId, section: 'counts' },
    });
    expect(counts.length).toBeGreaterThan(0);

    const labels = counts.map((c) => (c.value as { label: string }).label);
    // About a person they named, by name — not a domain-shaped guess.
    expect(labels.some((l) => l.includes('Amma'))).toBe(true);
    for (const c of counts) {
      const v = c.value as { label: string; perYear: number };
      expect(v.perYear).toBeGreaterThan(0);
      expect(v.label.length).toBeGreaterThan(0);
    }
  });

  /**
   * You do not text a four-year-old.
   *
   * "Reach out to Zoe this week — one message is enough" was the first
   * mission handed to a father whose Zoe is four, and to another whose
   * nine-year-old sleeps down the hall. The bar stays low — that was always
   * the point — but the currency changes with the age and the address.
   */
  it('does not offer to message a small child in your own home', async () => {
    await people.create(userId, {
      name: 'Zoe', relationType: 'child', age: 4, locationType: 'same_home',
      closenessScore: 9, desiredCallFrequency: 'daily', wantsMoreTime: true,
    } as never);
    const r = await reveal({ health: 1, family: 4, career: 3 }, ['health']) as any;
    const zoe = (r.firstWeekFocus as Array<{ title: string }>)
      .find((o) => o.title.includes('Zoe'));
    expect(zoe).toBeTruthy();
    expect(zoe!.title).not.toMatch(/message|reach out/i);
    expect(zoe!.title).toMatch(/fifteen minutes/i);
  });

  it('still offers a message to an adult far away', async () => {
    await people.create(userId, {
      name: 'Fiona', relationType: 'child', age: 44, locationType: 'different_country',
      closenessScore: 8, desiredCallFrequency: 'weekly', wantsMoreTime: true,
    } as never);
    const r = await reveal({ health: 1, family: 4, career: 3 }, ['health']) as any;
    const fiona = (r.firstWeekFocus as Array<{ title: string }>)
      .find((o) => o.title.includes('Fiona'));
    expect(fiona!.title).toMatch(/one message is enough/);
  });

  /**
   * The overwhelm answer, end to end: no "One small step toward:
   * Everything…" option, and the narrative meets it with narrowing rather
   * than quoting it back with a checkbox attached.
   */
  it('does not hand an overwhelm answer back as a mission', async () => {
    const r = await reveal({ health: 1, family: 4, career: 3 }, ['health'], [
      { section: 'reflection', key: 'postponing', value: 'Everything. I do not know where to start any more.' },
    ]) as any;
    const options = r.firstWeekFocus as Array<{ title: string }>;
    expect(options.some((o) => /One small step toward/i.test(o.title))).toBe(false);
    expect(r.narrative).not.toContain('Everything. I do not know');
    expect(r.narrative).toContain('everything at once');
  });

  it('does not write a second copy when onboarding completes twice', async () => {
    await people.create(userId, { ...AMMA } as never);
    await reveal({ health: 3, family: 4, career: 3 });
    const first = await prisma.onboardingAnswer.count({ where: { userId, section: 'counts' } });
    await reveal({ health: 3, family: 4, career: 3 });
    const second = await prisma.onboardingAnswer.count({ where: { userId, section: 'counts' } });
    expect(second).toBe(first);
  });
});
