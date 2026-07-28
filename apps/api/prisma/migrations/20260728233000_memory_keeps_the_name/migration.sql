-- A moment should outlive the row that pointed at the person.
--
-- Memory.relationshipId is ON DELETE SET NULL, so removing someone left the
-- memories about them intact but anonymous: "the afternoon by the river" with
-- nobody in it. For a record meant to be read in forty years that is worse
-- than either alternative — the moment survives with its meaning removed, and
-- no one later can tell who it was about.
--
-- So the name is snapshotted onto the memory. Deleting a person still removes
-- the person; it no longer quietly edits the past.

ALTER TABLE "Memory" ADD COLUMN IF NOT EXISTS "personName" TEXT;

UPDATE "Memory" m
SET "personName" = r."name"
FROM "Relationship" r
WHERE m."relationshipId" = r."id"
  AND m."personName" IS NULL;
