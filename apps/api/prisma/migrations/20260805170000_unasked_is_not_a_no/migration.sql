-- `livesAwayFromParents` could not say "we never asked".
--
-- It was `Boolean NOT NULL DEFAULT false`, so every account that skipped the
-- question was recorded as living with their parents. The quick-start lane
-- never shows that question, so every fast onboarding asserted it — and
-- `rhythms.service` reads `=== false` to withhold "Call home, the same day
-- every week", meaning the app suppressed a relevant rhythm on the strength
-- of an answer nobody gave.
--
-- Existing rows keep their value: a stored `false` from someone who actually
-- answered is still correct, and there is no way to tell the two apart after
-- the fact. Only new silence becomes NULL.
ALTER TABLE "User" ALTER COLUMN "livesAwayFromParents" DROP NOT NULL;
ALTER TABLE "User" ALTER COLUMN "livesAwayFromParents" DROP DEFAULT;
