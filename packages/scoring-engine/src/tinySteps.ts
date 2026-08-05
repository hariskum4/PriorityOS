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

export interface TinyStepInput {
  title: string;
  domainType: string;
  missionType?: string | null;
  personName?: string | null;
}

const BY_DOMAIN: Record<string, (p?: string | null) => string> = {
  family: (p) => `Open ${p ?? 'their'} chat. Type one line. That's the whole task.`,
  partner: (p) => `Put your phone in the other room for ten minutes with ${p ?? 'them'}.`,
  friends: (p) => `Send ${p ?? 'them'} one meme or one memory. Nothing more.`,
  children: (p) => `Sit down where ${p ?? 'they'} are playing. Just sit down.`,
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
];

export function tinyStep(input: TinyStepInput): string {
  const title = (input.title ?? '').trim();
  const shape = BY_SHAPE.find((s) => s.test.test(title));
  if (shape) return shape.step(input.personName);

  if (input.missionType === 'relationship' || input.personName) {
    const domainFn = BY_DOMAIN[input.domainType];
    if (domainFn) return domainFn(input.personName);
    return `Open ${input.personName ?? 'their'} chat. Type one line. That's the whole task.`;
  }
  const fn = BY_DOMAIN[input.domainType];
  if (fn) return fn(null);
  return 'Set a two-minute timer and start the smallest piece. Stopping after is allowed.';
}
