-- Goal titles: a name, not an essay.
--
-- Onboarding's "what do you keep postponing?" answer was written straight into
-- Goal.title, so some rows hold several paragraphs. GoalsService now derives a
-- short title and keeps the prose in `description` (see
-- packages/scoring-engine/src/goalTitle.ts). This migration fixes the rows
-- created before that, then caps the column so no future path can reintroduce
-- an essay.
--
-- The backfill is lossless: the full original title is preserved in
-- `description` whenever that column was empty.

-- 1. Move the prose somewhere it belongs, then shorten the title.
--    A one-time cleanup, so this uses a simpler rule than deriveGoalTitle():
--    first line → cut at the first hard stop → truncate on a word boundary.
--    Nothing is discarded, so any divergence is cosmetic.
WITH offenders AS (
  SELECT
    id,
    title AS original,
    btrim(
      split_part(
        split_part(
          btrim(regexp_replace(split_part(title, E'\n', 1), '\s+', ' ', 'g')),
          ' — ', 1
        ),
        '. ', 1
      )
    ) AS clause
  FROM "Goal"
  WHERE char_length(title) > 72 OR title ~ '[\r\n]'
),
shortened AS (
  SELECT
    id,
    original,
    CASE
      WHEN char_length(clause) = 0 THEN left(original, 72)
      WHEN char_length(clause) <= 72 THEN clause
      -- Trim back to the last space inside the first 72 chars.
      ELSE btrim(
             left(
               left(clause, 72),
               72 - COALESCE(NULLIF(strpos(reverse(left(clause, 72)), ' '), 0), 1)
             ),
             ' ,;:-—'
           ) || U&'\2026'
    END AS new_title
  FROM offenders
)
UPDATE "Goal" g
SET
  description = COALESCE(NULLIF(btrim(g.description), ''), s.original),
  title       = s.new_title
FROM shortened s
WHERE g.id = s.id;

-- 2. Cap the column. Deliberately roomier than GOAL_TITLE_MAX (72) so the
--    guardrail catches essays without breaking if that constant is nudged.
ALTER TABLE "Goal" ALTER COLUMN "title" TYPE VARCHAR(120);
