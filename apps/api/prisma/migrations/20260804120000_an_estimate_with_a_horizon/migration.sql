-- An estimate that could not say what span it covered, or what one change would make of it.
--
-- The Time Reality engine computes an improved trajectory and the quality-year
-- window it is measured over, and the insight row kept neither. The onboarding
-- reveal wanted both, had neither, and so recomputed them from a flat ten-year
-- horizon -- which is not the horizon the stored number used. The result was a
-- card that showed ~150 visits ahead and then offered "add just 2 visits a year
-- and it becomes 140": an increase rendered as a loss.
ALTER TABLE "OpportunityInsight" ADD COLUMN "horizonYears" DECIMAL(5,2);
ALTER TABLE "OpportunityInsight" ADD COLUMN "upliftEstimate" DECIMAL(10,2);
ALTER TABLE "OpportunityInsight" ADD COLUMN "upliftLabel" TEXT;
