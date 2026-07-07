/**
 * Seed: one fully-lived-in demo account so the dashboard, missions,
 * relationships, weekly review and insights all render on first run.
 *
 * Login: demo@priority.app / priority123
 */
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);

const DOMAINS = [
  'family', 'partner', 'children', 'health', 'career',
  'finance', 'growth', 'friends', 'experiences', 'reflection',
];

async function main() {
  await prisma.user.deleteMany({ where: { email: 'demo@priority.app' } });

  const user = await prisma.user.create({
    data: {
      email: 'demo@priority.app',
      passwordHash: await argon2.hash('priority123'),
      fullName: 'Demo User',
      timezone: 'Asia/Kolkata',
      city: 'Bengaluru',
      country: 'IN',
      profession: 'Software Engineer',
      workHoursPerWeek: 50,
      maritalStatus: 'married',
      livesAwayFromParents: true,
      onboardingCompleted: true,
      preferences: { create: { insightIntensity: 'gentle' } },
      gamification: {
        create: { totalXp: 320, level: 3, dailyStreak: 4, bestStreak: 9 },
      },
    },
  });

  // Life domains with onboarding-derived ranks/flags
  const rankMap: Record<string, number> = {
    family: 1, health: 2, partner: 3, career: 4, finance: 5,
  };
  for (const domainType of DOMAINS) {
    await prisma.lifeDomain.create({
      data: {
        userId: user.id,
        domainType,
        priorityRank: rankMap[domainType] ?? null,
        flaggedAsNeglected: ['family', 'health'].includes(domainType),
        regretRiskFlagged: domainType === 'family',
      },
    });
  }

  // Relationships
  const amma = await prisma.relationship.create({
    data: {
      userId: user.id, name: 'Amma', relationType: 'mother', age: 62,
      city: 'Ranchi', closenessScore: 10, inPersonFrequency: 'quarterly',
      callFrequency: 'monthly', desiredCallFrequency: 'weekly',
      wantsMoreTime: true, lastContactAt: daysAgo(18),
      lastVisitAt: daysAgo(95),
      meaningfulMomentTypes: ['home-cooked meals', 'temple visits'],
    },
  });
  const appa = await prisma.relationship.create({
    data: {
      userId: user.id, name: 'Appa', relationType: 'father', age: 66,
      city: 'Ranchi', closenessScore: 9, inPersonFrequency: 'quarterly',
      callFrequency: 'monthly', desiredCallFrequency: 'weekly',
      wantsMoreTime: true, lastContactAt: daysAgo(18),
    },
  });
  const spouse = await prisma.relationship.create({
    data: {
      userId: user.id, name: 'Priya', relationType: 'spouse', age: 32,
      closenessScore: 10, inPersonFrequency: 'daily', callFrequency: 'daily',
      desiredCallFrequency: 'daily', wantsMoreTime: true,
      lastContactAt: daysAgo(0),
      meaningfulMomentTypes: ['date nights', 'weekend hikes'],
    },
  });
  const friend = await prisma.relationship.create({
    data: {
      userId: user.id, name: 'Arjun', relationType: 'friend', age: 33,
      city: 'Pune', closenessScore: 8, inPersonFrequency: 'yearly',
      callFrequency: 'quarterly', desiredCallFrequency: 'monthly',
      wantsMoreTime: true, lastContactAt: daysAgo(70),
    },
  });

  // Goals
  await prisma.goal.createMany({
    data: [
      { userId: user.id, domainType: 'family', title: 'Visit parents at least 4 times this year', horizon: '1y' },
      { userId: user.id, domainType: 'health', title: 'Run a 10K by December', horizon: '1y' },
      { userId: user.id, domainType: 'finance', title: 'Build a 12-month emergency fund', horizon: '1y' },
    ],
  });

  // Missions — mix of pending + completed
  await prisma.mission.createMany({
    data: [
      {
        userId: user.id, relationshipId: amma.id, title: 'Call Amma this evening',
        description: 'She mentioned the garden — ask about it.',
        domainType: 'family', missionType: 'relationship', dueDate: daysAgo(0),
        estimatedMinutes: 20, xpReward: 40, sourceType: 'AI',
        aiRationale: 'Family is your #1 stated priority and 18 days have passed since your last call — twice your desired weekly cadence.',
      },
      {
        userId: user.id, relationshipId: friend.id,
        title: 'Message Arjun to plan the Pune catch-up',
        domainType: 'friends', missionType: 'relationship',
        dueDate: daysAgo(-2), estimatedMinutes: 10, xpReward: 40, sourceType: 'AI',
        snoozeCount: 2,
      },
      {
        userId: user.id, title: 'Book the annual health checkup',
        domainType: 'health', missionType: 'recovery',
        dueDate: daysAgo(-5), estimatedMinutes: 15, xpReward: 25, sourceType: 'AI',
      },
      {
        userId: user.id, relationshipId: spouse.id, title: 'Plan Saturday date night',
        domainType: 'partner', missionType: 'ritual',
        status: 'completed', completedAt: daysAgo(2), xpReward: 40, sourceType: 'user',
      },
      {
        userId: user.id, title: '20-minute evening walk',
        domainType: 'health', missionType: 'ritual',
        status: 'completed', completedAt: daysAgo(1), xpReward: 25, sourceType: 'AI',
      },
    ],
  });

  // Habits with logs
  const callParents = await prisma.habit.create({
    data: {
      userId: user.id, title: 'Sunday call with parents', domainType: 'family',
      relationshipId: amma.id, targetPerWeek: 1, streakCurrent: 2, streakBest: 5,
      xpReward: 15, sourceType: 'AI',
    },
  });
  const walk = await prisma.habit.create({
    data: {
      userId: user.id, title: '20-minute walk', domainType: 'health',
      targetPerWeek: 4, streakCurrent: 3, streakBest: 6, sourceType: 'AI',
    },
  });
  await prisma.habitLog.createMany({
    data: [
      { habitId: walk.id, completedAt: daysAgo(1) },
      { habitId: walk.id, completedAt: daysAgo(2) },
      { habitId: walk.id, completedAt: daysAgo(4) },
      { habitId: callParents.id, completedAt: daysAgo(7) },
    ],
  });

  // Journal
  await prisma.journalEntry.create({
    data: {
      userId: user.id, mood: 4,
      whatMattered: 'Dinner together without phones.',
      whatIAvoided: 'Still have not booked the health checkup.',
      domainTags: ['partner', 'health'],
      createdAt: daysAgo(1),
    },
  });

  // Opportunity insight (framed as estimate, with assumptions)
  await prisma.opportunityInsight.create({
    data: {
      userId: user.id, relationshipId: amma.id, domainType: 'family',
      kind: 'visits_remaining',
      headline: 'At your current pace: ~40 visits with Amma over the next 10 years.',
      detail: 'This is simple arithmetic on your stated visit frequency — a planning lens, not a prediction.',
      assumptions: [
        'Current pace of about 4 visits per year continues unchanged',
        '10-year planning horizon (adjustable)',
        'No assumptions about anyone\u2019s health or lifespan',
      ],
      estimate: 40, unit: 'visits',
    },
  });

  // Sample weekly review
  const weekStart = daysAgo(7);
  weekStart.setHours(0, 0, 0, 0);
  await prisma.weeklyReview.create({
    data: {
      userId: user.id, weekStart, weekEnd: daysAgo(1),
      completedMissions: 2, completedHabits: 4, journalEntries: 1,
      topWins: ['Date night with Priya', '3 walks despite the release week'],
      neglectedDomains: ['family', 'friends'],
      regretRiskFocus: 'One call home before next Sunday',
      nextWeekFocus: [
        'Call Amma and Appa',
        'Book the health checkup you keep postponing',
        'Message Arjun about Pune',
      ],
      aiNarrative:
        'A strong week for your marriage and a decent one for health — but family, your #1 stated priority, got zero minutes. The 18-day silence with your parents is the single biggest gap between what you say matters and where your time went.',
    },
  });

  // App config: scoring weights are tunable without redeploy
  await prisma.appConfig.upsert({
    where: { key: 'scoring' },
    create: { key: 'scoring', value: {} },
    update: {},
  });

  console.log('Seeded demo@priority.app / priority123');
  console.log('Relationships:', { amma: amma.id, appa: appa.id, spouse: spouse.id, friend: friend.id });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
