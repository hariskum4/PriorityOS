/**
 * The adaptive loop — suggest the NEXT meaningful action, forever.
 *
 * When a mission completes, the app must not fall silent: it reads the
 * live life-graph (domain gaps, relationship drift, stalled goals) and
 * proposes the next-best small action. Complete that, scores shift,
 * and the next suggestion is different — that is the learning loop:
 * behavior in, priorities out, every single day.
 *
 * Deterministic by design. Selection order mirrors the product thesis:
 *   1. A person you're overdue with (relationships are the point).
 *   2. The domain drifting hardest toward regret.
 *   3. A goal with no scheduled step (a goal without a step is a wish).
 *   4. The widest say-do gap, as a gentle default.
 * Variety guard: never the same domain twice in a row unless it is the
 * one at serious risk.
 */

export interface NextMissionDomain {
  domainType: string;
  importance: number;   // 0..100
  attention: number;    // 0..100
  neglectRisk: number;  // 0..100
}

export interface NextMissionRelationship {
  id: string;
  name: string;
  relationType: string;
  daysSinceContact: number | null;
  desiredCadenceDays: number; // from desiredCallFrequency
}

export interface NextMissionGoal {
  id: string;
  title: string;
  domainType: string;
}

export interface NextMissionContext {
  domains: NextMissionDomain[];
  relationships: NextMissionRelationship[];
  goalsWithoutSteps: NextMissionGoal[];
  /** Domain of the mission just completed — variety guard input. */
  lastCompletedDomain?: string | null;
  /** Domains already covered by pending missions — don't double up. */
  pendingDomains: string[];
  /** Relationships already covered by a pending mission — don't nag twice. */
  pendingRelationshipIds?: string[];
  /** Exact titles already pending — never suggest a literal duplicate. */
  pendingTitles?: string[];
  /** Titles suggested/created recently (~7 days) — rotate, don't repeat. */
  recentTitles?: string[];
  /**
   * Titles the user has pushed away (snoozed 2+ times). Dismissal is data:
   * "not this action" — the engine offers a different one, or yields the
   * domain entirely when every variant has been declined.
   */
  dismissedTitles?: string[];
}

export interface MissionSuggestion {
  title: string;
  domainType: string;
  missionType: 'relationship' | 'one_time';
  relationshipId?: string;
  goalId?: string;
  estimatedMinutes: number;
  xpReward: number;
  rationale: string;
}

/**
 * Small, concrete, finishable-today actions per domain — several per domain,
 * because the same reward repeated is how habit apps die ("reward fatigue").
 * The engine rotates through variants and retires the ones a user dismisses.
 * Variant [0] is the classic default; keep it stable.
 */
type DomainAction = { title: string; minutes: number };
const DOMAIN_ACTIONS: Record<string, DomainAction[]> = {
  family: [
    { title: 'Call someone in your family — ten minutes counts', minutes: 10 },
    { title: 'Send a photo that will make your family smile', minutes: 3 },
    { title: 'Ask a parent one question about their younger years', minutes: 15 },
    { title: 'Plan the next visit — put a date on it', minutes: 10 },
  ],
  partner: [
    { title: 'Plan a phone-free evening together', minutes: 15 },
    { title: 'Say one specific thank-you tonight', minutes: 2 },
    { title: 'Book the next date — this week, on the calendar', minutes: 10 },
    { title: 'Ask about their day and only listen', minutes: 15 },
  ],
  children: [
    { title: 'One undivided hour with your child', minutes: 60 },
    { title: 'Let them pick the game tonight — you just play', minutes: 30 },
    { title: 'Ask what made them laugh today', minutes: 10 },
    { title: 'Read one more chapter than usual at bedtime', minutes: 20 },
  ],
  friends: [
    { title: 'Message the friend you keep meaning to reach', minutes: 5 },
    { title: 'Send that friend the thing that reminded you of them', minutes: 3 },
    { title: 'Put a date in the calendar to meet a friend', minutes: 10 },
    { title: 'Voice note instead of text — thirty seconds of you', minutes: 5 },
  ],
  health: [
    { title: 'A 20-minute walk, today', minutes: 20 },
    { title: 'Lights out thirty minutes earlier tonight', minutes: 5 },
    { title: 'Ten minutes of stretching before you sit down', minutes: 10 },
    { title: 'Drink water first, coffee second, all morning', minutes: 2 },
  ],
  career: [
    { title: 'Block two hours of focused work for tomorrow', minutes: 10 },
    { title: 'Finish the one task you keep reopening', minutes: 45 },
    { title: 'Write down what "done" looks like this week', minutes: 10 },
    { title: 'Ask for the feedback you have been avoiding', minutes: 15 },
  ],
  finance: [
    { title: 'A 15-minute money review', minutes: 15 },
    { title: 'Cancel one subscription you forgot about', minutes: 10 },
    { title: 'Automate one saving — small is fine', minutes: 15 },
    { title: 'Check one bill you have been ignoring', minutes: 10 },
  ],
  growth: [
    { title: 'Read ten pages, properly', minutes: 20 },
    { title: 'Twenty minutes learning the thing you said you would', minutes: 20 },
    { title: 'Write three sentences about what you learned today', minutes: 5 },
    { title: 'Watch one lesson, take one note', minutes: 20 },
  ],
  experiences: [
    { title: 'Plan one small adventure for this month', minutes: 15 },
    { title: 'Walk a street you have never walked', minutes: 30 },
    { title: 'Book the thing you keep browsing', minutes: 15 },
    { title: 'Take the long way home and notice things', minutes: 20 },
  ],
  reflection: [
    { title: 'Sit quietly for five minutes', minutes: 5 },
    { title: 'Write one honest paragraph about today', minutes: 10 },
    { title: 'Three things that went right this week — write them', minutes: 5 },
    { title: 'Ten slow breaths before you open anything', minutes: 3 },
  ],
  purpose: [
    { title: 'Thirty minutes on the project that matters', minutes: 30 },
    { title: 'The smallest next step on the big thing — do it now', minutes: 15 },
    { title: 'Tell one person about what you are building', minutes: 10 },
    { title: 'Sketch the next milestone in five bullet points', minutes: 10 },
  ],
  impact: [
    { title: 'Do one concrete thing for someone else today', minutes: 15 },
    { title: 'Share what you know with someone one step behind you', minutes: 20 },
    { title: 'A small donation to the cause you believe in', minutes: 5 },
    { title: 'Thank someone who never gets thanked', minutes: 5 },
  ],
};

const SERIOUS_RISK = 60;   // variety guard yields to genuine danger
const RISK_FLOOR = 40;     // below this, a domain isn't "drifting"
const OVERDUE_RATIO = 1.5; // 50% past the desired cadence

export function suggestNextMission(
  ctx: NextMissionContext,
): MissionSuggestion | null {
  const covered = new Set(ctx.pendingDomains);
  const norm = (t: string) => t.trim().toLowerCase();
  const takenTitles = new Set((ctx.pendingTitles ?? []).map(norm));
  const recentTitles = new Set((ctx.recentTitles ?? []).map(norm));
  const dismissedTitles = new Set((ctx.dismissedTitles ?? []).map(norm));
  const isTaken = (title: string) => takenTitles.has(norm(title));
  const last = ctx.lastCompletedDomain ?? null;

  /**
   * Pick the best action variant for a domain:
   *  - never a title that's pending or that the user has dismissed,
   *  - prefer one they haven't seen lately (rotation beats repetition),
   *  - null when every variant is rejected — the user said "not this
   *    domain's actions", and the engine respects that instead of nagging.
   */
  const pickAction = (domainType: string): DomainAction | null => {
    const variants = DOMAIN_ACTIONS[domainType] ?? DOMAIN_ACTIONS.reflection;
    const usable = variants.filter(
      (v) => !isTaken(v.title) && !dismissedTitles.has(norm(v.title)),
    );
    if (usable.length === 0) return null;
    return usable.find((v) => !recentTitles.has(norm(v.title))) ?? usable[0];
  };

  // 1. Most-overdue person first (skip anyone already on the plate).
  const coveredRels = new Set(ctx.pendingRelationshipIds ?? []);
  const overdue = ctx.relationships
    .filter((r) => !coveredRels.has(r.id))
    .map((r) => ({
      ...r,
      ratio:
        r.daysSinceContact === null
          ? 2 // never contacted → clearly overdue
          : r.daysSinceContact / Math.max(r.desiredCadenceDays, 1),
    }))
    .filter((r) => r.ratio >= OVERDUE_RATIO)
    .sort((a, b) => b.ratio - a.ratio)[0];
  if (overdue) {
    const days = overdue.daysSinceContact;
    return {
      title:
        days === null
          ? `Reach out to ${overdue.name} — a first hello counts`
          : `Call ${overdue.name} — it's been ${days} days`,
      domainType: relationDomain(overdue.relationType),
      missionType: 'relationship',
      relationshipId: overdue.id,
      estimatedMinutes: 10,
      xpReward: 40,
      rationale:
        days === null
          ? `You said you want more time with ${overdue.name}; nothing is logged yet.`
          : `You wanted contact every ~${overdue.desiredCadenceDays} days; it's been ${days}.`,
    };
  }

  // 2. Domain drifting hardest (variety-guarded). Walk candidates in risk
  // order and take the first whose action pool isn't exhausted/dismissed.
  const driftCandidates = ctx.domains
    .filter((d) => d.importance > 0 && d.neglectRisk >= RISK_FLOOR)
    .filter((d) => !covered.has(d.domainType))
    .filter((d) => d.domainType !== last || d.neglectRisk >= SERIOUS_RISK)
    .sort((a, b) => b.neglectRisk - a.neglectRisk);
  for (const drifting of driftCandidates) {
    const action = pickAction(drifting.domainType);
    if (!action) continue;
    return {
      title: action.title,
      domainType: drifting.domainType,
      missionType: 'one_time',
      estimatedMinutes: action.minutes,
      xpReward: 30,
      rationale: `${drifting.domainType} is drifting — risk ${Math.round(drifting.neglectRisk)} and climbing. One small action resets the clock.`,
    };
  }

  // 3. A goal with no scheduled step (skip steps the user has pushed away).
  const goal = ctx.goalsWithoutSteps.filter(
    (g) => !isTaken(`First step: ${g.title}`) && !dismissedTitles.has(norm(`First step: ${g.title}`)),
  )[0];
  if (goal) {
    return {
      title: `First step: ${goal.title}`,
      domainType: goal.domainType,
      missionType: 'one_time',
      goalId: goal.id, // link it — so the goal stops reading as stepless
      estimatedMinutes: 15,
      xpReward: 40,
      rationale: 'A goal without a scheduled step is a wish. This makes it real.',
    };
  }

  // 4. Widest say-do gap as the gentle default — same walk-the-candidates
  // pattern, so a dismissed action pool yields the domain, not the loop.
  const gapCandidates = ctx.domains
    .filter((d) => d.importance > 0)
    .filter((d) => !covered.has(d.domainType))
    .filter((d) => d.domainType !== last)
    .map((d) => ({ ...d, gap: d.importance - d.attention }))
    .filter((d) => d.gap > 15)
    .sort((a, b) => b.gap - a.gap);
  for (const gap of gapCandidates) {
    const action = pickAction(gap.domainType);
    if (!action) continue;
    return {
      title: action.title,
      domainType: gap.domainType,
      missionType: 'one_time',
      estimatedMinutes: action.minutes,
      xpReward: 25,
      rationale: `You rate ${gap.domainType} at ${Math.round(gap.importance)} importance but it's getting ${Math.round(gap.attention)} attention. Closing gaps is the whole game.`,
    };
  }

  // Genuinely aligned — silence is the honest answer.
  return null;
}

function relationDomain(relationType: string): string {
  if (['mother', 'father', 'parent', 'sibling'].includes(relationType)) return 'family';
  if (['spouse', 'partner'].includes(relationType)) return 'partner';
  if (['son', 'daughter', 'child'].includes(relationType)) return 'children';
  return 'friends';
}
