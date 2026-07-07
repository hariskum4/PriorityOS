/**
 * Time-stacking — the "steal the time" engine.
 *
 * The honest answer to "how do I serve 8 life domains in ~42 free hours":
 * you don't buy separate hours for each — you STACK. One walk with a parent
 * is health + family. One audiobook commute is growth + reclaimed dead time.
 * (Habit-stacking / "kill two birds" — Clear, Scott; documented behavior-change
 * technique.) Given a user's most-neglected domains, this proposes single
 * actions that feed two or three of them at once.
 *
 * Deterministic and local. Every stack names a concrete action.
 */

export interface Stack {
  key: string;
  action: string;
  domains: string[];
  framing: string;
}

const CATALOG: Stack[] = [
  { key: 'walk_call_parent', action: 'Take your walk while calling a parent', domains: ['health', 'family'], framing: 'Movement and a real conversation in the same 20 minutes.' },
  { key: 'cook_with_kid', action: 'Cook dinner with your child, no screens', domains: ['children', 'health'], framing: 'A shared ritual that also feeds you both well.' },
  { key: 'commute_learn', action: 'Turn your commute into an audiobook or course', domains: ['growth', 'experiences'], framing: 'Reclaimed dead time becomes the skill you keep postponing.' },
  { key: 'workout_friend', action: 'Train with a friend once a week', domains: ['health', 'friends'], framing: 'Accountability and the friendship, in one slot.' },
  { key: 'weekend_trip_family', action: 'Plan a weekend trip with the family', domains: ['family', 'experiences'], framing: 'A memory and time together, from the same weekend.' },
  { key: 'gratitude_partner', action: 'Share one gratitude with your partner at night', domains: ['partner', 'reflection'], framing: 'Presence and inner practice in sixty seconds.' },
  { key: 'teach_skill', action: 'Teach someone the thing you are learning', domains: ['growth', 'impact'], framing: 'Learning sticks when you give it away.' },
  { key: 'creative_with_kid', action: 'Make something with your child — draw, build, record', domains: ['purpose', 'children'], framing: 'Your creative practice, and their childhood, at once.' },
  { key: 'volunteer_family', action: 'Volunteer together as a family', domains: ['impact', 'family'], framing: 'Contribution that your kids will remember you for.' },
  { key: 'walk_meeting', action: 'Take one work call as a walking meeting', domains: ['career', 'health'], framing: 'The work still happens; your body stops paying for it.' },
  { key: 'money_date', action: 'A monthly money review with your partner', domains: ['finance', 'partner'], framing: 'Shared clarity beats separate anxiety.' },
  { key: 'nature_reflect', action: 'A quiet walk outdoors, phone in your pocket', domains: ['health', 'reflection'], framing: 'The cheapest reset there is — moving and thinking.' },
];

/**
 * Rank stacks by how much they help the user's neglected domains.
 * A stack that covers two neglected domains beats one that covers one.
 */
export function suggestStacks(
  neglectedDomains: string[],
  limit = 3,
): Array<Stack & { covers: string[] }> {
  const need = new Set(neglectedDomains);
  const scored = CATALOG.map((st) => {
    const covers = st.domains.filter((d) => need.has(d));
    return { ...st, covers, score: covers.length };
  })
    .filter((st) => st.score > 0)
    .sort((a, b) => b.score - a.score);

  // If nothing matched (user has no flagged neglect), offer broadly useful stacks.
  const source = scored.length
    ? scored
    : CATALOG.map((st) => ({ ...st, covers: [] as string[], score: 0 }));
  return source.slice(0, limit).map(({ score, ...rest }) => rest);
}

/** Total domains a set of stacks would touch — the "everything, in fewer hours" number. */
export function domainsCovered(stacks: Stack[]): string[] {
  return [...new Set(stacks.flatMap((s) => s.domains))];
}
