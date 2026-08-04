/**
 * A real database for the tests that need one.
 *
 * The 44 unit tests cover pure logic, which is the cheap half. The bugs that
 * actually reached this codebase lived in the other half: a unique index that
 * did not exist, a rotation that raced, an encryption hook that has to fire on
 * every call site. None of those can be caught by a mocked Prisma — a mock
 * would have happily agreed that duplicates were impossible while the database
 * held eleven Ammas.
 *
 * So these run against Postgres. Not the development database: a separate
 * `priority_test` that is truncated between tests and can be dropped without
 * anyone caring.
 *
 *   createdb: docker exec priority-postgres-1 psql -U priority -d priority \
 *               -c "CREATE DATABASE priority_test;"
 *   migrate:  DATABASE_URL=<test url> npx prisma migrate deploy
 */
import { PrismaService } from '../src/prisma/prisma.service';

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL
  ?? 'postgresql://priority:priority@localhost:5432/priority_test?schema=public';

/** Every table that holds user data, children first. */
const TABLES = [
  'AnalyticsEvent', 'PartnerLink', 'ContactLog', 'HabitLog', 'DomainXpEntry',
  'Notification', 'AiRecommendation', 'OpportunityInsight', 'WeeklyReview',
  'JournalEntry', 'Memory', 'Mission', 'Habit', 'Goal', 'Relationship',
  'LifeDomain', 'OnboardingAnswer', 'DomainAttentionSample', 'KnowledgeItem',
  'Decision', 'LifeOsState', 'GamificationProfile', 'UserPreferences',
  'PasswordResetToken', 'RefreshToken', 'User',
];

/**
 * The real PrismaService, not a bare client — the encryption middleware lives
 * in its onModuleInit, and a test that skipped it would be testing something
 * this app never runs.
 */
export async function testPrisma(): Promise<PrismaService> {
  const prisma = new PrismaService({ datasourceUrl: TEST_DATABASE_URL } as never);
  await prisma.onModuleInit();
  return prisma;
}

export async function truncateAll(prisma: PrismaService) {
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${TABLES.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE;`,
  );
}
