-- AlterTable
ALTER TABLE "WeeklyReview" ADD COLUMN     "domainSelfScores" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "intentionWord" TEXT,
ADD COLUMN     "oneThing" TEXT,
ADD COLUMN     "sessionCompletedAt" TIMESTAMP(3),
ADD COLUMN     "weekWord" TEXT;
