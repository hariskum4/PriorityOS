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

/** Small, concrete, finishable-today actions per domain. */
const DOMAIN_ACTIONS: Record<string, { title: string; minutes: number }> = {
  family: { title: 'Call someone in your family — ten minutes counts', minutes: 10 },
  partner: { title: 'Plan a phone-free evening together', minutes: 15 },
  children: { title: 'One undivided hour with your child', minutes: 60 },
  friends: { title: 'Message the friend you keep meaning to reach', minutes: 5 },
  health: { title: 'A 20-minute walk, today', minutes: 20 },
  career: { title: 'Block two hours of focused work for tomorrow', minutes: 10 },
  finance: { title: 'A 15-minute money review', minutes: 15 },
  growth: { title: 'Read ten pages, properly', minutes: 20 },
  experiences: { title: 'Plan one small adventure for this month', minutes: 15 },
  reflection: { title: 'Sit quietly for five minutes', minutes: 5 },
  purpose: { title: 'Thirty minutes on the project that matters', minutes: 30 },
  impact: { title: 'Do one concrete thing for someone else today', minutes: 15 },
};

const SERIOUS_RISK = 60;   // variety guard yields to genuine danger
const RISK_FLOOR = 40;     // below this, a domain isn't "drifting"
const OVERDUE_RATIO = 1.5; // 50% past the desired cadence

export function suggestNextMission(
  ctx: NextMissionContext,
): MissionSuggestion | null {
  const covered = new Set(ctx.pendingDomains);
  const last = ctx.lastCompletedDomain ?? null;

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

  // 2. Domain drifting hardest (variety-guarded).
  const drifting = ctx.domains
    .filter((d) => d.importance > 0 && d.neglectRisk >= RISK_FLOOR)
    .filter((d) => !covered.has(d.domainType))
    .filter((d) => d.domainType !== last || d.neglectRisk >= SERIOUS_RISK)
    .sort((a, b) => b.neglectRisk - a.neglectRisk)[0];
  if (drifting) {
    const action = DOMAIN_ACTIONS[drifting.domainType] ?? DOMAIN_ACTIONS.reflection;
    return {
      title: action.title,
      domainType: drifting.domainType,
      missionType: 'one_time',
      estimatedMinutes: action.minutes,
      xpReward: 30,
      rationale: `${drifting.domainType} is drifting — risk ${Math.round(drifting.neglectRisk)} and climbing. One small action resets the clock.`,
    };
  }

  // 3. A goal with no scheduled step.
  const goal = ctx.goalsWithoutSteps[0];
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

  // 4. Widest say-do gap as the gentle default.
  const gap = ctx.domains
    .filter((d) => d.importance > 0)
    .filter((d) => !covered.has(d.domainType))
    .filter((d) => d.domainType !== last)
    .map((d) => ({ ...d, gap: d.importance - d.attention }))
    .filter((d) => d.gap > 15)
    .sort((a, b) => b.gap - a.gap)[0];
  if (gap) {
    const action = DOMAIN_ACTIONS[gap.domainType] ?? DOMAIN_ACTIONS.reflection;
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
