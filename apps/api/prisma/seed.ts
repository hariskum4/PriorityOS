/**
 * The demo account: one ordinary week, built out of published numbers.
 *
 * A demo is an argument about who the app is for, and the temptation is to
 * invent somebody with a dramatic problem — an estranged parent, a crisis, a
 * life visibly going wrong. That demo persuades nobody, because the person
 * watching it does not recognise themselves in it and concludes the app is
 * for someone else.
 *
 * So this one is deliberately unremarkable, and every number in it comes from
 * a survey rather than from imagination:
 *
 *   **Work: 473 minutes a day.** India's Time Use Survey 2024 puts men at 473
 *   and women at 341 on employment and related activities (440 overall). The
 *   male column is used here because the persona holds a full-time office job;
 *   the female column would make the same point harder, since it comes with
 *   289–305 minutes of unpaid domestic work against a man's 88.
 *
 *   **Commute: 63 minutes each way.** Chennai's 2025 average, over 22 km. It
 *   is the country's *fastest* major metro; Mumbai is 66 and Bengaluru 63 over
 *   shorter and longer distances respectively.
 *
 *   **Phone: 5 hours a day.** EY's 2025 India media report, of which roughly
 *   70% is social, video and gaming.
 *
 * Add those up and the day is spoken for before anything he said mattered
 * gets a minute: 7.9 hours of work, 2.1 of commuting, 5 on a screen. That is
 * the whole argument this app makes, and it is made here by arithmetic on
 * public data rather than by a sad story.
 *
 * The rest — a mother in another city, a marriage, a seven-year-old, a friend
 * who moved — is the most common shape of an Indian urban professional's life,
 * and it is what gives every screen something true to draw.
 *
 * **The password is not in this file.** It used to be, which meant the demo
 * credentials shipped inside the web bundle for anyone to read. It comes from
 * `DEMO_PASSWORD` now, and this script refuses to run without one.
 *
 *   DEMO_PASSWORD='…' npm run db:seed
 */
import { PrismaClient } from '@prisma/client';
import { hash as argonHash } from '@node-rs/argon2';
import { startOfWeekIn } from '../src/common/time';

const prisma = new PrismaClient();
const TZ = 'Asia/Kolkata';
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);

/**
 * The app's own idea of where a week starts, not a second one.
 *
 * `DomainAttentionSample` is unique on (user, domain, week) and the Sunday
 * Session is looked up by `weekStart`, both derived from `startOfWeekIn` in
 * the reader's timezone. A seed that computed Monday itself would agree with
 * that for most of the year and disagree across a DST-style boundary or a
 * timezone that is not the server's — and the symptom would be a demo whose
 * twelve weeks of history silently became thirteen rows of nothing, or a
 * Sunday Session that exists in the database and cannot be found.
 */
const weeksAgo = (n: number) => startOfWeekIn(TZ, daysAgo(n * 7));

const DOMAINS = [
  'family', 'partner', 'children', 'health', 'career', 'finance',
  'growth', 'friends', 'experiences', 'reflection', 'purpose', 'impact',
];

const EMAIL = 'demo@priority.app';

async function main() {
  /**
   * A default password, on purpose, for this one account.
   *
   * This was `DEMO_PASSWORD` with no default an hour ago, because a hardcoded
   * password had been sitting in this file and shipping inside the web bundle
   * by accident. The reasoning has not changed — it has been overtaken.
   *
   * The demo login is now pre-filled on the sign-in screen so that anyone
   * shown the app can press one button and be inside it. That is a decision
   * about what the demo is for, and it makes the password public by design:
   * it is printed on the first screen, so there is no secret here left to
   * protect. A value in this file is then not a leak, it is documentation.
   *
   * What stays true is everything around it. This account is a fixture, not a
   * person — it holds no real writing, and re-running this script resets it in
   * two seconds. `DEMO_PASSWORD` still wins if it is set, so a deployment that
   * wants a private demo can have one without touching the code.
   *
   * **When this stops being a demo-stage app, both halves come out together**
   * — this default and the pre-fill in `apps/mobile/app/(auth)/login.tsx`.
   * They are one decision in two files, and leaving either behind is the
   * accident this was, before it was a choice.
   */
  const password = process.env.DEMO_PASSWORD ?? 'demo@4321';
  if (password.length < 8) {
    throw new Error('DEMO_PASSWORD is under 8 characters.');
  }

  /* Only ever this one row. The demo is rebuilt from scratch each run so it
     is always the same week; nothing else in the database is touched. */
  await prisma.user.deleteMany({ where: { email: EMAIL } });

  const user = await prisma.user.create({
    data: {
      email: EMAIL,
      passwordHash: await argonHash(password),
      fullName: 'Arun Krishnan',
      /* 36 — the middle of the working life this app is aimed at, and old
         enough that the arithmetic about a parent's remaining visits is real
         rather than theoretical. */
      dob: new Date('1990-02-14'),
      timezone: 'Asia/Kolkata',
      city: 'Chennai',
      country: 'IN',
      profession: 'IT services — delivery manager',
      workType: 'office_9_5',
      /* 473 min/day × 6 days ≈ 47 hours. Six-day weeks are ordinary in Indian
         IT services, and the survey's figure is per day, not per workday. */
      workHoursPerWeek: 47,
      workStartHour: 10,
      workEndHour: 19,
      workDays: [1, 2, 3, 4, 5, 6],
      commuteMinutes: 63,
      screenHoursPerDay: 5,
      maritalStatus: 'married',
      childrenCount: 1,
      livesAwayFromParents: true,
      parentsInLife: true,
      motivationStyle: 'gentle',
      onboardingCompleted: true,
      preferences: { create: { insightIntensity: 'gentle' } },
      /* Enough history to have earned something, not enough to look gamified. */
      gamification: {
        create: { totalXp: 285, level: 3, dailyStreak: 3, bestStreak: 8 },
      },
    },
  });

  /**
   * What he said mattered, in the order he said it.
   *
   * Family first and health second is the most common ranking this app sees,
   * and it is also the one the numbers above make hardest to keep.
   */
  const RANK: Record<string, number> = {
    family: 1, health: 2, partner: 3, children: 4, career: 5, finance: 6,
  };
  const domainRows = await Promise.all(DOMAINS.map((domainType) => prisma.lifeDomain.create({
    data: {
      userId: user.id,
      domainType,
      priorityRank: RANK[domainType] ?? null,
      flaggedAsNeglected: ['family', 'health'].includes(domainType),
      regretRiskFlagged: domainType === 'family',
    },
  })));

  /**
   * The answers the Reveal, the drift copy and the countables all read back.
   *
   * Without these the account is complete but mute: several screens quote the
   * reader's own words, and an account with none of them shows the generic
   * branch of every sentence.
   */
  const answers: Array<[string, string, unknown]> = [
    ['values', 'priorityRanking', ['family', 'health', 'partner', 'children', 'career', 'finance']],
    ['values', 'neglectedDomains', ['family', 'health']],
    ['values', 'regretRisks', ['family']],
    /* Self-rated 1–5, and the gap between the 1 and the ranking is the app's
       entire opening line. */
    ['values', 'currentReality', { family: 2, health: 1, partner: 3, children: 3, career: 4 }],
    ['values', 'firstWeekFeeling', 'less rushed'],
    ['reflection', 'futureSelf', 'Someone Kavya still rings on a Tuesday for no particular reason.'],
    ['reflection', 'eulogy', 'He was in the room. Not on his phone, in the room.'],
    ['reflection', 'postponing', 'the trip to Madurai I keep saying I will take next month'],
    ['life', 'hobbies', ['Cricket', 'Reading']],
    ['life', 'lapsedHobbies', ['Cycling']],
  ];
  await Promise.all(answers.map(([section, key, value]) => prisma.onboardingAnswer.create({
    data: { userId: user.id, section, key, value: value as object },
  })));

  /* ── the people ───────────────────────────────────────────────────────── */

  /**
   * The mother in another city.
   *
   * The most common shape there is: work moved him to Chennai and she stayed.
   * Wants weekly calls, gets them roughly fortnightly, sees him at festivals.
   * That gap is not neglect and the app must never call it that — it is what
   * a 473-minute working day does to good intentions.
   */
  const amma = await prisma.relationship.create({
    data: {
      userId: user.id, name: 'Amma', relationType: 'mother', age: 68,
      city: 'Madurai', locationType: 'different_city', closenessScore: 10,
      inPersonFrequency: 'quarterly', callFrequency: 'biweekly',
      desiredCallFrequency: 'weekly', wantsMoreTime: true,
      healthStatus: 'good',
      lastContactAt: daysAgo(11), lastVisitAt: daysAgo(84),
      meaningfulMomentTypes: ['long phone calls', 'her cooking', 'temple on festival mornings'],
    },
  });

  const divya = await prisma.relationship.create({
    data: {
      userId: user.id, name: 'Divya', relationType: 'spouse', age: 34,
      locationType: 'same_home', closenessScore: 9,
      inPersonFrequency: 'daily', callFrequency: 'daily',
      desiredCallFrequency: 'daily', wantsMoreTime: true,
      lastContactAt: daysAgo(0),
      meaningfulMomentTypes: ['dinner without the phone', 'the Sunday morning coffee'],
    },
  });

  const kavya = await prisma.relationship.create({
    data: {
      userId: user.id, name: 'Kavya', relationType: 'daughter', age: 7,
      locationType: 'same_home', closenessScore: 10,
      inPersonFrequency: 'daily', wantsMoreTime: true,
      lastContactAt: daysAgo(0),
      meaningfulMomentTypes: ['bedtime stories', 'Saturday cycling'],
    },
  });

  /* The friendship that distance quietly ended. Nobody fell out. */
  const rahul = await prisma.relationship.create({
    data: {
      userId: user.id, name: 'Rahul', relationType: 'friend', age: 37,
      city: 'Pune', locationType: 'different_city', closenessScore: 8,
      inPersonFrequency: 'yearly', callFrequency: 'quarterly',
      desiredCallFrequency: 'monthly', wantsMoreTime: true,
      lastContactAt: daysAgo(62),
      meaningfulMomentTypes: ['the long catch-up calls'],
    },
  });

  /* ── what he means to do about it ─────────────────────────────────────── */

  await prisma.goal.createMany({
    data: [
      { userId: user.id, domainType: 'family', title: 'See Amma four times this year, not two', horizon: '1y' },
      { userId: user.id, domainType: 'health', title: 'Cycle again — three mornings a week', horizon: '3m' },
      { userId: user.id, domainType: 'finance', title: 'Six months of expenses set aside', horizon: '1y' },
    ],
  });

  await prisma.mission.createMany({
    data: [
      {
        userId: user.id, relationshipId: amma.id, title: 'Call Amma tonight',
        description: 'She mentioned the knee again last time. Ask.',
        domainType: 'family', missionType: 'relationship', dueDate: daysAgo(0),
        estimatedMinutes: 15, xpReward: 40, sourceType: 'AI',
        aiRationale: 'Family is what you put first, and it has been eleven days — you asked for weekly.',
      },
      {
        userId: user.id, relationshipId: kavya.id, title: 'Bedtime story with Kavya',
        domainType: 'children', missionType: 'ritual', dueDate: daysAgo(0),
        estimatedMinutes: 15, xpReward: 25, sourceType: 'AI',
      },
      {
        userId: user.id, relationshipId: rahul.id,
        title: 'Message Rahul — actually pick a date this time',
        domainType: 'friends', missionType: 'relationship', dueDate: daysAgo(-2),
        estimatedMinutes: 10, xpReward: 40, sourceType: 'AI', snoozeCount: 2,
      },
      /* Kept deliberately: the catalog's own honest entry about checkups is
         the one that makes every confident card believable. */
      {
        userId: user.id, title: 'Book the annual health checkup',
        domainType: 'health', missionType: 'recovery', dueDate: daysAgo(-9),
        estimatedMinutes: 15, xpReward: 25, sourceType: 'AI', snoozeCount: 3,
      },
      { userId: user.id, relationshipId: divya.id, title: 'Dinner with Divya, phones in the other room', domainType: 'partner', missionType: 'ritual', status: 'completed', completedAt: daysAgo(2), xpReward: 40, sourceType: 'user' },
      { userId: user.id, relationshipId: kavya.id, title: 'Cycle with Kavya before the heat', domainType: 'children', missionType: 'one_time', status: 'completed', completedAt: daysAgo(5), xpReward: 25, sourceType: 'AI' },
      { userId: user.id, title: 'Twenty minutes on the cycle', domainType: 'health', missionType: 'ritual', status: 'completed', completedAt: daysAgo(3), xpReward: 25, sourceType: 'AI' },
      { userId: user.id, relationshipId: amma.id, title: 'Call Amma', domainType: 'family', missionType: 'relationship', status: 'completed', completedAt: daysAgo(11), xpReward: 40, sourceType: 'AI' },
    ],
  });

  const cycle = await prisma.habit.create({
    data: {
      userId: user.id, title: 'Cycle twenty minutes', domainType: 'health',
      targetPerWeek: 3, streakCurrent: 2, streakBest: 5, sourceType: 'AI',
      plannedMinute: 6 * 60 + 15, plannedDays: [2, 4, 6],
    },
  });
  const sundayCall = await prisma.habit.create({
    data: {
      userId: user.id, title: 'Sunday call with Amma', domainType: 'family',
      relationshipId: amma.id, targetPerWeek: 1, streakCurrent: 0, streakBest: 4,
      xpReward: 15, sourceType: 'AI', plannedMinute: 19 * 60, plannedDays: [0],
    },
  });
  const bedtime = await prisma.habit.create({
    data: {
      userId: user.id, title: 'Bedtime story, no phone in the room',
      domainType: 'children', relationshipId: kavya.id, targetPerWeek: 5,
      streakCurrent: 4, streakBest: 11, sourceType: 'user',
      plannedMinute: 20 * 60 + 30, plannedDays: [1, 2, 3, 4, 5],
    },
  });
  await prisma.habitLog.createMany({
    data: [
      ...[1, 3, 6, 8, 10, 13].map((d) => ({ habitId: bedtime.id, completedAt: daysAgo(d) })),
      ...[3, 6, 10].map((d) => ({ habitId: cycle.id, completedAt: daysAgo(d) })),
      /* One Sunday kept, then two missed — which is why the streak is zero and
         the family domain is where it is. */
      { habitId: sundayCall.id, completedAt: daysAgo(25) },
    ],
  });

  /* ── what he kept ─────────────────────────────────────────────────────── */

  await prisma.memory.createMany({
    data: [
      {
        userId: user.id, relationshipId: kavya.id, personName: 'Kavya',
        title: 'She rode the whole way without the stabilisers',
        memoryType: 'relationship', domainType: 'children',
        location: 'Besant Nagar beach road', occurredAt: daysAgo(5), timeKnown: true,
        reflection: 'Did not tell her I had let go. She got to the end and turned round looking for me.',
        keepsake: 'The face she made when she realised.',
      },
      {
        userId: user.id, relationshipId: amma.id, personName: 'Amma',
        title: 'Pongal at home', memoryType: 'experience', domainType: 'family',
        location: 'Madurai', occurredAt: daysAgo(84),
        reflection: 'Three days. She cooked every meal and refused all help, as always.',
        conversation: 'She asked when we were coming next. I said soon.',
      },
      {
        userId: user.id, relationshipId: divya.id, personName: 'Divya',
        title: 'Dinner with the phones in the other room',
        memoryType: 'moment', domainType: 'partner', occurredAt: daysAgo(2), timeKnown: true,
        reflection: 'Forty minutes. We talked about her sister, then about nothing.',
      },
    ],
  });

  await prisma.journalEntry.createMany({
    data: [
      {
        userId: user.id, mood: 4,
        whatMattered: 'Kavya rode the whole way on her own.',
        whatIAvoided: 'Still have not called Amma back.',
        domainTags: ['children', 'family'], createdAt: daysAgo(5),
      },
      {
        userId: user.id, mood: 3,
        whatMattered: 'Dinner with Divya, no phones. Should be a normal Tuesday, not an event.',
        whatIAvoided: 'The checkup. Third time I have moved it.',
        domainTags: ['partner', 'health'], createdAt: daysAgo(2),
      },
    ],
  });

  /**
   * Twelve weeks of history, so the sky has something to draw.
   *
   * The shape is the point: `family` claimed at 92 and drifting down through
   * the autumn as work took the evenings, `children` holding because bedtime
   * is at a fixed hour, `health` flat and low. Nothing collapses — this is a
   * life going quietly sideways, which is the condition the app is for.
   */
  const CURVE: Record<string, { importance: number; from: number; to: number }> = {
    family: { importance: 92, from: 46, to: 22 },
    health: { importance: 84, from: 30, to: 19 },
    partner: { importance: 76, from: 44, to: 38 },
    children: { importance: 70, from: 52, to: 55 },
    career: { importance: 62, from: 74, to: 81 },
    finance: { importance: 54, from: 21, to: 18 },
  };
  const samples = [];
  for (let w = 11; w >= 0; w -= 1) {
    const t = (11 - w) / 11;
    for (const [domainType, c] of Object.entries(CURVE)) {
      samples.push({
        userId: user.id,
        domainType,
        weekOf: weeksAgo(w),
        importance: c.importance,
        /* A small wobble, or twelve points on a ruler reads as a graph nobody
           measured. */
        attention: Math.round((c.from + (c.to - c.from) * t + (w % 3 === 0 ? 4 : -2)) * 100) / 100,
      });
    }
  }
  await prisma.domainAttentionSample.createMany({ data: samples, skipDuplicates: true });

  /* Scores that agree with the twelve weeks above, so nothing has to be
     recomputed before the first screen renders honestly. */
  await Promise.all(domainRows.map((d) => {
    const c = CURVE[d.domainType];
    return prisma.lifeDomain.update({
      where: { id: d.id },
      data: {
        importanceScore: c?.importance ?? 0,
        attentionScore: c?.to ?? 0,
        prevAttentionScore: c?.from ?? 0,
        neglectRiskScore: c ? Math.max(0, Math.round(c.importance - c.to)) : 0,
        healthScore: c?.to ?? 0,
        lastMeaningfulActionAt: d.domainType === 'family' ? daysAgo(11) : daysAgo(3),
      },
    });
  }));

  await prisma.opportunityInsight.create({
    data: {
      userId: user.id, relationshipId: amma.id, domainType: 'family',
      kind: 'visits_remaining',
      headline: 'At two visits a year, about 30 more with Amma.',
      detail: 'Arithmetic on the pace you gave, against an ordinary life expectancy for her age. A planning lens, not a prediction — and the pace is the part you control.',
      assumptions: [
        'Two visits a year, which is what the last twelve months came to',
        "India life-expectancy tables for a woman of 68, and nothing about her health",
        'It is a rate, not a countdown: four visits a year doubles it',
      ],
      estimate: 30, unit: 'visits',
    },
  });

  /**
   * This week's, not last week's.
   *
   * `/weekly-review/current` looks up exactly `weekStart` for the week the
   * reader is in, so a review seeded against last Monday exists in the table
   * and is invisible on the screen — which for a demo means the Sunday
   * Session, one of the app's signature moments, opens empty.
   */
  const weekStart = weeksAgo(0);
  await prisma.weeklyReview.create({
    data: {
      userId: user.id, weekStart, weekEnd: daysAgo(0),
      completedMissions: 3, completedHabits: 5, journalEntries: 2,
      topWins: ['Kavya rode the whole way on her own', 'Dinner with Divya, phones away'],
      neglectedDomains: ['family', 'friends'],
      regretRiskFocus: 'One call to Madurai before Sunday',
      nextWeekFocus: [
        'Call Amma — it has been eleven days against a weekly intention',
        'Book the checkup you have moved three times',
        'Give Rahul a date rather than a maybe',
      ],
      aiNarrative:
        'A good week for the people in the house and a quiet one for everyone outside it. Family is what you put first and it got one call; the eleven days since is the widest gap between what you said mattered and where the week actually went.',
    },
  });

  await prisma.appConfig.upsert({
    where: { key: 'scoring' }, create: { key: 'scoring', value: {} }, update: {},
  });

  console.log(`Seeded ${EMAIL} — Arun Krishnan, 36, Chennai.`);
  console.log('  work 47h/wk · commute 63min each way · 5h/day on the phone');
  console.log('  4 people · 3 rhythms · 12 weeks of history · 8 missions · 3 kept moments');
  console.log(process.env.DEMO_PASSWORD
    ? '  password: the DEMO_PASSWORD you passed in.'
    : `  password: ${password} — the default, and the one the login screen fills in.`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
