-- Hosted database finishing steps (project PriorityOS / zmtvybuikfjmjpvaqduq).
--
-- STATUS: fully applied 2026-08-04. Kept because it is the record of what a
-- fresh hosted environment still needs after `prisma migrate deploy`, and
-- rewritten so that re-running it is a no-op rather than an error.
--
-- What changed since the first draft: boot-time `migrate:deploy` has since
-- applied both constraint migrations properly, so the original ADD CONSTRAINT
-- would fail on a duplicate object and the two INSERTs would double-write the
-- bookkeeping rows. Worse, the ADD CONSTRAINT sits *above* the RLS block, so
-- one aborted statement would take the security half down with it. Both are
-- guarded now.

-- --------------------------------------------------------------------------
-- 1. Two constraints the automated pass could not apply
-- --------------------------------------------------------------------------
-- 20260728220000_merge_duplicate_people (merge steps: 0 rows; index is the guard)
CREATE UNIQUE INDEX IF NOT EXISTS "Relationship_userId_name_relationType_key"
  ON "Relationship" ("userId", lower("name"), "relationType");

-- 20260728234500_memory_relationship_fk (orphan cleanup: 0 rows; FK is the guard)
CREATE INDEX IF NOT EXISTS "Memory_relationshipId_idx" ON "Memory" ("relationshipId");

DO $$
BEGIN
  ALTER TABLE "Memory"
    ADD CONSTRAINT "Memory_relationshipId_fkey"
    FOREIGN KEY ("relationshipId") REFERENCES "Relationship" ("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;  -- already applied
END $$;

-- --------------------------------------------------------------------------
-- 2. Prisma bookkeeping, only where the row is genuinely absent
-- --------------------------------------------------------------------------
-- `_prisma_migrations` has no unique constraint on migration_name, so a second
-- run would silently create a duplicate row and leave the history describing
-- the same migration twice.
INSERT INTO "_prisma_migrations" (id, checksum, migration_name, finished_at, started_at, applied_steps_count)
SELECT gen_random_uuid(), '62aabc20550369ee18a4029ec0655c2d9423699891effbef618ad8c105ce0ef6',
       '20260728220000_merge_duplicate_people', now(), now(), 1
WHERE NOT EXISTS (
  SELECT 1 FROM "_prisma_migrations" WHERE migration_name = '20260728220000_merge_duplicate_people'
);

INSERT INTO "_prisma_migrations" (id, checksum, migration_name, finished_at, started_at, applied_steps_count)
SELECT gen_random_uuid(), '681bc871dabca2624d3ac1df7f00d74c61d831b1fe337d46de39c94d9826766e',
       '20260728234500_memory_relationship_fk', now(), now(), 1
WHERE NOT EXISTS (
  SELECT 1 FROM "_prisma_migrations" WHERE migration_name = '20260728234500_memory_relationship_fk'
);

-- --------------------------------------------------------------------------
-- 3. Row-level security on every table in the public schema
-- --------------------------------------------------------------------------
-- The public schema is reachable through PostgREST with the anon key, which is
-- published by design. The app never uses that path: nothing ships a Supabase
-- client, and only the API talks to this database — as `postgres`, which owns
-- every table AND carries BYPASSRLS. No table sets FORCE ROW LEVEL SECURITY.
--
-- So enabling RLS with zero policies denies `anon` and `authenticated` every
-- command on every table, and changes nothing for the API. Verified after
-- applying: anon reads returned [] on User, RefreshToken, PasswordResetToken,
-- JournalEntry and Relationship, while the owner still read all 29 tables.
--
-- `service_role` also bypasses RLS. That key is a secret and must never reach
-- a client — this file does not protect against handing it out.
--
-- If a future feature ever does talk to Supabase directly from a client, this
-- is deny-all for it too, and that feature must bring its own policies.
--
-- Enumerated rather than looped over pg_tables on purpose: adding a table
-- should be a deliberate act here, because a table nobody thought about is
-- exactly the one that should not be quietly assumed safe.
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
ALTER TABLE "PersonalCatalogItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY;

-- Check: expect 29 / 29 / 0.
-- SELECT count(*) FILTER (WHERE rowsecurity) AS rls_on,
--        count(*) AS total,
--        (SELECT count(*) FROM pg_policies WHERE schemaname='public') AS policies
-- FROM pg_tables WHERE schemaname='public';
