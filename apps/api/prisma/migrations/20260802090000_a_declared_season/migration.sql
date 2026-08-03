-- A season the person declares, rather than one the app picks and nobody reads.
-- focusUntil is not optional in spirit: the API refuses a focus without an end,
-- because a season that never ends is just a domain being quietly abandoned.
ALTER TABLE "User" ADD COLUMN "focusDomain" TEXT;
ALTER TABLE "User" ADD COLUMN "focusUntil" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "focusStartedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "focusReason" TEXT;
