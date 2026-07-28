-- One person, one row.
--
-- Nothing has ever stopped two rows describing the same person: the voice
-- capture path and manual entry both created blindly, so a demo profile ended
-- up holding three "Amma / mother" records. The cost is not clutter — it is
-- that one person's history splits, closeness and last-contact disagree, and
-- the system prompts you to reach out to someone you spoke to yesterday.
--
-- This merges what already exists, then makes it impossible again.

-- 1. Elect a survivor per (user, name, relation): the earliest row, because
--    it carries the longest history.
CREATE TEMP TABLE _survivors AS
SELECT DISTINCT ON ("userId", lower(trim("name")), "relationType")
       "id" AS keep_id, "userId", lower(trim("name")) AS norm_name, "relationType"
FROM "Relationship"
ORDER BY "userId", lower(trim("name")), "relationType", "createdAt" ASC, "id" ASC;

CREATE TEMP TABLE _merges AS
SELECT r."id" AS drop_id, s.keep_id
FROM "Relationship" r
JOIN _survivors s
  ON s."userId" = r."userId"
 AND s.norm_name = lower(trim(r."name"))
 AND s."relationType" = r."relationType"
WHERE r."id" <> s.keep_id;

-- 2. Move the history over before anything is deleted.
UPDATE "ContactLog" c SET "relationshipId" = m.keep_id
FROM _merges m WHERE c."relationshipId" = m.drop_id;

UPDATE "Memory" mem SET "relationshipId" = m.keep_id
FROM _merges m WHERE mem."relationshipId" = m.drop_id;

UPDATE "Mission" mis SET "relationshipId" = m.keep_id
FROM _merges m WHERE mis."relationshipId" = m.drop_id;

-- 3. Keep the strongest claim from any duplicate: the highest closeness and
--    the most recent contact are both more likely to be true than a default.
UPDATE "Relationship" k SET
  "closenessScore" = GREATEST(COALESCE(k."closenessScore", 0), COALESCE(agg.max_close, 0)),
  "lastContactAt"  = GREATEST(k."lastContactAt", agg.max_contact),
  "lastVisitAt"    = GREATEST(k."lastVisitAt", agg.max_visit)
FROM (
  SELECT m.keep_id,
         MAX(r."closenessScore") AS max_close,
         MAX(r."lastContactAt")  AS max_contact,
         MAX(r."lastVisitAt")    AS max_visit
  FROM _merges m JOIN "Relationship" r ON r."id" = m.drop_id
  GROUP BY m.keep_id
) agg
WHERE k."id" = agg.keep_id;

-- 4. Drop the losers.
DELETE FROM "Relationship" r USING _merges m WHERE r."id" = m.drop_id;

-- 5. Normalise whitespace so " Amma" and "Amma" cannot diverge again.
UPDATE "Relationship" SET "name" = trim("name") WHERE "name" <> trim("name");

-- 6. Case-insensitive uniqueness, which is what people actually mean.
CREATE UNIQUE INDEX "Relationship_userId_name_relationType_key"
  ON "Relationship" ("userId", lower("name"), "relationType");
