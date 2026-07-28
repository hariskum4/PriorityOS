/**
 * Names never leave the database.
 *
 * The model needs the *shape* of someone's life to write a useful sentence —
 * that a mother in another city has not been called in three weeks. It does
 * not need her name, and a name is the one field that turns a row of
 * behavioural data into an identified person for anyone who later reads the
 * provider's logs.
 *
 * So every person's name is swapped for a stable placeholder on the way out
 * and restored on the way back. The user still reads "Amma"; the provider only
 * ever sees "Person 1". Longest-first matching so "Amma Devi" is replaced
 * whole rather than leaving "Devi" behind.
 */

export interface Pseudonyms {
  /** real name → placeholder */
  out: Map<string, string>;
  /** placeholder → real name */
  back: Map<string, string>;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function buildPseudonyms(names: string[]): Pseudonyms {
  const out = new Map<string, string>();
  const back = new Map<string, string>();

  const unique = [...new Set(names.map((n) => n.trim()).filter((n) => n.length > 1))];

  /**
   * Numbered alphabetically, not in whatever order the rows arrived.
   *
   * Two names of equal length used to swap places depending on how the
   * database felt, so the same person could be Person 1 in one call and
   * Person 2 in the next — which quietly poisons the day-cache and makes the
   * model's picture of a life inconsistent from one paragraph to the next.
   */
  const numbered = [...unique].sort((a, b) => a.localeCompare(b));
  numbered.forEach((name, i) => {
    const alias = `Person ${i + 1}`;
    out.set(name, alias);
    back.set(alias, name);
  });

  return { out, back };
}

/**
 * Boundaries by lookaround rather than \b.
 *
 * \b is defined against word characters, so a name ending in punctuation —
 * "J.R." — has no word boundary after it and was silently never replaced,
 * sending a real name to the provider while every test on ordinary names
 * passed. Lookaround asks the question that was actually meant: is there a
 * letter or digit pressed up against this?
 */
function boundedPattern(name: string): RegExp {
  return new RegExp(`(?<![\\p{L}\\p{N}])${escape(name)}(?![\\p{L}\\p{N}])`, 'giu');
}

export function redact(text: string, p: Pseudonyms): string {
  // Longest first, so "Amma Devi" is taken whole instead of leaving a surname
  // stranded next to a placeholder.
  const byLength = [...p.out.entries()].sort((a, b) => b[0].length - a[0].length);

  let result = text;
  for (const [name, alias] of byLength) {
    result = result.replace(boundedPattern(name), alias);
  }
  return result;
}

export function restore(text: string, p: Pseudonyms): string {
  let result = text;
  for (const [alias, name] of p.back) {
    result = result.replace(new RegExp(escape(alias), 'g'), name);
  }
  return result;
}
