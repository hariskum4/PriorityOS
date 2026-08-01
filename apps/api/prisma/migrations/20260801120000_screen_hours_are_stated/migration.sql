-- The screen trade quoted "at 5h a day" to everyone, from a useState(5) that
-- never left the component. Nullable on purpose: no figure is shown until the
-- person sets one, so "unset" has to be representable.
ALTER TABLE "User" ADD COLUMN "screenHoursPerDay" INTEGER;
