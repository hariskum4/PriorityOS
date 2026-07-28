/**
 * The Decision Engine.
 *
 * The one place in the product where a person arrives with a real fork in their
 * life — change jobs, move city, have a child, take the money — and wants help
 * thinking rather than an answer.
 *
 * Design commitments, all of them deliberate:
 *
 *   · **It never returns a verdict.** The output is a `lean`, a spread of
 *     factor-by-factor findings, and the strongest argument *against* the lean.
 *     A system that tells people what to do about marriage is not a companion,
 *     and would be wrong often enough to cost someone a decade.
 *
 *   · **It is deterministic.** No LLM anywhere on this path. The project's rule
 *     is that the model narrates and never computes, and this is the highest
 *     stakes computation in the app. The Coach may later put the findings into
 *     warm prose; the arithmetic is fixed, inspectable, and reproducible.
 *
 *   · **Values are weighted by the person, not by us.** The same option scores
 *     differently for someone who ranked relationships first than for someone
 *     who ranked career first. That is the entire point.
 *
 *   · **Regret is asymmetric.** Research on end-of-life regret is consistent:
 *     people regret the things they did not do far more than the things they
 *     did. So inaction carries its own penalty rather than scoring as neutral,
 *     which is the single most important correction to naive pros-and-cons.
 */

import {
  Domain, DOMAINS, Engine, EngineContext, EngineOutput, Evidence,
  Observation, Proposal, Uncertainty,
} from './contract';

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

/** The twelve dimensions the product spec commits to evaluating. */
export type Factor =
  | 'valuesAlignment'
  | 'longTermHappiness'
  | 'financialImpact'
  | 'healthImpact'
  | 'relationshipImpact'
  | 'regretProbability'
  | 'opportunityCost'
  | 'risk'
  | 'stress'
  | 'energy'
  | 'timeCost'
  | 'reversibility';

/**
 * Factors where a *higher* input number is worse, and which therefore get
 * inverted before scoring. Keeping this explicit prevents the classic
 * multi-criteria bug where "risk: 90" quietly reads as a good thing.
 */
const COST_FACTORS: ReadonlySet<Factor> = new Set<Factor>([
  'regretProbability', 'opportunityCost', 'risk', 'stress', 'timeCost',
]);

/**
 * Default weights, before the person's own domain ranking reshapes them.
 *
 * Values alignment and regret dominate on purpose: this product exists to
 * maximise meaningful living and minimise future regret, so the two things it
 * claims to optimise are the two things weighted hardest. Finance matters and
 * is deliberately not king.
 */
export const DEFAULT_WEIGHTS: Record<Factor, number> = {
  valuesAlignment: 1.6,
  regretProbability: 1.5,
  longTermHappiness: 1.35,
  relationshipImpact: 1.2,
  healthImpact: 1.1,
  financialImpact: 0.9,
  energy: 0.8,
  stress: 0.8,
  opportunityCost: 0.75,
  risk: 0.7,
  timeCost: 0.6,
  reversibility: 0.9,
};

/** Which domain each factor speaks for, used to apply the person's ranking. */
const FACTOR_DOMAIN: Partial<Record<Factor, Domain>> = {
  financialImpact: 'finances',
  healthImpact: 'health',
  relationshipImpact: 'relationships',
  longTermHappiness: 'purpose',
  energy: 'health',
  stress: 'mindfulness',
};

export interface OptionScores {
  /** 0..100 per factor. Absent factors are treated as "no signal", not zero. */
  [factor: string]: number | undefined;
}

export interface DecisionOption {
  id: string;
  label: string;
  scores: OptionScores;
  /**
   * True for the do-nothing option. Marking it lets the engine apply the
   * inaction-regret correction rather than scoring it as a safe default.
   */
  isStatusQuo?: boolean;
  /** Roughly how hard this is to undo. Feeds the reversibility factor. */
  reversible?: boolean;
}

export interface DecisionQuestion {
  id: string;
  /** What the person is actually deciding, in their words. */
  question: string;
  options: DecisionOption[];
  /**
   * The person's domain priority order, most important first — straight from
   * onboarding. This is what personalises the weighting.
   */
  valueRanking?: Domain[];
  /** Years over which consequences should be judged. Longer favours values. */
  horizonYears?: number;
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

export interface FactorFinding {
  factor: Factor;
  /** Contribution to this option's total, after weighting and inversion. */
  contribution: number;
  weight: number;
  raw: number;
  /** Plain sentence naming what this factor says. */
  note: string;
}

export interface OptionAssessment {
  optionId: string;
  label: string;
  /** 0..100, comparable only within this question. */
  total: number;
  findings: FactorFinding[];
  /** The factors most responsible for the total, strongest first. */
  drivers: FactorFinding[];
  /** Factors doing genuinely badly on their own terms. Never hidden. */
  objections: FactorFinding[];
  /**
   * This option's worst-performing factor, even when nothing is outright bad.
   * A strong option still has a weakest part, and naming it is what keeps a
   * recommendation from becoming a sales pitch.
   */
  weakest: FactorFinding | null;
  /** How much of the factor set had data. Drives the confidence level. */
  coverage: number;
}

export interface DecisionAssessment {
  questionId: string;
  question: string;
  assessments: OptionAssessment[];
  /** The best-scoring option, or null when the field is genuinely too close. */
  lean: OptionAssessment | null;
  /** Points between the top two. Small means "this is close, take your time". */
  margin: number;
  /**
   * The strongest reason not to follow the lean. Surfaced with the lean, always
   * — a recommendation without its best counter-argument is a sales pitch.
   */
  strongestObjection: FactorFinding | null;
  uncertainty: Uncertainty;
  /** The question worth sitting with, when the engine should not lean at all. */
  reflectionPrompt: string;
}

/** Below this margin the engine refuses to lean and says so. */
const TOO_CLOSE_TO_CALL = 4;

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

/**
 * Reshape the default weights by what this person said matters.
 *
 * Rank 1 gets a 1.4× multiplier decaying to 1.0 by the last rank, so a
 * relationships-first person and a career-first person genuinely receive
 * different recommendations from identical inputs.
 */
export function weightsFor(ranking?: Domain[]): Record<Factor, number> {
  const weights = { ...DEFAULT_WEIGHTS };
  if (!ranking?.length) return weights;

  const span = Math.max(1, ranking.length - 1);
  ranking.forEach((domain, index) => {
    const boost = 1.4 - (0.4 * index) / span;
    for (const [factor, factorDomain] of Object.entries(FACTOR_DOMAIN)) {
      if (factorDomain === domain) {
        weights[factor as Factor] *= boost;
      }
    }
  });
  return weights;
}

function noteFor(factor: Factor, raw: number, label: string): string {
  const strong = raw >= 70;
  const weak = raw <= 30;
  switch (factor) {
    case 'valuesAlignment':
      return strong ? `${label} matches what you said matters most.`
        : weak ? `${label} pulls against your stated priorities.`
        : `${label} is only loosely connected to your priorities.`;
    case 'regretProbability':
      return strong ? `High chance you'd wonder about this one later.`
        : `Low chance of looking back on this with regret.`;
    case 'relationshipImpact':
      return strong ? `${label} is good for the people closest to you.`
        : weak ? `${label} costs the people closest to you.`
        : `${label} leaves your relationships roughly as they are.`;
    case 'healthImpact':
      return strong ? `${label} is kind to your body.`
        : weak ? `${label} is likely paid for in sleep and movement.`
        : `${label} is health-neutral.`;
    case 'financialImpact':
      return strong ? `${label} strengthens the financial picture.`
        : weak ? `${label} is financially expensive.`
        : `${label} is roughly financially neutral.`;
    case 'longTermHappiness':
      return strong ? `You are likely to still be glad of this in ten years.`
        : `The appeal here may not survive the decade.`;
    case 'opportunityCost':
      return strong ? `Choosing this closes other doors.`
        : `Choosing this leaves most other doors open.`;
    case 'risk':
      return strong ? `Real downside if it goes badly.` : `Limited downside.`;
    case 'stress':
      return strong ? `Expect this to cost you calm.` : `Unlikely to raise your baseline stress.`;
    case 'energy':
      return strong ? `This is the kind of thing that gives energy back.`
        : `Expect this to draw energy rather than return it.`;
    case 'timeCost':
      return strong ? `This will take a serious share of your hours.`
        : `Modest demand on your time.`;
    case 'reversibility':
      return strong ? `Easy to undo if you change your mind.`
        : `Hard to walk back once done.`;
    default:
      return `${label}: ${raw}.`;
  }
}

function assess(
  option: DecisionOption,
  weights: Record<Factor, number>,
  horizonYears: number,
): OptionAssessment {
  const factors = Object.keys(DEFAULT_WEIGHTS) as Factor[];
  const findings: FactorFinding[] = [];
  let weightUsed = 0;
  let weighted = 0;

  for (const factor of factors) {
    let raw = option.scores[factor];

    // Reversibility can be inferred from the flag when not scored directly.
    if (raw == null && factor === 'reversibility' && option.reversible != null) {
      raw = option.reversible ? 80 : 20;
    }
    if (raw == null) continue; // no signal ≠ zero

    const clamped = Math.max(0, Math.min(100, raw));
    // Cost factors are inverted so that, after this line, higher is always better.
    const oriented = COST_FACTORS.has(factor) ? 100 - clamped : clamped;

    // A longer horizon amplifies values and regret and damps short-run costs —
    // this is what stops the engine recommending whatever is easiest this month.
    const horizonTilt =
      horizonYears >= 5 && (factor === 'valuesAlignment' || factor === 'regretProbability')
        ? 1.2
        : horizonYears >= 5 && (factor === 'stress' || factor === 'timeCost')
          ? 0.8
          : 1;

    const weight = weights[factor] * horizonTilt;
    weighted += oriented * weight;
    weightUsed += weight;

    findings.push({
      factor,
      weight: round(weight),
      raw: clamped,
      contribution: round(oriented * weight),
      note: noteFor(factor, clamped, option.label),
    });
  }

  const total = weightUsed > 0 ? weighted / weightUsed : 0;

  // Inaction is not free. People regret omissions more than actions, so the
  // status quo carries a standing penalty unless it scored well on regret.
  const inactionPenalty = option.isStatusQuo
    ? Math.max(0, 6 - (100 - (option.scores.regretProbability ?? 50)) / 25)
    : 0;

  const byStrength = [...findings].sort((a, b) => b.contribution - a.contribution);

  /** How well a factor is doing on its own terms, cost factors inverted. */
  const oriented = (f: FactorFinding) =>
    COST_FACTORS.has(f.factor) ? 100 - f.raw : f.raw;

  // Weakest-first on the factor's own merit, so a low-weight factor scoring 10
  // still registers as this option's soft spot.
  const byWeakness = [...findings].sort((a, b) => oriented(a) - oriented(b));
  // An objection is a factor doing badly outright, not merely last in line.
  const objections = byWeakness.filter((f) => oriented(f) <= 35);

  return {
    optionId: option.id,
    label: option.label,
    total: round(Math.max(0, total - inactionPenalty)),
    findings,
    drivers: byStrength.slice(0, 3),
    objections,
    weakest: byWeakness[0] ?? null,
    coverage: round(findings.length / factors.length),
  };
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function evaluateDecision(q: DecisionQuestion): DecisionAssessment {
  const horizon = q.horizonYears ?? 5;
  const weights = weightsFor(q.valueRanking);

  const assessments = q.options
    .map((o) => assess(o, weights, horizon))
    .sort((a, b) => b.total - a.total || a.optionId.localeCompare(b.optionId));

  const [top, second] = assessments;
  const margin = top && second ? round(top.total - second.total) : 0;
  const decisive = Boolean(top) && (!second || margin >= TOO_CLOSE_TO_CALL);

  const coverage = assessments.length
    ? assessments.reduce((s, a) => s + a.coverage, 0) / assessments.length
    : 0;

  const uncertainty: Uncertainty = {
    level: coverage >= 0.75 && decisive ? 'low'
      : coverage >= 0.5 ? 'moderate' : 'high',
    basis: `${Math.round(coverage * 100)}% of factors had data across ${assessments.length} option(s);`
      + ` top two separated by ${margin} points`,
    assumptions: [
      `Judged over a ${horizon}-year horizon.`,
      q.valueRanking?.length
        ? `Weighted by your own priority order, ${q.valueRanking.slice(0, 3).join(' → ')} first.`
        : 'Weighted by default priorities — no personal ranking supplied.',
      'Inaction is penalised, because omissions are regretted more than actions.',
      'Scores are comparable within this question only, never across questions.',
    ],
  };

  return {
    questionId: q.id,
    question: q.question,
    assessments,
    lean: decisive ? top : null,
    margin,
    // Prefer a real objection; fall back to the lean's weakest part. A lean is
    // never presented without something arguing the other way.
    strongestObjection: decisive ? (top.objections[0] ?? top.weakest ?? null) : null,
    uncertainty,
    reflectionPrompt: decisive
      ? `If you imagine having chosen ${top.label} and it went badly — what would you wish you had checked first?`
      : `These come out close, which usually means the numbers are not what is deciding it. What are you actually afraid of here?`,
  };
}

// ---------------------------------------------------------------------------
// Engine registration
// ---------------------------------------------------------------------------

/** What the host loads into `ctx.data.decision`. */
export interface DecisionEngineData {
  open: DecisionQuestion[];
}

/**
 * The Decision Engine as a kernel citizen.
 *
 * Emits one observation per open question, plus a proposal to sit with the
 * closest ones. It never proposes *taking* an option — the person decides;
 * the engine only insists that a decision left open for weeks is itself a
 * decision, quietly made.
 */
export const decisionEngine: Engine = {
  id: 'decision',
  dependsOn: ['memory', 'regret'],

  run(ctx: EngineContext): EngineOutput {
    const data = ctx.data.decision as DecisionEngineData | undefined;
    const open = data?.open ?? [];
    if (!open.length) return { observations: [], proposals: [] };

    const observations: Observation[] = [];
    const proposals: Proposal[] = [];

    for (const question of open) {
      const result = evaluateDecision(question);
      const evidence: Evidence[] = result.assessments.map((a) => ({
        label: a.label,
        value: a.total,
        source: `decision:${question.id}`,
      }));

      observations.push({
        id: `decision:${question.id}`,
        engine: 'decision',
        domain: null,
        statement: result.lean
          ? `On your own priorities, ${result.lean.label} comes out ahead — by ${result.margin} points, which is ${result.margin < 10 ? 'not much' : 'a clear gap'}.`
          : `${question.question} is genuinely close. The numbers are not going to decide this one.`,
        magnitude: result.lean?.total,
        pressure: result.lean && result.margin >= 10 ? 'mention' : 'whisper',
        evidence,
        uncertainty: result.uncertainty,
        observedAt: ctx.now,
      });

      proposals.push({
        id: `decision:${question.id}:sit`,
        engine: 'decision',
        domain: null,
        action: result.lean
          ? `Sit with one question about ${question.question}`
          : `Name what you're actually weighing in ${question.question}`,
        because: result.reflectionPrompt,
        effortMinutes: 10,
        pressure: 'whisper',
        addresses: [`decision:${question.id}`],
        tinyStep: 'Write one sentence. Not a decision — just the sentence.',
        dismissible: true,
      });
    }

    return { observations, proposals };
  },
};
