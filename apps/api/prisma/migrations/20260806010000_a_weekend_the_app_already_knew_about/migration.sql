-- Which weekdays are working ones, 0 = Sunday.
--
-- The day card drew a commute into every Saturday and asked to be corrected
-- by a chip that resets at midnight — fifty-two weekends a year of tapping
-- "day off" to say a thing that was true the first time. An empty array is
-- "never asked", and the shape behaves exactly as it did before.
ALTER TABLE "User" ADD COLUMN "workDays" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[];
