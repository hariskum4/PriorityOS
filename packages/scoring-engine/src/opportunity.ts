/**
 * Meaningful-opportunity estimation.
 *
 * Product rules (PRD §10.5 + research on mortality-framing apps):
 *  - Estimates, never predictions. Every result carries its assumptions.
 *  - Framed around *pace* ("at your current pace") and *agency*
 *    ("here's what one change adds"), never around death dates.
 *  - Used sparingly: onboarding reveal + weekly review. Daily use of
 *    mortality salience desensitizes users within ~2 weeks (WeCroak pattern).
 */

import { CADENCE_DAYS, Cadence } from './index';

export interface OpportunityEstimate {
  kind: 'visits_remaining' | 'calls_per_year' | 'habit_delta';
  estimate: number;
  unit: string;
  horizonYears: number;
  headline: string;
  detail: string;
  assumptions: string[];
  /** Positive-frame counterpart: what one behavior change adds. */
  uplift?: { change: string; newEstimate: number };
}

export interface VisitPaceInput {
  visitsPerYear: number;   // derived from stated in-person frequency
  horizonYears: number;    // default 10 — a planning horizon, NOT a lifespan
  personLabel: string;     // "your parents", "Amma"
}

export function estimateVisitsRemaining(
  input: VisitPaceInput,
): OpportunityEstimate {
  const estimate = Math.round(input.visitsPerYear * input.horizonYears);
  const upliftVisits = Math.round(
    (input.visitsPerYear + 2) * input.horizonYears,
  );
  return {
    kind: 'visits_remaining',
    estimate,
    unit: 'visits',
    horizonYears: input.horizonYears,
    headline: `At your current pace: ~${estimate} visits with ${input.personLabel} over the next ${input.horizonYears} years.`,
    detail:
      'This is simple arithmetic on your stated visit frequency — a planning lens, not a prediction.',
    assumptions: [
      `Current pace of about ${input.visitsPerYear} visit(s) per year continues unchanged`,
      `${input.horizonYears}-year planning horizon (chosen by you, adjustable)`,
      'No assumptions about anyone\u2019s health or lifespan',
    ],
    uplift: {
      change: 'Adding just 2 visits per year',
      newEstimate: upliftVisits,
    },
  };
}

export function cadenceToPerYear(cadence: Cadence): number {
  return Math.round(365 / CADENCE_DAYS[cadence]);
}

export interface CallDeltaInput {
  currentCadence: Cadence;
  proposedCadence: Cadence;
  personLabel: string;
}

export function estimateCallDelta(input: CallDeltaInput): OpportunityEstimate {
  const now = cadenceToPerYear(input.currentCadence);
  const proposed = cadenceToPerYear(input.proposedCadence);
  const delta = proposed - now;
  return {
    kind: 'calls_per_year',
    estimate: delta,
    unit: 'calls/year',
    horizonYears: 1,
    headline: `Moving from ${input.currentCadence} to ${input.proposedCadence} calls adds ~${delta} conversations a year with ${input.personLabel}.`,
    detail: 'Small cadence changes compound into real shared time.',
    assumptions: [
      'Assumes the new cadence is actually kept',
      'Counts scheduled calls only; spontaneous contact is a bonus',
    ],
  };
}
