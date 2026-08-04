/**
 * Where somebody is, and what that actually allows.
 *
 * The day shape knows when a person is free. It has never known *where*,
 * and the difference decides whether a suggestion is help or nonsense: two
 * hours freed by a cancelled meeting, at a desk in an open-plan office, is
 * not two hours in which you can go for a run or ring your mother. Offered
 * one of those, the reader learns the app does not know what their day is
 * like — the same lesson a homemaker learned from being told to turn her
 * commute into an audiobook.
 *
 * Capabilities rather than places, for the reason `lifeShape` is: the
 * catalogs need to ask "can this life do X?", not "is this person in an
 * office?". A hot-desk, a shared kitchen table and a train all forbid a
 * private call, and no list of place names would have caught all three.
 */

export interface Setting {
  /** A call, or anything said out loud that someone else should not hear. */
  canSpeakFreely: boolean;
  /** Standing up and going somewhere: a walk, a session, an errand. */
  canMove: boolean;
  /** A keyboard and a screen — writing, learning, the deep block. */
  hasScreen: boolean;
  /** Nobody reading over a shoulder: journalling, the honest page. */
  isPrivate: boolean;
}

/** What the reader picks. Names are the question, not the answer. */
export type SettingKey = 'desk' | 'free' | 'out' | 'around_people';

export const SETTING_LABELS: Record<SettingKey, string> = {
  desk: 'at my desk',
  free: 'free to move',
  out: 'out and about',
  around_people: 'people around me',
};

const SETTINGS: Record<SettingKey, Setting> = {
  /* The cancelled-meeting case: a screen, headphones, and colleagues within
     earshot. Deep work and learning are exactly right here; a call home and
     a run are exactly wrong. */
  desk: { canSpeakFreely: false, canMove: false, hasScreen: true, isPrivate: false },
  /* Their own time and their own room — everything is on the table. */
  free: { canSpeakFreely: true, canMove: true, hasScreen: true, isPrivate: true },
  /* Walking, waiting, between things. A phone and legs, no desk. */
  out: { canSpeakFreely: true, canMove: true, hasScreen: false, isPrivate: false },
  /* At home with family, or anywhere company is the point. Free to move,
     not free to disappear into a private hour. */
  around_people: { canSpeakFreely: false, canMove: true, hasScreen: true, isPrivate: false },
};

/**
 * Unknown allows everything.
 *
 * The same rule `lifeShape` follows: "has not said" is not "cannot". A
 * reader who never picks a setting sees exactly what they saw before this
 * module existed, which is the only safe default for a filter this strong.
 */
const UNKNOWN: Setting = {
  canSpeakFreely: true, canMove: true, hasScreen: true, isPrivate: true,
};

export function setting(key?: SettingKey | null): Setting {
  return (key && SETTINGS[key]) || UNKNOWN;
}

/**
 * Whether a thing can be done here.
 *
 * `needs` is what the activity requires; absent means it asks nothing and
 * fits anywhere. Every requirement must hold — a private call needs both
 * speech and privacy, and satisfying one of them is not close enough.
 */
export function fitsSetting(
  needs: Array<keyof Setting> | undefined,
  where: Setting,
): boolean {
  if (!needs?.length) return true;
  return needs.every((n) => where[n]);
}

const LIMIT: Record<keyof Setting, string> = {
  canSpeakFreely: 'nothing that needs a private call',
  canMove: 'nothing that needs you on your feet',
  hasScreen: 'nothing that needs a desk',
  isPrivate: 'nothing you would rather nobody read',
};

const ALL_NEEDS = Object.keys(LIMIT) as Array<keyof Setting>;

/**
 * Why *this* thing cannot happen here.
 *
 * The reason has to come from the thing's own unmet requirements, not from
 * the setting's general shortcomings. A desk forbids both calls and walks,
 * so explaining a blocked walk with "nothing that needs a private call" is
 * a true sentence about the desk and a wrong answer about the walk — and
 * the reader, who knows perfectly well why they cannot go running from
 * their chair, learns that the app is reciting rather than reasoning.
 */
export function limitsFor(
  needs: Array<keyof Setting> | undefined,
  where: Setting,
): string[] {
  return (needs ?? []).filter((n) => !where[n]).map((n) => LIMIT[n]);
}

/**
 * Everything this setting rules out, for copy that is about the place
 * rather than about any one suggestion.
 */
export function settingLimits(where: Setting): string[] {
  return limitsFor(ALL_NEEDS, where);
}
