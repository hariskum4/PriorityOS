-- The app knew workHoursPerWeek and never what time any of them were, so it
-- could say a domain was short but never where in a Tuesday the answer went.
-- All nullable: an unset day shape says it is assuming, rather than drawing a
-- 9-to-5 over someone's night shift.
ALTER TABLE "User" ADD COLUMN "workStartHour" INTEGER;
ALTER TABLE "User" ADD COLUMN "workEndHour" INTEGER;
ALTER TABLE "User" ADD COLUMN "commuteMinutes" INTEGER;
