/**
 * Whether somebody is out of arm's reach — the one fact every suggestion
 * about a person has to respect before it says what to do with them.
 *
 * This exists because none of the generators asked. A man whose 25-year-old
 * son lives in another city and is seen quarterly was told to "Take Sean out
 * of the house for an hour" (the relationship engine decided "near" from the
 * relation type alone), offered "One undivided hour a week" as a children
 * rhythm, and informed that "Children measure attention by whether the phone
 * is in the room" — when for that father the phone *is* the room. Same
 * disease in four organs: the engines knew who mattered but not where they
 * were, even though the host had `locationType` in hand every time.
 *
 * Unknown is NOT remote. A null location must leave behaviour exactly as it
 * was before the engines learned geography, which was co-located — the
 * common case, and the safe one to be wrong about (an outing suggested to
 * someone far away is nonsense; a call suggested to someone in the next room
 * is merely modest).
 *
 * The alias set mirrors `LOCATION_ALIASES` in timeReality — the same words
 * arrive from the same database columns — but only the remote half: this
 * function answers one question and refuses to guess about the rest.
 */
const REMOTE = new Set([
  'different_city', 'another_city', 'other_city', 'far', 'same_country',
  'different_state', 'abroad', 'different_country', 'overseas', 'international',
]);

export function isRemoteLocation(locationType?: string | null): boolean {
  if (!locationType) return false;
  return REMOTE.has(locationType.trim().toLowerCase().replace(/[\s-]+/g, '_'));
}

/**
 * True only when there is somebody to be remote — an empty list is not
 * "everyone is far away", it is "we know nothing", and nothing must change.
 */
export function allRemote(people: Array<{ locationType?: string | null }>): boolean {
  return people.length > 0 && people.every((p) => isRemoteLocation(p.locationType));
}

/** The relation types that make somebody's children rows. */
export const CHILD_RELATIONS = new Set(['child', 'son', 'daughter']);

/**
 * Whether every child this person has told us about lives away from them.
 * The signal the children-domain generators switch their vocabulary on.
 */
export function childrenAreRemote(
  relationships: Array<{ relationType: string; locationType?: string | null }>,
): boolean {
  return allRemote(
    relationships.filter((r) => CHILD_RELATIONS.has((r.relationType ?? '').toLowerCase())),
  );
}
