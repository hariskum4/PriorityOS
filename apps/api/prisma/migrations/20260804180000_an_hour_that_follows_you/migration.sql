-- When a rhythm runs, kept where the account is rather than where the tap was.
--
-- Both nullable: absent means the reader has not said, and the engine goes on
-- deriving the answer from what they actually do. Additive, so an older client
-- that knows nothing about these columns keeps working unchanged.
ALTER TABLE "Habit" ADD COLUMN "plannedDays" JSONB;
ALTER TABLE "Habit" ADD COLUMN "plannedMinute" INTEGER;
