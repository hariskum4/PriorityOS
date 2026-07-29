/**
 * A life, assembled far enough for the engines to have something to say.
 *
 * The kernel's own 164 tests feed it hand-written contexts. These fixtures do
 * the opposite: they write rows to Postgres and let `buildContext` gather them,
 * which is the only way to catch the failures that live in the gathering — a
 * field read from the wrong column, a cadence that never converts, a
 * personalization flag that was hardcoded empty for weeks without anyone
 * noticing.
 */
import type { PrismaService } from '../src/prisma/prisma.service';
import { weekOf } from '../src/life-os/life-os.service';

const DAY = 86_400_000;
const WEEKS = 16;

export interface SeededLife {
  userId: string;
  ammaId: string;
}

/**
 * Someone mid-life with a visible say/do gap: family and health declared as
 * mattering most and starved in practice, work fed. Deliberately not balanced —
 * a life with nothing wrong in it gives the engines nothing to notice, and a
 * test that asserts on silence proves very little.
 */
export async function seedLife(
  prisma: PrismaService,
  now = new Date('2026-07-28T09:00:00Z'),
): Promise<SeededLife> {
  const user = await prisma.user.create({
    data: {
      email: `life-${Math.random().toString(36).slice(2)}@example.com`,
      passwordHash: null,
      fullName: 'Seeded Person',
      dob: new Date('1998-03-04'),
      timezone: 'Asia/Kolkata',
      onboardingCompleted: true,
      preferences: { create: { insightIntensity: 'direct' } },
    },
  });
  const userId = user.id;

  const domains: Array<[string, number, number]> = [
    // domainType, importance, attention
    ['family', 92, 30],
    ['partner', 80, 40],
    ['health', 85, 25],
    ['career', 55, 95],
    ['finance', 60, 70],
    ['friends', 50, 12],
    ['growth', 45, 50],
    ['purpose', 40, 15],
  ];
  await prisma.lifeDomain.createMany({
    data: domains.map(([domainType, importanceScore, attentionScore]) => ({
      userId,
      domainType,
      importanceScore,
      attentionScore,
      neglectRiskScore: Math.max(0, importanceScore - attentionScore),
      healthScore: attentionScore,
    })),
  });

  // Sixteen weeks of history, so the trend engines have a slope to read.
  const samples = [];
  for (let week = 0; week < WEEKS; week++) {
    // Monday of that week, because that is the sample's idempotency key.
    // Anything else writes rows `snapshotWeek` can never match, and the same
    // week quietly ends up sampled twice.
    const monday = weekOf(new Date(now.getTime() - week * 7 * DAY));
    for (const [domainType, importance, attention] of domains) {
      samples.push({
        userId,
        domainType,
        weekOf: monday,
        importance,
        // `week` counts backwards, so the subtraction has to grow with age:
        // highest fifteen weeks ago, lowest now. Sliding downward into the
        // present — a gap that is widening reads differently from one that has
        // always been there.
        attention: Math.max(0, attention - (WEEKS - 1 - week) * 0.8),
      });
    }
  }
  await prisma.domainAttentionSample.createMany({ data: samples });

  const amma = await prisma.relationship.create({
    data: {
      userId,
      name: 'Amma',
      relationType: 'mother',
      age: 68,
      closenessScore: 10,
      desiredCallFrequency: 'weekly',
      callFrequency: 'monthly',
      wantsMoreTime: true,
      healthStatus: 'declining',
      // Wanted weekly, last spoken to five weeks ago: the gap the whole
      // product exists to notice.
      lastContactAt: new Date(now.getTime() - 35 * DAY),
    },
  });

  await prisma.relationship.create({
    data: {
      userId,
      name: 'Arjun',
      relationType: 'friend',
      closenessScore: 7,
      desiredCallFrequency: 'monthly',
      wantsMoreTime: true,
      lastContactAt: new Date(now.getTime() - 120 * DAY),
    },
  });

  await prisma.goal.createMany({
    data: [
      {
        userId,
        domainType: 'health',
        title: 'Run three times a week',
        description: 'I want to still be able to play with my children at fifty',
        targetDate: new Date(now.getTime() + 200 * DAY),
        status: 'active',
      },
      {
        userId,
        domainType: 'family',
        title: 'Visit Ranchi twice this year',
        description: 'Amma is not getting younger',
        targetDate: new Date(now.getTime() + 90 * DAY),
        status: 'active',
      },
    ],
  });

  await prisma.knowledgeItem.createMany({
    data: [
      { userId, title: 'Four Thousand Weeks', kind: 'book', domainType: 'purpose', status: 'active' },
      { userId, title: 'On the shortness of life', kind: 'book', domainType: 'reflection', status: 'finished' },
    ],
  });

  await prisma.decision.create({
    data: {
      userId,
      question: 'Should I move back to Ranchi to be near my parents?',
      horizonYears: 10,
      status: 'open',
      options: [
        { label: 'Move back', costs: ['career'], gains: ['family'] },
        { label: 'Stay', costs: ['family'], gains: ['career'] },
      ],
    },
  });

  return { userId, ammaId: amma.id };
}
