/**
 * The questions a particular moment deserves, instead of the same four.
 *
 * "Back to this moment" asked everybody the same things — *What did you talk
 * about?*, *What do you want to remember about it?* — and a fixed question is
 * a form field. Asked about a call with Amma it is nearly right; asked about
 * shipping something alone at midnight it is nonsense, because there was
 * nobody to talk to. A question that does not fit the thing it is under reads
 * as a template, and a template is the thing people stop filling in.
 *
 * Which is the whole reason this file exists rather than a longer list of
 * placeholder strings: the leverage in a journal is not the box, it is the
 * question. The expressive-writing trials found the benefit tracked causal
 * and insight words — because, realised, why — not emotional ones. So the
 * useful thing to personalise is the ask, and the useful thing to never touch
 * is the answer.
 *
 * The hard line inherited from `journalVoice`, unchanged and worth restating
 * because this file is where it would be most tempting to cross:
 *
 *   **The app writes the question. The person writes the answer.**
 *
 * Nothing here proposes what the reader might say, how the evening went, or
 * how they felt about it. Every string below ends in a question mark on
 * purpose.
 *
 * Each of the four differs for exactly one reason, so the set stays legible
 * rather than looking shuffled:
 *
 *   `insight`      — who was there, and what kind of thing it was
 *   `reflection`   — what kind of thing it was
 *   `conversation` — whether there was anybody to talk to
 *   `keepsake`     — how long ago it happened
 */

import { stablePick } from './journalVoice';

/** The kinds the archive stores. Anything else falls to the plain wording. */
export type MomentKind =
  | 'relationship' | 'experience' | 'achievement' | 'reflection' | 'gratitude' | 'moment';

export interface MomentContext {
  /** The moment's own title — the line the person wrote at the top. */
  title: string;
  /** What kind of thing they filed it as. */
  memoryType?: string | null;
  /**
   * The one person it was with.
   *
   * Only when there is exactly one. A gathering gets "you all" — naming one
   * of four people would be the app deciding whose evening it was.
   */
  personName?: string | null;
  /** How many people were there at all, so a crowd reads as a crowd. */
  peopleCount?: number | null;
  /**
   * Whole days between the moment and now.
   *
   * Null when it is not known, which is treated as recent — the cautious
   * direction, since asking "what has stayed with you since?" about this
   * afternoon is the app pretending time has passed.
   */
  daysAgo?: number | null;
}

export interface MomentPrompts {
  /** The open question at the top of the form, in amber. */
  insight: string;
  /** Placeholder over the account of what happened. */
  reflection: string;
  /** Placeholder over the middle beat — what was said, or what it took. */
  conversation: string;
  /** Placeholder over the part that stayed. */
  keepsake: string;
}

/**
 * The seeded question, per kind of moment.
 *
 * Three each, chosen by title rather than at random — `stablePick` again, for
 * the reason it exists: being asked a different question on the second
 * opening makes the question feel generated, which is exactly what stops
 * somebody answering it.
 *
 * `%s` is the person, and only appears in pools that are only reached when
 * there is one.
 */
const INSIGHT_WITH_PERSON: Record<string, string[]> = {
  default: [
    'What did that change between you and %s?',
    'Why did that turn out to be the day for %s?',
    'What would you want %s to know?',
  ],
  achievement: [
    'What did %s see that day that you did not?',
    'What did getting there cost, and was it worth it?',
    'What would you want %s to know about it?',
  ],
  gratitude: [
    'What would %s be surprised to hear you say?',
    'What did %s do that you have not thanked them for?',
    'What did that change between you and %s?',
  ],
};

const INSIGHT_ALONE: Record<string, string[]> = {
  default: [
    'What did that change?',
    'Why was this one worth doing?',
    'What made that the day for it?',
  ],
  achievement: [
    'What did that take that nobody saw?',
    'What did you learn on the way to it?',
    'What would the version of you who started say?',
  ],
  experience: [
    'What did that change about how you see it?',
    'Why has this one stayed with you?',
    'What would you go back for?',
  ],
  reflection: [
    'What made the thought arrive when it did?',
    'What follows from it, if it is true?',
    'What would have to change for you to act on it?',
  ],
  gratitude: [
    'What would be missing without it?',
    'Why does this one register and others do not?',
    'What did that change?',
  ],
};

/**
 * The account, shaped by what kind of thing is being recounted.
 *
 * Not a question, because this box sits directly under the title and the
 * title has already asked what happened. It says which longer version is
 * wanted — the failure it replaces is two boxes asking the same thing, which
 * is how somebody types their whole evening into the one-line title.
 */
const ACCOUNT: Record<string, string> = {
  default: 'The longer version — how it actually went',
  achievement: 'The longer version — how you actually got there',
  experience: 'The longer version — what it was actually like',
  reflection: 'The longer version — where the thought actually came from',
  gratitude: 'The longer version — what actually happened',
};

/**
 * The middle beat, and the one that was most often wrong.
 *
 * With somebody there it is what was said. Alone it cannot be, so it becomes
 * the nearest honest thing: what it took, what was unexpected, what set the
 * thought off. Never "who were you with" — the form asked that already and
 * got no for an answer.
 */
const ALONE_MIDDLE: Record<string, string> = {
  default: 'What was the part you did not expect?',
  achievement: 'What did it take to get there?',
  experience: 'What was going on around you?',
  reflection: 'What set the thought off?',
  gratitude: 'Who or what made it possible?',
};

/** A year is the point where "want to remember" has already been decided. */
const LONG_AGO_DAYS = 365;
/** Far enough back that the feeling has had time to settle into something. */
const A_WHILE_DAYS = 30;

function kindOf(memoryType?: string | null): string {
  const k = (memoryType ?? '').trim().toLowerCase();
  /* `relationship` and `moment` have no wording of their own — the person,
     not the label, is what makes those two specific. */
  return k === 'relationship' || k === 'moment' ? 'default' : k;
}

function pooled(pools: Record<string, string[]>, kind: string): string[] {
  return pools[kind] ?? pools.default;
}

/**
 * Four questions for one moment.
 *
 * Pure, deterministic, and complete on its own — this is what the form shows
 * before any model has been asked anything, and what it keeps showing if the
 * answer never comes. A rewrite is an improvement on a good question, never
 * the difference between a question and an empty box.
 */
export function momentPrompts(ctx: MomentContext): MomentPrompts {
  const kind = kindOf(ctx.memoryType);
  const person = ctx.personName?.trim() || '';
  const crowd = (ctx.peopleCount ?? 0) > 1;
  const withSomebody = !!person || crowd;
  const seed = ctx.title ?? '';

  const insight = person
    ? stablePick(pooled(INSIGHT_WITH_PERSON, kind), seed).replace(/%s/g, person)
    : stablePick(pooled(INSIGHT_ALONE, kind), seed);

  const reflection = person
    ? `${ACCOUNT[kind] ?? ACCOUNT.default} with ${person}`
    : (ACCOUNT[kind] ?? ACCOUNT.default);

  /* Two people who were both there talk to each other; four are a room, and
     "what did you and everyone talk about" is not a question anybody answers.
     A crowd gets the plural and no names. */
  let conversation: string;
  if (person && !crowd) conversation = `What did you and ${person} actually talk about?`;
  else if (withSomebody) conversation = 'What did you all actually talk about?';
  else conversation = ALONE_MIDDLE[kind] ?? ALONE_MIDDLE.default;

  const days = ctx.daysAgo ?? 0;
  const keepsake = days >= LONG_AGO_DAYS
    ? 'What still stays with you about it?'
    : days >= A_WHILE_DAYS
      ? 'What has stayed with you since?'
      : 'What do you want to remember about it?';

  return { insight, reflection, conversation, keepsake };
}

/**
 * The middle beat again, in three or four words.
 *
 * The composer hides the last two boxes behind a link that names them —
 * "+ what you talked about, what you want to remember" — and that link had
 * the same problem the box did: it promised a conversation to somebody who
 * spent the evening alone. Same inputs, same reason to vary, so it lives
 * here rather than being reasoned about again on the screen.
 *
 * Engine-only. The model is never asked to word this: it is a control label,
 * and a rewritten control is a different control.
 */
const MIDDLE_LABEL: Record<string, string> = {
  default: 'the part you did not expect',
  achievement: 'what it took',
  experience: 'what was going on around you',
  reflection: 'what set it off',
  gratitude: 'who made it possible',
};

/** The words on the link that opens the last two boxes. */
export function momentDisclosure(ctx: MomentContext): string {
  const withSomebody = !!ctx.personName?.trim() || (ctx.peopleCount ?? 0) > 0;
  const middle = withSomebody
    ? 'what you talked about'
    : (MIDDLE_LABEL[kindOf(ctx.memoryType)] ?? MIDDLE_LABEL.default);
  return `${middle}, what you want to remember`;
}

/**
 * Openers that end a question before it starts.
 *
 * A yes/no question gets a yes, and a yes is not writing. The engine never
 * produces one; this exists because a model asked to "warm up" a question
 * reaches for *Did you enjoy it?* with some regularity, and a rewrite that
 * closes the question has made the surface worse in the one way that matters.
 */
const CLOSED_OPENER = /^(did|was|were|is|are|do|does|have|has|had|can|could|would|will|should|shall|am)\b/i;

/**
 * "How did that feel?" — the question this whole surface is built to avoid.
 *
 * It invites one adjective and stops, which is the opposite of the causal and
 * insight language the writing benefit actually tracked. The engine asks for a
 * because; a rewrite is not allowed to trade that for a mood.
 */
const FEELING_QUESTION = /\b(how (did|does|do) (that|it|this|you|they)\b.*\bfeel|feel about|how you felt|make you feel)\b/i;

/**
 * Whether a rewritten question may be shown in place of the engine's.
 *
 * Deliberately narrow: `safeRephrase` already guards the facts — invented
 * names, numbers, units, a dropped person. This guards the only thing left,
 * which is whether the sentence is still doing the job of a question. Both
 * checks have to pass, and either one failing shows the engine's wording,
 * which was never bad.
 */
export function isUsableQuestion(text: string | null | undefined): boolean {
  const clean = (text ?? '').trim();
  if (!clean) return false;
  if (!clean.endsWith('?')) return false;
  /* Two questions stacked in one box is an interrogation, not a prompt. */
  if ((clean.match(/\?/g) ?? []).length > 1) return false;
  if (clean.length > 90) return false;
  if (CLOSED_OPENER.test(clean)) return false;
  if (FEELING_QUESTION.test(clean)) return false;
  return true;
}

/**
 * The account line is the one of the four that is not a question.
 *
 * It sits inside a text box as guidance, so it must not grow into a sentence
 * somebody reads as content, and must not turn into a question either — that
 * would put three questions in a row above one box.
 */
export function isUsableAccountLine(text: string | null | undefined): boolean {
  const clean = (text ?? '').trim();
  if (!clean) return false;
  if (clean.includes('?')) return false;
  if (clean.length > 70) return false;
  return true;
}
