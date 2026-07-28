-- AlterTable
ALTER TABLE "LifeOsState" ADD COLUMN     "declinedTopics" JSONB NOT NULL DEFAULT '[]';
