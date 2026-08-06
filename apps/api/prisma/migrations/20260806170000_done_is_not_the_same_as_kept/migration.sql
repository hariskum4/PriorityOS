-- How many of a week's completed missions left a kept moment behind.
--
-- Defaults to 0 for every past week, which is honest: those rows were written
-- before the count existed and nobody should read a backfilled number as a
-- fact about a week nobody measured. The next `generate` recomputes any week
-- still being looked at.
ALTER TABLE "WeeklyReview" ADD COLUMN "missionsWithMoment" INTEGER NOT NULL DEFAULT 0;
