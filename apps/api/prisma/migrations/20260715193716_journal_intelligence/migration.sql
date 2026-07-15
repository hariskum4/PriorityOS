-- AlterTable
ALTER TABLE "WeeklyReview" ADD COLUMN     "avoidancePattern" TEXT,
ADD COLUMN     "journalThemes" JSONB NOT NULL DEFAULT '[]';
