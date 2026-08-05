-- Which catalog entry a habit or mission came from, as an identity rather
-- than as a title.
--
-- Titles are rephrased per person by the AI layer and edited by hand in the
-- catalog, and the catalog's own comments admit what that costs: editing one
-- re-offers it to everyone who already has it. It also makes the question
-- worth asking in six months — which entries people actually keep at week
-- six, and for which kind of deficit — unanswerable, because the join key
-- keeps changing shape.
--
-- Nullable and best-effort. Title matching stays as the fallback; a habit
-- somebody typed themselves has no catalog identity and never will.
ALTER TABLE "Habit" ADD COLUMN "sourceKey" TEXT;
ALTER TABLE "Mission" ADD COLUMN "sourceKey" TEXT;

-- Backfill from the catalog's own stable titles, exactly as the runtime
-- matcher does it. Anything that does not match stays null, which is the
-- honest answer for a hand-written habit.
CREATE INDEX IF NOT EXISTS "Habit_sourceKey_idx" ON "Habit" ("sourceKey");
CREATE INDEX IF NOT EXISTS "Mission_sourceKey_idx" ON "Mission" ("sourceKey");
