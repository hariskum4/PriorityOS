/** Shared domain types for Priority. Single source of truth used by API, mobile and scoring engine. */

export type DomainType =
  | 'family'
  | 'partner'
  | 'children'
  | 'health'
  | 'career'
  | 'finance'
  | 'growth'
  | 'friends'
  | 'experiences'
  | 'reflection'
  | 'purpose'   // Creative & Purpose — life's work, side projects, legacy
  | 'impact';   // Contribution & Impact — giving back, mentoring, causes

export const ALL_DOMAINS: DomainType[] = [
  'family', 'partner', 'children', 'health', 'career',
  'finance', 'growth', 'friends', 'experiences', 'reflection',
  'purpose', 'impact',
];

export type MissionType = 'one_time' | 'ritual' | 'milestone' | 'relationship' | 'recovery';
export type MissionStatus = 'pending' | 'completed' | 'skipped' | 'expired';
export type MissionSource = 'AI' | 'user' | 'system';

export type ContactFrequency =
  | 'daily' | 'weekly' | 'biweekly' | 'monthly'
  | 'quarterly' | 'yearly' | 'rarely';

export type InsightIntensity = 'off' | 'gentle' | 'direct';
export type MotivationStyle = 'gentle' | 'balanced' | 'challenging';

export interface DomainScoreSnapshot {
  domain: DomainType;
  importance: number;      // 0..100 what the user says matters
  attention: number;       // 0..100 what their behavior shows
  neglectRisk: number;     // 0..100 gap-driven risk
  health: number;          // 0..100 composite "current score"
  trend: 'up' | 'flat' | 'down';
}

export interface OpportunityInsight {
  kind: 'visits_remaining' | 'calls_per_year' | 'shared_weekends' | 'habit_delta';
  relationshipId?: string;
  domain: DomainType;
  headline: string;
  detail: string;
  assumptions: string[];   // ALWAYS surfaced — these are estimates, never predictions
  estimate: number;
  unit: string;
}

// ---------------------------------------------------------------------------
// Taxonomy bridge — the app's twelve domains ↔ the Life OS kernel's eight
//
// The product surfaces twelve domains because that is how people describe a
// life ("partner" and "children" are not the same relationship). The kernel's
// balance model uses eight, because cross-domain influence stays tractable at
// eight and turns to mush at twelve.
//
// Both mappings live here, next to DomainType, so the API and the mobile client
// can never disagree about which star a proposal belongs to. Every previous
// version of this map was a private const in one file, which is exactly how a
// filter silently stops matching.
// ---------------------------------------------------------------------------

/** The kernel's eight. Mirrors `Domain` in @priority/life-os. */
export type LifeDomain =
  | 'relationships'
  | 'health'
  | 'career'
  | 'finances'
  | 'growth'
  | 'experiences'
  | 'mindfulness'
  | 'purpose';

export const ALL_LIFE_DOMAINS: LifeDomain[] = [
  'relationships', 'health', 'career', 'finances',
  'growth', 'experiences', 'mindfulness', 'purpose',
];

/** Twelve → eight. Lossy by design. */
export const DOMAIN_TO_LIFE: Record<DomainType, LifeDomain> = {
  family: 'relationships',
  partner: 'relationships',
  children: 'relationships',
  friends: 'relationships',
  health: 'health',
  career: 'career',
  finance: 'finances',
  growth: 'growth',
  experiences: 'experiences',
  reflection: 'mindfulness',
  purpose: 'purpose',
  impact: 'purpose',
};

/**
 * Eight → one representative twelve.
 *
 * Only for writing a record that needs a concrete domain (a Mission). Lossy in
 * the other direction too: `relationships` picks `family` because it is the
 * broadest, but a proposal about a named person should resolve its domain from
 * that person's `relationType` instead of using this.
 */
export const LIFE_TO_DOMAIN: Record<LifeDomain, DomainType> = {
  relationships: 'family',
  health: 'health',
  career: 'career',
  finances: 'finance',
  growth: 'growth',
  experiences: 'experiences',
  mindfulness: 'reflection',
  purpose: 'purpose',
};

/** A relationship's own type decides its domain, which is finer than the map. */
export function domainForRelationType(relationType: string): DomainType {
  const t = relationType.toLowerCase();
  if (t === 'spouse' || t === 'partner') return 'partner';
  if (t === 'child' || t === 'children' || t === 'son' || t === 'daughter') return 'children';
  if (t === 'friend' || t === 'friends' || t === 'mentor') return 'friends';
  return 'family';
}
