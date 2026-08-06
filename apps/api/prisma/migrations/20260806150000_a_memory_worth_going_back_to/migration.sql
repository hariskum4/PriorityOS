-- Two beats that turn an archive row into something somebody re-reads.
--
-- A memory held one prose field, so the archive was a list of titles with
-- dates on them — a thing that counts rather than a thing anybody returns to.
-- What people go back to a diary for is the substance: what was actually
-- said, and the part that stayed with them. Neither had anywhere to live.
--
-- Both nullable, and both hidden behind a disclosure in the form. A memory
-- with only a title is still a memory, and asking three questions where one
-- was asked is how a journal empties.
ALTER TABLE "Memory" ADD COLUMN "conversation" TEXT;
ALTER TABLE "Memory" ADD COLUMN "keepsake" TEXT;
