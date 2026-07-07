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
