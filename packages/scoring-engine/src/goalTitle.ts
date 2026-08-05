/**
 * Goal titles — a name, not an essay.
 *
 * Onboarding asks open questions ("name the thing you keep postponing") and
 * people answer them the way they think: in paragraphs, sometimes with their
 * own headings and line breaks. That prose is genuinely valuable — it is the
 * *why* behind the goal — but it is not a title. Written straight into
 * `Goal.title` it breaks every surface that treats a title as a label: list
 * rows, mission derivation, share cards, notifications.
 *
 * So we split one answer into two fields:
 *   title       — a short, scannable name (first clause, word-boundary capped)
 *   description — the untouched original, whenever it said more than the title
 *
 * Deterministic on purpose. Goal creation sits on the onboarding request path,
 * and the project's AI rules are explicit that the LLM never sits there and
 * that every feature must work with `AI_ENABLED=false`. An AI-polished title
 * is a fine later refinement, applied fire-and-forget the way mission
 * personalisation already is — but the correct title must not depend on it.
 */

/** Longest a derived title may be, in characters. */
export const GOAL_TITLE_MAX = 72;

export interface DerivedGoalTitle {
  title: string;
  /** The full original prose, or null when the title already said all of it. */
  description: string | null;
}

/** Collapse newlines and runs of whitespace; trim. */
function flatten(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * First sentence-or-line of a block of prose.
 *
 * Splits on the first hard stop (`.`, `!`, `?`, `;`, `—`, newline) rather than
 * only on `.`, because people write "Get healthy — properly, not casually"
 * and the dash is the real boundary. A decimal like "10.5" is not a stop, so
 * a period only counts when followed by whitespace or end-of-string.
 */
function firstClause(raw: string): string {
  const text = raw.trim();
  // Newline is the strongest signal a person has finished a thought.
  const nl = text.search(/\r?\n/);
  const upToLine = nl > 0 ? text.slice(0, nl) : text;

  const m = upToLine.match(/^(.*?)(?:[.!?;](?=\s|$)|\s+—\s+|\s+--\s+)/s);
  const clause = m ? m[1] : upToLine;
  return flatten(clause);
}

/**
 * The comma boundary, used only when the alternative is a truncation.
 *
 * `firstClause` stops at hard punctuation, and people answering "the thing
 * you keep postponing" mostly do not use any: they write one long breath with
 * commas in it. "Take Lucia sailing for a proper week, just the two of us,
 * before she stops wanting to come" has no full stop, so it was clipped at
 * seventy-two characters into "…just the two of us, before she…" — a title
 * that stops mid-thought, printed as a mission on the reveal with the whole
 * untruncated sentence two lines underneath it.
 *
 * The first comma clause is a better title than a cut ("Take Lucia sailing
 * for a proper week"), but only where a cut was going to happen anyway.
 * Splitting unconditionally would wreck the short answers this must not
 * touch — "Call Amma, Dad, and my sister every week" is already a title, and
 * "Call Amma" is a different promise. So: only over the limit, and only when
 * what precedes the comma is long enough to stand on its own.
 */
const MIN_COMMA_CLAUSE = 20;

function commaClause(s: string, max: number): string | null {
  if (s.length <= max) return null;
  const comma = s.indexOf(',');
  if (comma < MIN_COMMA_CLAUSE || comma > max) return null;
  return s.slice(0, comma).trim();
}

/** Cut to `max` characters without splitting a word; add an ellipsis. */
function clip(s: string, max: number): string {
  if (s.length <= max) return s;
  const whole = commaClause(s, max);
  if (whole) return whole;
  const cut = s.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  // Only respect the word boundary if it isn't absurdly early (one long word).
  const body = lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut;
  return `${body.replace(/[\s,;:—-]+$/, '')}…`;
}

/**
 * Turn any user answer into a `{ title, description }` pair.
 *
 * Already-short input passes through untouched with a null description, so
 * this is safe to run over every goal write, not just onboarding's.
 *
 * @param raw       what the person typed
 * @param existing  a description already supplied by the caller; kept if the
 *                  caller knows better than we do
 */
/**
 * Whether an answer names a thing at all.
 *
 * "Name the thing you keep postponing" is usually answered with a thing —
 * and sometimes with the truth instead: "Everything. I do not know where to
 * start any more." That is not a goal, it is a description of being
 * underwater, and everything downstream treated it as a title anyway. A
 * burnt-out lawyer's first mission arrived as "One small step toward:
 * Everything. I do not know where to start any more." — the app repeating a
 * cry for help back to its author with a checkbox next to it.
 *
 * Conservative and anchored, like every matcher in this package: only the
 * openings that plainly declare there is no nameable thing. "Everything with
 * the house" names the house and passes; a bare "everything" does not. When
 * unsure this says yes, because refusing a real goal costs more than
 * accepting a vague one.
 */
export function namesAThing(raw: string): boolean {
  const t = (raw ?? '').trim().toLowerCase();
  if (!t) return false;
  return !/^(?:everything|nothing|all of it|too (?:much|many)|i (?:do not|don't|dont) know|no idea|not sure|i (?:can't|cannot|cant) (?:choose|decide|pick))\b[.,!?\s]*(?:$|i\b|where\b|it\b|any\s?more\b)/.test(t);
}

export function deriveGoalTitle(
  raw: string,
  existing?: string | null,
): DerivedGoalTitle {
  const original = (raw ?? '').trim();
  const keep = existing?.trim() ? existing.trim() : null;

  if (!original) return { title: '', description: keep };

  const flat = flatten(original);

  // Short and single-thought: it is already a title.
  if (flat === original && original.length <= GOAL_TITLE_MAX) {
    return { title: original, description: keep };
  }

  const title = clip(firstClause(original) || flat, GOAL_TITLE_MAX);

  // The prose is worth keeping only when it carries more than the title does.
  const strippedTitle = title.replace(/…$/, '').trim();
  const saidMore = flat.length > strippedTitle.length;

  return {
    title,
    description: keep ?? (saidMore ? original : null),
  };
}
