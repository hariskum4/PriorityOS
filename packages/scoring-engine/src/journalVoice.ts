/**
 * A finished thing, said the way the person who did it would say it.
 *
 * The app puts a first line in the journal composer after a moment is kept,
 * and the first version put the mission title there — "Call Amma — not a
 * text." That is an imperative in the app's voice, and nobody writes their
 * diary in imperatives. It reads as an instruction still outstanding rather
 * than a thing that happened.
 *
 * Why the pronoun and the tense are not decoration: Pennebaker's linguistic
 * work on expressive writing found the shift toward first person and past
 * tense is part of the mechanism rather than a stylistic preference — the
 * writing that helped was writing that had become a person's own account of
 * their own past.
 *
 * The hard line, and the reason this file does so little:
 *
 *   **The app writes what happened. The person writes what it meant.**
 *
 * So this produces "Today I called Amma." and stops. It never appends "and
 * it was good", because the app does not know — that might have been the
 * call where she said something difficult. And it must not, for a second
 * reason that survives even if it somehow did know: affect labelling works
 * because the labelling is yours. A feeling handed to somebody is not a
 * feeling they have named, and text a model wrote is text the reader owns
 * less of. Both effects are measured, and both run the wrong way here.
 */

/**
 * Past tense for the verbs the catalogs actually open with, counted rather
 * than imagined — `Write` heads nine titles, `Put` six, `Take` five.
 *
 * A list rather than a rule because English will not be ruled: `Write` is not
 * `writed`, and a stemmer that gets `plan` → `planed` has produced something
 * worse than leaving the sentence alone. Anything absent falls back to a form
 * that needs no conjugation at all.
 */
const PAST: Record<string, string> = {
  write: 'wrote', put: 'put', take: 'took', ask: 'asked', plan: 'planned',
  learn: 'learned', make: 'made', give: 'gave', book: 'booked', do: 'did',
  read: 'read', call: 'called', say: 'said', message: 'messaged',
  finish: 'finished', show: 'showed', block: 'blocked', have: 'had',
  protect: 'protected', walk: 'walked', cook: 'cooked', move: 'moved',
  set: 'set', automate: 'automated', spend: 'spent', record: 'recorded',
  let: 'let', start: 'started', introduce: 'introduced', host: 'hosted',
  teach: 'taught', work: 'worked', go: 'went', sit: 'sat', name: 'named',
  keep: 'kept', mentor: 'mentored', offer: 'offered', bring: 'brought',
  send: 'sent', open: 'opened', reach: 'reached', train: 'trained',
  turn: 'turned', pick: 'picked', tell: 'told', visit: 'visited',
  cancel: 'cancelled', clear: 'cleared', close: 'closed', choose: 'chose',
};

/**
 * The clause after the verb, trimmed of the parts that were instructions.
 *
 * Catalog titles carry a coaching tail — "Call Amma — **not a text**",
 * "Cook dinner with Arun, **no screens**". Those are the app telling somebody
 * how to do the thing, and once it is done they are not part of what
 * happened. Kept out of the sentence, not out of the record: the mission
 * title is stored on the memory either way.
 */
function withoutTheInstruction(rest: string): string {
  return rest
    /* The coaching tail after a dash. */
    .split(/\s+[—–-]\s+/)[0]
    /* A second sentence is a tiny step, not a title — "Put on your shoes.
       You are allowed to stop there." is two instructions, and only the
       first is a thing that happened. */
    .split(/(?<=[.!?])\s+/)[0]
    .replace(/,\s*(no|not|without|and don'?t)\b.*$/i, '')
    .replace(/[.!?]+$/, '')
    .trim();
}

/**
 * The catalog addresses the reader; a diary does not.
 *
 * Titles are written as instructions — "one thing **you** learned", "put on
 * **your** shoes" — and carrying that through produced "Today I wrote up one
 * thing you learned this month", which is somebody reporting on a stranger.
 * Only standalone words, so "yourself" and a person called Yousef are both
 * left alone by the boundaries.
 */
function intoMyOwnWords(clause: string): string {
  return clause
    .replace(/\byourself\b/gi, 'myself')
    .replace(/\byou're\b/gi, "I'm")
    .replace(/\byours\b/gi, 'mine')
    .replace(/\byour\b/gi, 'my')
    .replace(/\byou\b/gi, 'I');
}

export interface FirstPersonInput {
  /** The mission or moment title, as the catalog wrote it. */
  title: string;
  /** Who it was with, when it was with anybody. */
  personName?: string | null;
}

/**
 * "Today I called Amma." — a fact, in their voice, and nothing more.
 *
 * Returns null when the title cannot be turned into a sentence honestly,
 * which is the right answer more often than a clumsy one: the caller then
 * offers an empty box, which is exactly what it offered before this existed
 * and is never wrong.
 */
export function firstPersonPast(input: FirstPersonInput): string | null {
  const title = (input.title ?? '').trim();
  if (!title) return null;

  const [first, ...rest] = title.split(/\s+/);
  const verb = PAST[first.toLowerCase()];
  if (!verb) return null;

  let clause = intoMyOwnWords(withoutTheInstruction(rest.join(' ')));
  /* The sentence already opens with Today; saying it twice is the sort of
     thing that makes a drafted line read as drafted. */
  clause = clause.replace(/\s+today$/i, '').trim();
  if (!clause) return null;

  /* "Reach out to Amma" is two words before the object; the table holds the
     first and this keeps the particle attached to it. */
  const PARTICLES = new Set(['out', 'up', 'off', 'through', 'over', 'back', 'in', 'down']);
  const parts = clause.split(/\s+/);
  let head = verb;
  if (PARTICLES.has(parts[0]?.toLowerCase())) {
    head = `${verb} ${parts[0]}`;
    clause = parts.slice(1).join(' ');
  }
  if (!clause) return null;

  return `Today I ${head} ${clause}.`.replace(/\s+/g, ' ');
}

/**
 * One question, asked instead of an answer.
 *
 * This is where the actual leverage is, and it took reading the research to
 * see it. The people whose health improved in the expressive-writing trials
 * were not the ones who wrote the most feeling — they were the ones whose
 * language moved toward causal and insight words, "because" and "realised"
 * and "why". The gain is in making meaning, not in recording an event.
 *
 * Which means the useful thing an app can do is not write more of somebody's
 * entry. It is ask the question that pulls for the sentence only they can
 * write. Every one of these is open, none can be answered yes or no, and
 * none of them suggests what the answer should be.
 *
 * Deliberately not a feeling question. "How did that make you feel?" invites
 * a one-word label and stops; "what did it change" invites a because.
 */
const INSIGHT_WITH_PERSON = [
  'What did that change between you?',
  'Why did today turn out to be the day?',
  'What would you want them to know?',
];

const INSIGHT_ALONE = [
  'What did that change?',
  'Why was this one worth doing?',
  'What made today the day for it?',
];

/**
 * Stable per moment rather than random: opening the same entry twice and
 * being asked two different questions makes the question feel generated,
 * which is precisely what stops somebody answering it.
 */
export function insightPrompt(input: FirstPersonInput): string {
  const pool = input.personName?.trim() ? INSIGHT_WITH_PERSON : INSIGHT_ALONE;
  const seed = [...(input.title ?? '')].reduce((n, c) => n + c.charCodeAt(0), 0);
  return pool[seed % pool.length];
}
