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

  const unique = [...new Set(names.map((n) => n.trim()).filter((n) => n.length > 1))]
    .sort((a, b) => b.length - a.length);

  unique.forEach((name, i) => {
    const alias = `Person ${i + 1}`;
    out.set(name, alias);
    back.set(alias, name);
  });

  return { out, back };
}

export function redact(text: string, p: Pseudonyms): string {
  let result = text;
  for (const [name, alias] of p.out) {
    result = result.replace(new RegExp(`\\b${escape(name)}\\b`, 'gi'), alias);
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
