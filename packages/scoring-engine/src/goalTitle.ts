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

/** Cut to `max` characters without splitting a word; add an ellipsis. */
function clip(s: string, max: number): string {
  if (s.length <= max) return s;
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
