-- CreateTable
CREATE TABLE "Decision" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "question" VARCHAR(200) NOT NULL,
    "options" JSONB NOT NULL DEFAULT '[]',
    "horizonYears" INTEGER NOT NULL DEFAULT 5,
    "status" TEXT NOT NULL DEFAULT 'open',
    "chosenOptionId" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Decision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" VARCHAR(300) NOT NULL,
    "topics" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'queued',
    "domainType" TEXT,
    "progress" DECIMAL(4,3),
    "lastTouchedAt" TIMESTAMP(3),
    "takeaway" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DomainAttentionSample" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "domainType" TEXT NOT NULL,
    "weekOf" DATE NOT NULL,
    "importance" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "attention" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "energy" DECIMAL(5,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DomainAttentionSample_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LifeOsState" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lastProfoundAt" TIMESTAMP(3),
    "seenObservationIds" JSONB NOT NULL DEFAULT '[]',
    "lastCycleAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LifeOsState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Decision_userId_status_idx" ON "Decision"("userId", "status");

-- CreateIndex
CREATE INDEX "KnowledgeItem_userId_status_idx" ON "KnowledgeItem"("userId", "status");

-- CreateIndex
CREATE INDEX "DomainAttentionSample_userId_weekOf_idx" ON "DomainAttentionSample"("userId", "weekOf");

-- CreateIndex
CREATE UNIQUE INDEX "DomainAttentionSample_userId_domainType_weekOf_key" ON "DomainAttentionSample"("userId", "domainType", "weekOf");

-- CreateIndex
CREATE UNIQUE INDEX "LifeOsState_userId_key" ON "LifeOsState"("userId");

-- AddForeignKey
ALTER TABLE "Decision" ADD CONSTRAINT "Decision_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeItem" ADD CONSTRAINT "KnowledgeItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DomainAttentionSample" ADD CONSTRAINT "DomainAttentionSample_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LifeOsState" ADD CONSTRAINT "LifeOsState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
