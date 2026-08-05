-- What a body allows, as distinct from what a room allows.
--
-- Rhythms declare `needs: ['canMove']`, which asks whether the place permits
-- moving. It has never asked whether the person can. A strength session was
-- therefore offered to somebody with a back injury standing in a perfectly
-- open room, and the app had no way to be told otherwise.
--
-- Self-declared, three values, no diagnosis and no follow-up. Null means
-- never asked, and behaves exactly as the app did before this column existed.
ALTER TABLE "User" ADD COLUMN "movementLimits" TEXT;
