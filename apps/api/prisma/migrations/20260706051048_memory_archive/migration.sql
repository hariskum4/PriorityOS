-- CreateTable
CREATE TABLE "Memory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "relationshipId" TEXT,
    "missionId" TEXT,
    "title" TEXT NOT NULL,
    "memoryType" TEXT NOT NULL DEFAULT 'moment',
    "domainType" TEXT,
    "countKey" TEXT,
    "peoplePresent" JSONB NOT NULL DEFAULT '[]',
    "location" TEXT,
    "reflection" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Memory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Memory_userId_occurredAt_idx" ON "Memory"("userId", "occurredAt");

-- CreateIndex
CREATE INDEX "Memory_userId_countKey_idx" ON "Memory"("userId", "countKey");

-- AddForeignKey
ALTER TABLE "Memory" ADD CONSTRAINT "Memory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
