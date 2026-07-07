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
