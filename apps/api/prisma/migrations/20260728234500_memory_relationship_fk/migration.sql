-- Memory.relationshipId was never a foreign key.
--
-- The column existed and the code treated it as a reference, but the database
-- was never told, so nothing checked it: deleting a person left every memory
-- about them pointing at an id that no longer resolved. Not orphaned — worse,
-- silently wrong, and undetectable without joining and finding nothing.
--
-- Found by an integration test asserting the id went NULL after a delete. It
-- did not, because there was no constraint to make it.

-- 1. Any id that already points nowhere becomes NULL — it is already meaningless.
UPDATE "Memory" m
SET "relationshipId" = NULL
WHERE m."relationshipId" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "Relationship" r WHERE r."id" = m."relationshipId");

-- 2. Keep the subject before the pointer can ever be dropped again.
UPDATE "Memory" m
SET "personName" = r."name"
FROM "Relationship" r
WHERE m."relationshipId" = r."id"
  AND m."personName" IS NULL;

-- 3. Now the constraint can exist.
CREATE INDEX IF NOT EXISTS "Memory_relationshipId_idx" ON "Memory" ("relationshipId");

ALTER TABLE "Memory"
  ADD CONSTRAINT "Memory_relationshipId_fkey"
  FOREIGN KEY ("relationshipId") REFERENCES "Relationship" ("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
