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

export function tinyStep(input: TinyStepInput): string {
  if (input.missionType === 'relationship' || input.personName) {
    const domainFn = BY_DOMAIN[input.domainType];
    if (domainFn) return domainFn(input.personName);
    return `Open ${input.personName ?? 'their'} chat. Type one line. That's the whole task.`;
  }
  const fn = BY_DOMAIN[input.domainType];
  if (fn) return fn(null);
  return 'Set a two-minute timer and start the smallest piece. Stopping after is allowed.';
}
