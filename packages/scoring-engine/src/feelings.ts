/**
 * "How do you want to feel next Monday evening?" — asked in their own terms.
 *
 * The step offered the same six words to everybody: closer to people, calmer,
 * present, proud of myself, lighter, more alive. It is the last question in
 * onboarding, and by the time it is reached the app has been told which parts
 * of a life matter most, which ones are drifting, and the name of one person.
 * Asking a generic question after all that is the app forgetting, on the last
 * page, everything it just heard.
 *
 * Worse than generic, it was unusable downstream: `firstWeekFeeling` is stored
 * and read back, and "more alive" cannot be checked against anything. "Closer
 * to Amma" can.
 *
 * The options are still theirs to pick and the tail is still universal — this
 * is not a quiz with a right answer. What changes is that the first few come
 * from what they said, in the order they said it mattered.
 */

/** What each domain sounds like as a felt outcome, one week on. */
const BY_DOMAIN: Record<string, string> = {
  family: 'closer to my family',
  partner: 'closer to my partner',
  children: 'more present with my kids',
  friends: 'less alone',
  health: 'stronger',
  career: 'less behind at work',
  finance: 'less anxious about money',
  growth: 'like I am learning again',
  experiences: 'more alive',
  reflection: 'calmer',
  purpose: 'like I made something',
  impact: 'useful to someone',
};

/**
 * Always available, whatever anyone ranked.
 *
 * A person who cannot find themselves in the derived options must not be left
 * with nothing that fits — and "lighter" is a real answer that belongs to no
 * domain at all.
 */
const UNIVERSAL = ['lighter', 'present', 'proud of myself'];

export interface FeelingInput {
  /** Domains in the order they said they mattered. */
  ranking?: string[] | null;
  /** The ones they admitted are drifting. */
  neglected?: string[] | null;
  /** The one person they named, if the lane asked for one. */
  personName?: string | null;
  relationType?: string | null;
}

/** How many options the step shows. Six fits two rows and stops there. */
const LIMIT = 6;

/**
 * The words on offer, most relevant first.
 *
 * Drifting domains lead, because the admission is more recent and more
 * specific than the ranking — someone who ranked career first and then said
 * health is slipping is telling you about health. The ranking follows, then
 * the universal tail fills whatever is left.
 */
export function feelingOptions(input: FeelingInput = {}): string[] {
  const out: string[] = [];
  const push = (v: string | null | undefined) => {
    const s = (v ?? '').trim();
    if (s && !out.includes(s) && out.length < LIMIT) out.push(s);
  };

  /* The named person comes first when there is one. It is the most concrete
     thing the app knows, and it is the only option here that a week later can
     be checked against something that actually happened. */
  const name = (input.personName ?? '').trim();
  if (name) push(`closer to ${name}`);

  for (const d of input.neglected ?? []) push(BY_DOMAIN[d]);
  for (const d of input.ranking ?? []) push(BY_DOMAIN[d]);
  for (const f of UNIVERSAL) push(f);

  /* Belt and braces: if every source was empty or unrecognised, the step still
     has to render something rather than an empty row. */
  if (!out.length) return [...UNIVERSAL];
  return out;
}
