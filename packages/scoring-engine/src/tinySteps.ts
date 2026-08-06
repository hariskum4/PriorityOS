/**
 * Tiny steps — the put-on-your-running-shoes mechanic.
 *
 * Validation feedback (r/Entrepreneurship, atomic-habits principle):
 * "schedule a parent call" feels like homework and trips the brain's
 * alarm system; "open their chat and type one line" does not. Every
 * mission therefore carries a laughably small first action. The goal is
 * never the mission — the goal is the tiny step; momentum does the rest
 * (curiosity + the open-loop effect finish what the step starts).
 *
 * Deterministic and word-count-capped: a tiny step that needs two
 * sentences isn't tiny.
 */

import { isRemoteLocation } from './remote';

export interface TinyStepInput {
  title: string;
  domainType: string;
  missionType?: string | null;
  personName?: string | null;
  /**
   * Where this person lives, when the mission is about one.
   *
   * The children and partner steps put you in the same room — "sit down where
   * they are playing", "phone in the other room" — which is the right first
   * move only if you are already there. Handed to a father whose 25-year-old
   * lives in another city, under a mission that correctly said "one message
   * is enough", the step contradicted the mission directly above it.
   */
  locationType?: string | null;
}

/**
 * Whose chat it is.
 *
 * These templates were written around their own fallbacks and then had names
 * dropped into the same slot, which is not the same grammar: `${p ?? 'their'}
 * chat` reads correctly as "their chat" and incorrectly as "Amma chat" — and
 * a name is the normal case here, not the exception. "Call Amma this evening"
 * is the archetypal mission in this product's own documentation, so the
 * broken version is the one almost everybody saw.
 *
 * Plain `'s` for every name, including those already ending in s. Chicago
 * sets "Lucas's"; the alternative needs a rule about sibilants that would be
 * wrong about as often as it was right.
 */
function possessive(name: string): string {
  return /['’]s?$/.test(name) ? name : `${name}'s`;
}

const BY_DOMAIN: Record<string, (p?: string | null) => string> = {
  family: (p) => `Open ${p ? possessive(p) : 'their'} chat. Type one line. That's the whole task.`,
  partner: (p) => `Put your phone in the other room for ten minutes with ${p ?? 'them'}.`,
  friends: (p) => `Send ${p ?? 'them'} one meme or one memory. Nothing more.`,
  /* Same trap, the other way round: the verb was conjugated for the "they"
     fallback, so every named child got "Sit down where Lucía are playing". */
  children: (p) => `Sit down where ${p ?? 'they'} ${p ? 'is' : 'are'} playing. Just sit down.`,
  health: () => 'Put on your shoes. You are allowed to stop there.',
  career: () => 'Open the document and write one bad sentence.',
  finance: () => 'Open the account and just look. Looking counts.',
  growth: () => 'Open the book. Read one page. Close it if you want.',
  experiences: () => 'Open the calendar and circle one free day.',
  reflection: () => 'Write one honest sentence. One.',
  purpose: () => 'Open the project. Add one sentence. Done counts.',
  impact: () => 'Think of one person you could help this month. Just name them.',
};

/**
 * The few mission shapes whose first move is not their domain's default.
 *
 * The defect: "Take Priya out of the house for an hour, no screens" was
 * answered with "Open their chat. Type one line." — a step for a different
 * mission entirely, because the step was read off the domain and the domain
 * said family. A step describing the wrong action is worse than a generic
 * one; a generic step reads as modest, a wrong one reads as an app that did
 * not look at what it just asked for.
 *
 * Deliberately few, and anchored the way `recognizeHabit` is, for the same
 * reason: a pattern matching anywhere in a title matches the wrong titles.
 * "Take your walk while calling Jai" is not an outing, and nothing here may
 * decide that it is. When none of these fit, the domain answers as before.
 */
const BY_SHAPE: Array<{ test: RegExp; step: (p?: string | null) => string }> = [
  {
    /* Somewhere, together. The first move is agreeing on when — putting
       your shoes on does nothing if the other person is not coming. */
    test: /^(?:take|bring)\s+\S+\s+(?:out|to)\b|\bout of the house\b|\bsomewhere new\b/i,
    step: (p) => `Ask ${p ?? 'them'} which evening works. That is the whole task.`,
  },
  {
    test: /^(?:plan|book|schedule|arrange)\b/i,
    step: () => 'Open the calendar and pick the day. Nothing else today.',
  },
  {
    /* Anything already phone-shaped downgrades to the chat, not to the room.
       The children default is "sit down where they are playing", which for
       "A call where they pick the topic" — a mission written for a child in
       another city — is a step for a different life. Anchored to the opening
       word so "Take your walk while calling Jai" keeps its shoes. */
    test: /^(?:a\s+)?(?:video\s+)?call\b|^send (?:a\s+)?(?:photo|voice note)\b/i,
    step: (p) => `Open ${p ? possessive(p) : 'their'} chat. Type one line. That's the whole task.`,
  },
];

/**
 * The domains whose default step assumes you are already in the room.
 *
 * `children` sits you down where they are playing; `partner` puts your phone
 * in the other room "with them". Both are the right first move for somebody
 * within reach and impossible for somebody who is not — and the mission above
 * them will already have said so ("one message is enough"), which is how the
 * card came to contradict itself in two consecutive lines.
 */
const NEEDS_SAME_ROOM = new Set(['children', 'partner']);

/**
 * The step, unless the step is the title said twice.
 *
 * The goal form suggests a first step by calling `tinyStep` on the goal, and
 * whoever accepts that suggestion gets it as their mission title. The card
 * then calls `tinyStep` again on that title and prints the answer underneath
 * it, so a health goal came out as:
 *
 *   Put on your shoes. You are allowed to stop there.
 *   ↳ Put on your shoes. You are allowed to stop there.
 *
 * The step is only ever worth a line when it says something the title did
 * not. Callers render nothing when this returns null.
 */
export function tinyStepUnlessRestated(input: TinyStepInput): string | null {
  const step = tinyStep(input);
  const flat = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return flat(step) === flat(input.title ?? '') ? null : step;
}

export function tinyStep(input: TinyStepInput): string {
  const title = (input.title ?? '').trim();
  const shape = BY_SHAPE.find((s) => s.test.test(title));
  if (shape) return shape.step(input.personName);

  if (input.missionType === 'relationship' || input.personName) {
    /* Distance beats the domain: the chat is the room you have. */
    if (isRemoteLocation(input.locationType) && NEEDS_SAME_ROOM.has(input.domainType)) {
      return `Open ${input.personName ? possessive(input.personName) : 'their'} chat. Type one line. That's the whole task.`;
    }
    const domainFn = BY_DOMAIN[input.domainType];
    if (domainFn) return domainFn(input.personName);
    return `Open ${input.personName ? possessive(input.personName) : 'their'} chat. Type one line. That's the whole task.`;
  }
  const fn = BY_DOMAIN[input.domainType];
  if (fn) return fn(null);
  return 'Set a two-minute timer and start the smallest piece. Stopping after is allowed.';
}
