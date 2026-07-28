/**
 * The Prediction Engine.
 *
 * Forecasts burnout risk, relationship drift, and life-balance trajectory from
 * the weekly samples the app already collects. The interesting engineering here
 * is not the forecasting — least-squares on a short series is undergraduate
 * maths — it is the restraint.
 *
 * Three rules, and the first is the one that matters:
 *
 *   · **It refuses to guess.** Below `MIN_SAMPLES` the engine emits nothing at
 *     all. Not a low-confidence estimate, not a hedge — silence. A forecast from
 *     three data points about someone's marriage is worse than no forecast,
 *     because a number on a screen is believed regardless of its caveat.
 *
 *   · **Every projection states its uncertainty and its assumptions.** Required
 *     by the contract, and enforced here by construction: no code path produces
 *     a projection without one.
 *
 *   · **Trends, never fates.** The language is always "at this pace" and always
 *     names the thing that would change it. A prediction the person cannot
 *     falsify or act against is a horoscope with better typography.
 *
 * Deterministic. `now` comes from the context; nothing is generated.
 */

import {
  Domain, Engine, EngineContext, EngineOutput, Evidence,
  Observation, Proposal, Uncertainty,
} from './contract';

/** Fewer samples than this and the engine stays quiet. */
export const MIN_SAMPLES = 6;
/** Weeks ahead the projection runs. Beyond this, a linear fit is fiction. */
const HORIZON_WEEKS = 8;

export interface PredictionEngineData {
  /** Weekly attention samples per domain, oldest first. */
  attentionHistory: Array<{ domain: Domain; weekly: number[] }>;
  /**
   * Weekly self-reported energy, oldest first. The strongest single burnout
   * signal available without wearables.
   */
  energyWeekly?: number[];
  /** Gap in days between successive contacts per person, oldest first. */
  contactGaps: Array<{ id: string; name: string; gapsDays: number[]; desiredGapDays: number }>;
}

// ---------------------------------------------------------------------------
// Trend maths
// ---------------------------------------------------------------------------

export interface Trend {
  /** Units per week. Positive means rising. */
  slope: number;
  /** Fitted value at the most recent sample. */
  current: number;
  /** Fitted value `weeks` ahead. */
  projected: number;
  /** 0..1 — how well a straight line explains the data. */
  fit: number;
  samples: number;
}

/**
 * Least-squares linear fit with an R² so the caller knows whether the line
 * means anything. A confident slope through noise is the classic way to
 * manufacture a scary prediction, so `fit` gates every claim downstream.
 */
export function linearTrend(series: number[], weeksAhead = HORIZON_WEEKS): Trend | null {
  const n = series.length;
  if (n < MIN_SAMPLES) return null;

  const xs = series.map((_, i) => i);
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = series.reduce((a, b) => a + b, 0) / n;

  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - meanX) * (series[i] - meanY);
    sxx += (xs[i] - meanX) ** 2;
  }
  const slope = sxx === 0 ? 0 : sxy / sxx;
  const intercept = meanY - slope * meanX;

  let ssRes = 0;
  let ssTot = 0;
  for (let i = 0; i < n; i++) {
    const predicted = intercept + slope * xs[i];
    ssRes += (series[i] - predicted) ** 2;
    ssTot += (series[i] - meanY) ** 2;
  }
  const fit = ssTot === 0 ? 1 : Math.max(0, 1 - ssRes / ssTot);

  const current = intercept + slope * (n - 1);
  return {
    slope,
    current,
    projected: Math.max(0, Math.min(100, current + slope * weeksAhead)),
    fit,
    samples: n,
  };
}

/** Uncertainty derived from sample count and how well a line fits. */
function uncertaintyFor(trend: Trend, what: string): Uncertainty {
  const level: Uncertainty['level'] =
    trend.samples >= 12 && trend.fit >= 0.6 ? 'low'
      : trend.samples >= 8 && trend.fit >= 0.35 ? 'moderate'
        : 'high';
  return {
    level,
    basis: `${trend.samples} weekly samples, straight-line fit ${Math.round(trend.fit * 100)}%`,
    assumptions: [
      `Assumes the last ${trend.samples} weeks continue in the same direction.`,
      `Projected ${HORIZON_WEEKS} weeks out; further than that a straight line stops meaning anything.`,
      `This is ${what} at your current pace — not a prediction about you, and it changes the moment your pace does.`,
    ],
  };
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

/** Slope steeper than this (points/week) is a direction worth mentioning. */
const MEANINGFUL_SLOPE = 1.2;
/** A line this loose is noise; say nothing. */
const MIN_FIT = 0.3;

export const predictionEngine: Engine = {
  id: 'prediction',
  dependsOn: ['goal', 'relationship'],

  run(ctx: EngineContext): EngineOutput {
    const data = ctx.data.prediction as PredictionEngineData | undefined;
    if (!data) return { observations: [], proposals: [] };

    const observations: Observation[] = [];
    const proposals: Proposal[] = [];

    // ---- burnout risk --------------------------------------------------
    // Composite, and it only fires when work is climbing *and* recovery is
    // falling. Working hard is not burnout; working hard while the tank drains
    // is. Requiring both signals is what keeps this from crying wolf.
    const career = data.attentionHistory.find((h) => h.domain === 'career');
    const careerTrend = career ? linearTrend(career.weekly) : null;
    const energyTrend = data.energyWeekly ? linearTrend(data.energyWeekly) : null;

    if (
      careerTrend && energyTrend
      && careerTrend.slope > MEANINGFUL_SLOPE
      && energyTrend.slope < -MEANINGFUL_SLOPE
      && careerTrend.fit >= MIN_FIT && energyTrend.fit >= MIN_FIT
    ) {
      const id = 'prediction:burnout';
      const weeksToEmpty = energyTrend.slope < 0
        ? Math.max(1, Math.round(energyTrend.current / Math.abs(energyTrend.slope)))
        : null;

      observations.push({
        id,
        engine: 'prediction',
        domain: 'health',
        statement: weeksToEmpty && weeksToEmpty <= HORIZON_WEEKS * 2
          ? `Work has been climbing while your energy has been falling for ${energyTrend.samples} weeks. At this pace you run empty in roughly ${weeksToEmpty} weeks.`
          : `Work has been climbing while your energy has been falling for ${energyTrend.samples} weeks. The two lines are heading in opposite directions.`,
        magnitude: Math.min(100, Math.round(Math.abs(energyTrend.slope) * 12 + careerTrend.slope * 8)),
        pressure: 'mention',
        evidence: [
          { label: 'career attention slope (per week)', value: Math.round(careerTrend.slope * 10) / 10, source: 'behaviour:weekly attention' },
          { label: 'energy slope (per week)', value: Math.round(energyTrend.slope * 10) / 10, source: 'self-report:weekly energy' },
          { label: 'weeks of data', value: energyTrend.samples, source: 'self-report:weekly energy' },
        ],
        uncertainty: uncertaintyFor(energyTrend, 'where your energy is heading'),
        observedAt: ctx.now,
      });
      proposals.push({
        id: `${id}:recover`,
        engine: 'prediction',
        domain: 'health',
        action: 'Put one recovery block in this week',
        because: `Both lines turn on the same thing: one block that work is not allowed to take.`,
        effortMinutes: 5,
        pressure: 'whisper',
        addresses: [id],
        tinyStep: 'Block ninety minutes. Do not decide yet what goes in it.',
        dismissible: true,
      });
    }

    // ---- relationship drift --------------------------------------------
    // Widening gaps against the person's own target, not against a norm.
    for (const contact of data.contactGaps) {
      const trend = linearTrend(contact.gapsDays);
      if (!trend || trend.slope <= 0.75 || trend.fit < MIN_FIT) continue;

      const id = `prediction:drift:${contact.id}`;
      const projectedGap = Math.round(trend.projected);
      if (projectedGap <= contact.desiredGapDays) continue; // still inside their target

      observations.push({
        id,
        engine: 'prediction',
        domain: 'relationships',
        statement: `The gaps between talking to ${contact.name} have been widening. At this rate they reach about ${projectedGap} days by ${HORIZON_WEEKS} weeks from now, against the ${contact.desiredGapDays} you wanted.`,
        magnitude: Math.min(100, Math.round((projectedGap / Math.max(1, contact.desiredGapDays)) * 25)),
        pressure: 'whisper',
        evidence: [
          { label: `gap widening (days per contact)`, value: Math.round(trend.slope * 10) / 10, source: 'ContactLog' },
          { label: 'contacts measured', value: trend.samples, source: 'ContactLog' },
          { label: 'your target gap (days)', value: contact.desiredGapDays, source: 'Relationship.desiredCallFrequency' },
        ],
        uncertainty: uncertaintyFor(trend, `where this friendship's rhythm is heading`),
        subjects: [contact.id],
        observedAt: ctx.now,
      });
      proposals.push({
        id: `${id}:close`,
        engine: 'prediction',
        domain: 'relationships',
        action: `Message ${contact.name} this week`,
        because: `Drift is easy to reverse early and genuinely hard to reverse late.`,
        effortMinutes: 3,
        pressure: 'whisper',
        addresses: [id],
        tinyStep: 'One line. No occasion needed.',
        dismissible: true,
      });
    }

    // ---- balance trajectory --------------------------------------------
    // The domain falling fastest, so a slide gets named while it is still small.
    const falling = data.attentionHistory
      .map((h) => ({ domain: h.domain, trend: linearTrend(h.weekly) }))
      .filter((x): x is { domain: Domain; trend: Trend } => x.trend !== null)
      .filter((x) => x.trend.slope < -MEANINGFUL_SLOPE && x.trend.fit >= MIN_FIT)
      .sort((a, b) => a.trend.slope - b.trend.slope);

    if (falling.length) {
      const worst = falling[0];
      const id = `prediction:balance:${worst.domain}`;
      const evidence: Evidence[] = [
        { label: `${worst.domain} slope (per week)`, value: Math.round(worst.trend.slope * 10) / 10, source: 'behaviour:weekly attention' },
        { label: 'now', value: Math.round(worst.trend.current), source: 'behaviour:weekly attention' },
        { label: `in ${HORIZON_WEEKS} weeks at this pace`, value: Math.round(worst.trend.projected), source: 'life-os:projection' },
      ];
      observations.push({
        id,
        engine: 'prediction',
        domain: worst.domain,
        statement: `${worst.domain} has been sliding for ${worst.trend.samples} weeks — around ${Math.round(worst.trend.current)} now, heading for ${Math.round(worst.trend.projected)} if nothing changes.`,
        magnitude: Math.min(100, Math.round(Math.abs(worst.trend.slope) * 15)),
        pressure: 'whisper',
        evidence,
        uncertainty: uncertaintyFor(worst.trend, `where ${worst.domain} is heading`),
        observedAt: ctx.now,
      });
    }

    return { observations, proposals };
  },
};
