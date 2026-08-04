-- Run once in Supabase SQL Editor (project PriorityOS / zmtvybuikfjmjpvaqduq).
-- Finishes what the automated migration pass could not: two constraints, the
-- migration bookkeeping for them, and row-level security on every table.
--
-- Everything here is idempotent-safe to re-run except the two INSERTs, which
-- will no-op-fail loudly if the rows already exist. The data backfills from the
-- original migrations are omitted because they were verified to match 0 rows.

-- 20260728220000_merge_duplicate_people (merge steps: 0 rows; index is the guard)
CREATE UNIQUE INDEX IF NOT EXISTS "Relationship_userId_name_relationType_key"
  ON "Relationship" ("userId", lower("name"), "relationType");

-- 20260728234500_memory_relationship_fk (orphan cleanup: 0 rows; FK is the guard)
CREATE INDEX IF NOT EXISTS "Memory_relationshipId_idx" ON "Memory" ("relationshipId");
ALTER TABLE "Memory"
  ADD CONSTRAINT "Memory_relationshipId_fkey"
  FOREIGN KEY ("relationshipId") REFERENCES "Relationship" ("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Prisma bookkeeping so `prisma migrate deploy` agrees these two are applied.
INSERT INTO "_prisma_migrations" (id, checksum, migration_name, finished_at, started_at, applied_steps_count) VALUES
(gen_random_uuid(), '62aabc20550369ee18a4029ec0655c2d9423699891effbef618ad8c105ce0ef6', '20260728220000_merge_duplicate_people', now(), now(), 1),
(gen_random_uuid(), '681bc871dabca2624d3ac1df7f00d74c61d831b1fe337d46de39c94d9826766e', '20260728234500_memory_relationship_fk', now(), now(), 1);

-- Supabase security advisor: the public schema is reachable through PostgREST
-- with the anon key. The app never uses that path — only the API talks to this
-- database, as the table owner, which bypasses RLS. Enabling RLS with no
-- policies closes the REST path without changing anything for the API.
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UserPreferences" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OnboardingAnswer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Relationship" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ContactLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LifeDomain" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Goal" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Mission" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Habit" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "HabitLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "JournalEntry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Memory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OpportunityInsight" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AiRecommendation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WeeklyReview" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GamificationProfile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DomainXpEntry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Notification" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RefreshToken" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PasswordResetToken" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AnalyticsEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PartnerLink" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AppConfig" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Decision" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "KnowledgeItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DomainAttentionSample" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LifeOsState" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY;
