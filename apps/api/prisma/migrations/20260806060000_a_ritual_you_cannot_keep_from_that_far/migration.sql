-- Rituals already written down that name a room two people are not in.
--
-- `suggestCountables` seeded these from RITUAL_BY_RELATION without ever asking
-- where anybody lived — `SuggestPerson` had no `locationType` field at all,
-- which is why this generator survived the sweep that taught the mission and
-- step generators geography. A son who lives abroad was given "days out with
-- Nikhil", twelve a year, on a cadence collected about phone calls.
--
-- The generator is fixed, but the labels were persisted at onboarding, so
-- every account created before that keeps the impossible wording. This is the
-- backfill.
--
-- Deliberately narrow. Only labels that exactly match what the catalog itself
-- writes are touched, because those are the ones we can prove the app chose
-- rather than the reader. Their own words arrive through the same column —
-- "home-cooked meals with Mummy", "Kerala trips with Amma" come from
-- `meaningfulMomentTypes` — and the ' %' anchor leaves every one of them
-- alone. A reader who renamed a row to "days out with Nikhil" on purpose,
-- because they do fly out twice a year, keeps it too.
UPDATE "OnboardingAnswer" AS oa
SET value = jsonb_set(
      oa.value::jsonb,
      '{label}',
      to_jsonb(m.remote_prefix || ' ' || r.name)
    )
FROM "Relationship" AS r,
     (VALUES
        ('meals with',       'long calls with'),
        ('evenings out with','long calls with'),
        ('days out with',    'video calls with'),
        ('trips with',       'calls with'),
        ('catch-ups with',   'catch-up calls with')
     ) AS m(in_person_prefix, remote_prefix)
WHERE oa.section = 'counts'
  AND r."userId" = oa."userId"
  AND oa.value->>'label' = m.in_person_prefix || ' ' || r.name
  AND r."locationType" IN (
        'different_city', 'another_city', 'other_city', 'far', 'same_country',
        'different_state', 'abroad', 'different_country', 'overseas', 'international'
      );
