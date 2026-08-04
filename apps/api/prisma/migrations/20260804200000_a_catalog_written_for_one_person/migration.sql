-- A catalog entry written for one person rather than for everyone.
--
-- The built-in catalogs are shared by every account, which is what makes them
-- reliable and what caps how personal they can be. These rows are the entries
-- a generation proposed and the engine's judge allowed to exist. They join the
-- same pools the built-ins feed rather than replacing them, so an account with
-- no rows here behaves exactly as it did before this table.
--
-- `payload` is already in engine shape: it was validated into that shape
-- before the row was written, and nothing downstream re-reads raw model output.
CREATE TABLE "PersonalCatalogItem" (
    "id"         TEXT NOT NULL,
    "userId"     TEXT NOT NULL,
    "kind"       TEXT NOT NULL,
    "key"        TEXT NOT NULL,
    "domainType" TEXT,
    "payload"    JSONB NOT NULL,
    -- Turned off by the reader, never deleted: something the app invented and
    -- a person rejected must not come back in the next generation, and a
    -- delete would lose the only record that they said no.
    "isActive"   BOOLEAN NOT NULL DEFAULT true,
    "generation" INTEGER NOT NULL DEFAULT 1,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"  TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PersonalCatalogItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PersonalCatalogItem_userId_kind_key_key"
    ON "PersonalCatalogItem"("userId", "kind", "key");

CREATE INDEX "PersonalCatalogItem_userId_kind_isActive_idx"
    ON "PersonalCatalogItem"("userId", "kind", "isActive");

ALTER TABLE "PersonalCatalogItem"
    ADD CONSTRAINT "PersonalCatalogItem_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
