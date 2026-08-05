/**
 * Crisis-language detection (blueprint §19.5): journaling in an app about
 * regret and relationships WILL receive heavy disclosures. When one appears,
 * the product must switch from productivity coaching to a support pattern.
 *
 * Design rules:
 *  - Deterministic and local — no LLM call, no network, no logging of the
 *    matched text (privacy: the flag is boolean, the words stay the user's).
 *  - Errs toward catching real signals while excluding common idioms
 *    ("this deadline is killing me") — a support card shown gently is
 *    low-cost; a missed signal is not.
 *  - Never blocks saving. The entry is the user's either way.
 */

const CRISIS_PATTERNS: RegExp[] = [
  /\bkill(?:ing)?\s+myself\b/i,
  /\bsuicid(?:e|al)\b/i,
  /\bself[\s-]?harm\b/i,
  /\bhurt(?:ing)?\s+myself\b/i,
  /\bcut(?:ting)?\s+myself\b/i,
  /\bend(?:ing)?\s+my\s+life\b/i,
  /\bend\s+it\s+all\b/i,
  /\bwant(?:ed)?\s+to\s+die\b/i,
  /\bwish\s+I\s+(?:was|were)\s+dead\b/i,
  /\bno\s+reason\s+to\s+live\b/i,
  /\bbetter\s+off\s+without\s+me\b/i,
  /\bdon'?t\s+want\s+to\s+(?:be\s+here|exist|wake\s+up)\s*(?:anymore)?\b/i,
  /\bcan'?t\s+go\s+on\b/i,
  /\bnot\s+worth\s+living\b/i,
];

export function detectCrisisLanguage(
  ...texts: Array<string | null | undefined>
): boolean {
  const joined = texts.filter(Boolean).join('\n');
  if (!joined) return false;
  return CRISIS_PATTERNS.some((p) => p.test(joined));
}

/* -------------------------------------------------------------------------
   Where to send somebody, from where they actually are
   ---------------------------------------------------------------------- */

export interface SupportLine {
  /** What to call it, in the reader's terms. */
  name: string;
  /** The number or address, exactly as it should be dialled or typed. */
  contact: string;
  /** Hours, when they are worth stating. */
  note?: string;
}

/**
 * The lines a person can actually reach, chosen by country.
 *
 * The support card was a fixed list of Indian helplines with
 * "Elsewhere: findahelpline.com" underneath. That is the right *default* for
 * this product and the wrong thing to show a reader in Manchester at two in
 * the morning, who now has to read past two numbers that will not help them
 * to reach a link that will. A person in that state should not be doing
 * routing work for the app.
 *
 * Deterministic, offline, and derived from `User.country`, which the profile
 * already holds and the reader can already correct. No geolocation, no
 * inference from an IP, nothing that requires the app to know more about
 * somebody in distress than it knew a minute earlier.
 *
 * Three rules this table follows:
 *
 *   **A country appears only when its numbers are verified and free.** A
 *   half-remembered helpline is worse than the international directory,
 *   because it looks authoritative and fails at the moment it matters.
 *
 *   **The international directory is always last, never omitted.** It covers
 *   every country not listed here, and it is the honest fallback for
 *   somebody travelling, somebody whose profile is wrong, and every country
 *   this table will never be big enough to hold.
 *
 *   **Nothing here is a diagnosis or a referral.** These are phone numbers.
 *   The card that shows them says what the app is — a planning tool — and
 *   that saying so is the whole reason it can show them at all.
 */
const SUPPORT_LINES: Record<string, SupportLine[]> = {
  IN: [
    { name: 'Tele-MANAS', contact: '14416', note: 'Government of India, 24×7, free' },
    { name: 'iCall', contact: '+91 91529 87821' },
    { name: 'AASRA', contact: '+91 98204 66726', note: '24×7' },
  ],
  US: [
    { name: 'Suicide & Crisis Lifeline', contact: '988', note: 'call or text, 24×7' },
    { name: 'Crisis Text Line', contact: 'text HOME to 741741' },
  ],
  GB: [
    { name: 'Samaritans', contact: '116 123', note: 'free, 24×7' },
    { name: 'Shout', contact: 'text SHOUT to 85258' },
  ],
  CA: [
    { name: 'Suicide Crisis Helpline', contact: '988', note: 'call or text, 24×7' },
  ],
  AU: [
    { name: 'Lifeline', contact: '13 11 14', note: '24×7' },
    { name: 'Beyond Blue', contact: '1300 22 4636' },
  ],
  NZ: [
    { name: 'Need to talk?', contact: '1737', note: 'call or text, 24×7' },
  ],
  IE: [
    { name: 'Samaritans', contact: '116 123', note: 'free, 24×7' },
  ],
  SG: [
    { name: 'Samaritans of Singapore', contact: '1767', note: '24×7' },
  ],
  AE: [
    { name: 'Estijaba', contact: '800 1717' },
  ],
  DE: [
    { name: 'Telefonseelsorge', contact: '0800 111 0 111', note: 'free, 24×7' },
  ],
};

/** Always offered, whatever the country — see the note on the table. */
const DIRECTORY: SupportLine = {
  name: 'Find a line anywhere',
  contact: 'findahelpline.com',
};

/**
 * Who to offer, for a reader in this country.
 *
 * An unknown or absent country gets the international directory alone, which
 * is correct rather than apologetic: it is a real answer that works
 * everywhere, and padding it with numbers from a country somebody may not be
 * in would be the bug this function exists to fix.
 */
export function supportLines(country?: string | null): SupportLine[] {
  const code = (country ?? '').trim().toUpperCase();
  return [...(SUPPORT_LINES[code] ?? []), DIRECTORY];
}

/** Countries with their own lines, for tests and for a coverage read-out. */
export function supportCountries(): string[] {
  return Object.keys(SUPPORT_LINES);
}
