/**
 * Priority — deterministic scoring engine.
 *
 * Design rules (from PRD + research):
 *  - Pure functions only. No I/O, no LLM calls. Fully unit-testable.
 *  - All weights configurable via ScoringConfig (persisted in app_config).
 *  - Scores are 0..100 unless stated otherwise.
 *  - Time decay everywhere: attention is about *recent* behavior, not lifetime totals.
 *  - Forgiving streaks: frequency-based, with grace, to avoid the
 *    "what-the-hell effect" that kills habit-tracker retention.
 *  - Opportunity estimates are pace-based arithmetic and must always be
 *    surfaced with their assumptions.
 */

export * from './opportunity';
export * from './streaks';
export * from './timeReality';
export * from './timeWindows';
export * from './safety';
export * from './tinySteps';
export * from './lifeWindows';
export * from './timeArithmetic';
export * from './timeStacking';
export * from './allocation';
export * from './lifeStrategy';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface ScoringConfig {
  /** Half-life (days) for behavioral evidence decay. */
  attentionHalfLifeDays: number;
  /** Weight of the importance/attention gap in neglect risk. */
  neglectGapWeight: number;
  /** Weight of staleness (days since last meaningful action) in neglect risk. */
  neglectStalenessWeight: number;
  /** Weight of avoidance signals (snoozes/skips) in neglect risk. */
  neglectAvoidanceWeight: number;
  /** Days of no meaningful action after which staleness saturates. */
  stalenessSaturationDays: number;
  /** Snooze count at which avoidance signal saturates. */
  snoozeSaturation: number;
  /** Relationship priority weights. */
  relationship: {
    closenessWeight: number;
    overdueWeight: number;
    desireWeight: number;
    ageUrgencyWeight: number;
    /** Age (of the other person) at which urgency saturates. */
    ageUrgencySaturation: number;
  };
  /** Domain health mix. */
  domainHealth: {
    attentionWeight: number;
    inverseNeglectWeight: number;
    momentumWeight: number;
  };
}

export const DEFAULT_SCORING_CONFIG: ScoringConfig = {
  attentionHalfLifeDays: 10,
  neglectGapWeight: 0.5,
  neglectStalenessWeight: 0.3,
  neglectAvoidanceWeight: 0.2,
  stalenessSaturationDays: 30,
  snoozeSaturation: 5,
  relationship: {
    closenessWeight: 0.3,
    overdueWeight: 0.35,
    desireWeight: 0.15,
    ageUrgencyWeight: 0.2,
    ageUrgencySaturation: 75,
  },
  domainHealth: {
    attentionWeight: 0.45,
    inverseNeglectWeight: 0.35,
    momentumWeight: 0.2,
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export const clamp = (v: number, lo = 0, hi = 100): number =>
  Math.min(hi, Math.max(lo, v));

/** Exponential time decay: weight of an event that happened `ageDays` ago. */
export const decay = (ageDays: number, halfLifeDays: number): number =>
  Math.pow(0.5, Math.max(0, ageDays) / halfLifeDays);

const round1 = (v: number) => Math.round(v * 10) / 10;

// ---------------------------------------------------------------------------
// Importance: what the user SAYS matters
// ---------------------------------------------------------------------------

export interface ImportanceInput {
  /** 1 = top ranked priority. Undefined if user didn't rank this domain. */
  priorityRank?: number;
  /** How many domains were ranked in total. */
  totalRanked: number;
  /** Active goals in this domain. */
  activeGoalCount: number;
  /** User flagged this domain as neglected / "want more of" during onboarding. */
  flaggedAsNeglected: boolean;
  /** User listed a regret risk tied to this domain. */
  regretRiskFlagged: boolean;
}

export function calculateImportanceScore(input: ImportanceInput): number {
  // Rank contributes up to 60 points, linearly by inverted rank position.
  let rankScore = 0;
  if (input.priorityRank !== undefined && input.totalRanked > 0) {
    const inverted =
      (input.totalRanked - (input.priorityRank - 1)) / input.totalRanked;
    rankScore = 60 * inverted;
  }
  const goalScore = clamp(input.activeGoalCount * 8, 0, 20);
  const neglectFlag = input.flaggedAsNeglected ? 10 : 0;
  const regretFlag = input.regretRiskFlagged ? 10 : 0;
  return round1(clamp(rankScore + goalScore + neglectFlag + regretFlag));
}

// ---------------------------------------------------------------------------
// Attention: what the user's behavior SHOWS
// ---------------------------------------------------------------------------

export interface BehaviorEvent {
  /** Days ago the event happened (0 = today). */
  ageDays: number;
  /** Base weight of the event type, e.g. mission complete = 10, habit tick = 4, journal mention = 2. */
  weight: number;
}

export const EVENT_WEIGHTS = {
  missionCompleted: 10,
  habitCompleted: 4,
  journalMention: 2,
} as const;

export function calculateAttentionScore(
  events: BehaviorEvent[],
  config: ScoringConfig = DEFAULT_SCORING_CONFIG,
): number {
  // A "fully attended" domain ≈ one mission + a few habit ticks per week.
  // Saturation point: 30 decayed weight units.
  const SATURATION = 30;
  const total = events.reduce(
    (acc, e) => acc + e.weight * decay(e.ageDays, config.attentionHalfLifeDays),
    0,
  );
  return round1(clamp((total / SATURATION) * 100));
}

// ---------------------------------------------------------------------------
// Neglect risk: the gap between saying and doing
// ---------------------------------------------------------------------------

export interface NeglectInput {
  importance: number; // 0..100
  attention: number;  // 0..100
  daysSinceLastMeaningfulAction: number | null; // null = never
  snoozeCount: number; // snoozes/skips on missions in this domain, recent window
}

export function calculateNeglectRiskScore(
  input: NeglectInput,
  config: ScoringConfig = DEFAULT_SCORING_CONFIG,
): number {
  // Gap only counts when importance exceeds attention (over-attention is fine).
  const gap = clamp(input.importance - input.attention) / 100; // 0..1
  const days =
    input.daysSinceLastMeaningfulAction === null
      ? config.stalenessSaturationDays
      : input.daysSinceLastMeaningfulAction;
  const staleness = clamp(days / config.stalenessSaturationDays, 0, 1);
  const avoidance = clamp(input.snoozeCount / config.snoozeSaturation, 0, 1);

  const risk =
    100 *
    (gap * config.neglectGapWeight +
      staleness * config.neglectStalenessWeight +
      avoidance * config.neglectAvoidanceWeight);

  // Neglect of an unimportant domain is not a risk: scale by importance.
  return round1(clamp(risk * (input.importance / 100)));
}

// ---------------------------------------------------------------------------
// Domain health (the "current score" on domain cards)
// ---------------------------------------------------------------------------

export interface DomainScoreInput {
  attention: number;
  neglectRisk: number;
  /** Attention score computed for the previous period, for momentum/trend. */
  previousAttention: number;
}

export interface DomainScoreResult {
  health: number;
  trend: 'up' | 'flat' | 'down';
}

export function calculateDomainScore(
  input: DomainScoreInput,
  config: ScoringConfig = DEFAULT_SCORING_CONFIG,
): DomainScoreResult {
  const momentumRaw = input.attention - input.previousAttention; // -100..100
  const momentum = clamp(50 + momentumRaw / 2); // normalize to 0..100 around 50
  const w = config.domainHealth;
  const health = round1(
    clamp(
      input.attention * w.attentionWeight +
        (100 - input.neglectRisk) * w.inverseNeglectWeight +
        momentum * w.momentumWeight,
    ),
  );
  const trend: DomainScoreResult['trend'] =
    momentumRaw > 5 ? 'up' : momentumRaw < -5 ? 'down' : 'flat';
  return { health, trend };
}

// ---------------------------------------------------------------------------
// Relationship priority
// ---------------------------------------------------------------------------

export type Cadence =
  | 'daily' | 'weekly' | 'biweekly' | 'monthly'
  | 'quarterly' | 'yearly' | 'rarely';

export const CADENCE_DAYS: Record<Cadence, number> = {
  daily: 1,
  weekly: 7,
  biweekly: 14,
  monthly: 30,
  quarterly: 91,
  yearly: 365,
  rarely: 365,
};

export interface RelationshipPriorityInput {
  closenessScore: number; // 1..10 from onboarding
  wantsMoreTime: boolean;
  desiredContactCadence: Cadence;
  daysSinceLastContact: number | null; // null = unknown/never logged
  age: number | null; // of the other person
}

export function calculateRelationshipPriorityScore(
  input: RelationshipPriorityInput,
  config: ScoringConfig = DEFAULT_SCORING_CONFIG,
): number {
  const w = config.relationship;
  const closeness = clamp((input.closenessScore / 10) * 100);

  const cadenceDays = CADENCE_DAYS[input.desiredContactCadence];
  const since =
    input.daysSinceLastContact === null
      ? cadenceDays * 2 // never logged → assume overdue
      : input.daysSinceLastContact;
  // 0 when on schedule, 100 when 2x+ past the desired cadence.
  const overdue = clamp(((since - cadenceDays) / cadenceDays) * 100);

  const desire = input.wantsMoreTime ? 100 : 30;

  const ageUrgency =
    input.age === null
      ? 30
      : clamp((input.age / w.ageUrgencySaturation) * 100);

  return round1(
    clamp(
      closeness * w.closenessWeight +
        overdue * w.overdueWeight +
        desire * w.desireWeight +
        ageUrgency * w.ageUrgencyWeight,
    ),
  );
}

// ---------------------------------------------------------------------------
// Daily mission ranking — pick THE one thing for today
// ---------------------------------------------------------------------------

export interface RankableMission {
  id: string;
  domainNeglectRisk: number; // 0..100
  domainImportance: number;  // 0..100
  relationshipPriority?: number; // 0..100 when tied to a person
  dueInDays: number | null;  // negative = overdue
  estimatedMinutes: number | null;
  snoozeCount: number;
}

/**
 * Rank candidate missions. Research note: apps die from choice overload —
 * the dashboard should surface rank[0] as "today's mission" and at most
 * 2 supporting items.
 */
export function rankMissions(missions: RankableMission[]): RankableMission[] {
  const score = (m: RankableMission): number => {
    const neglect = m.domainNeglectRisk * 0.4;
    const importance = m.domainImportance * 0.2;
    const rel = (m.relationshipPriority ?? 0) * 0.25;
    let urgency = 0;
    if (m.dueInDays !== null) {
      if (m.dueInDays < 0) urgency = 100;
      else urgency = clamp(100 - m.dueInDays * 15);
    }
    // Slight boost for small tasks (activation energy) and repeatedly snoozed ones.
    const friction =
      m.estimatedMinutes !== null && m.estimatedMinutes <= 15 ? 5 : 0;
    const snoozeNudge = clamp(m.snoozeCount * 3, 0, 10);
    return neglect + importance + rel + urgency * 0.15 + friction + snoozeNudge;
  };
  return [...missions].sort((a, b) => score(b) - score(a));
}
