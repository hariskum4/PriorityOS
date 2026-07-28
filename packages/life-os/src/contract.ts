/**
 * The Life OS engine contract.
 *
 * Twenty Nest modules do not make an operating system; a kernel with a stable
 * syscall table does. This file is that table. Every engine — Memory, Decision,
 * Regret, Time, Relationship, Goal, Habit, Knowledge, Reflection, Prediction,
 * Personalization, Coach, Graph, Review — implements one interface and speaks
 * one vocabulary, so a new engine is an addition rather than a redesign.
 *
 * Three rules are load-bearing and encoded in the types rather than left to
 * discipline (see ETHICS in the product spec):
 *
 *   1. Engines observe and propose. They never mutate user state. An engine's
 *      only output is `Observation[]` and `Proposal[]`; writes belong to the
 *      host application, after the user acts.
 *   2. Nothing reaches a person without provenance. Every Observation carries
 *      the inputs it was computed from, so "explain why" is a data lookup and
 *      not a second LLM call that might invent a reason.
 *   3. Confidence is mandatory, not optional. A projection without stated
 *      uncertainty is a lie with a number attached, so `confidence` and
 *      `assumptions` are required fields on anything forward-looking.
 *
 * Engines are pure: `(EngineContext) => EngineOutput`. No I/O, no clock, no
 * randomness — `now` is passed in. That is what makes a life model testable.
 */

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

/** The eight life domains, fixed so the balance model stays tractable. */
export type Domain =
  | 'relationships'
  | 'health'
  | 'career'
  | 'finances'
  | 'growth'
  | 'experiences'
  | 'mindfulness'
  | 'purpose';

export const DOMAINS: readonly Domain[] = [
  'relationships', 'health', 'career', 'finances',
  'growth', 'experiences', 'mindfulness', 'purpose',
] as const;

/**
 * Engine identifiers. A closed union rather than `string` so the orchestrator
 * can exhaustively reason about provenance and the compiler catches a typo in
 * a dependency declaration.
 */
export type EngineId =
  | 'memory' | 'decision' | 'regret' | 'time' | 'relationship'
  | 'goal' | 'habit' | 'knowledge' | 'reflection' | 'prediction'
  | 'personalization' | 'coach' | 'graph' | 'review';

/**
 * How strongly something wants a person's attention.
 *
 * Deliberately tops out at `insist`. There is no `urgent` and no `critical`:
 * the product's visual language has no vocabulary for alarm, and a scale that
 * cannot express panic cannot drift into it. A domain being starved whispers
 * first, then insists, and never screams.
 */
export type Pressure = 'whisper' | 'mention' | 'insist';

export const PRESSURE_ORDER: Record<Pressure, number> = {
  whisper: 0, mention: 1, insist: 2,
};

// ---------------------------------------------------------------------------
// Provenance & uncertainty
// ---------------------------------------------------------------------------

/**
 * Where a number came from. Attached to every Observation so the "why" shown
 * to a person is retrieved, never generated.
 */
export interface Evidence {
  /** Human-readable input name, e.g. "days since contact with Amma". */
  label: string;
  /** The value used. Strings allowed for categorical inputs. */
  value: number | string;
  /** Where it was measured, e.g. "ContactLog", "onboarding:priorityRanking". */
  source: string;
  /** When the input was observed, if it is time-sensitive. */
  observedAt?: Date;
}

/**
 * Stated uncertainty. Required on anything that projects forward.
 *
 * `level` is the honest summary a person reads; `basis` explains what would
 * make it firmer. Assumptions are listed so an estimate can be argued with —
 * a life projection the user cannot challenge is not a tool, it is a horoscope.
 */
export interface Uncertainty {
  level: 'low' | 'moderate' | 'high';
  /** What the confidence rests on, e.g. "9 weeks of logged contact". */
  basis: string;
  /** Every assumption baked into the number. */
  assumptions: string[];
}

// ---------------------------------------------------------------------------
// Engine output
// ---------------------------------------------------------------------------

/**
 * Something an engine noticed. Never an instruction — an observation with its
 * receipts. Observations are the substrate the Coach narrates from and the
 * Prediction engine trends over.
 */
export interface Observation {
  id: string;
  engine: EngineId;
  domain: Domain | null;
  /** One plain sentence, second person, no hedging and no scolding. */
  statement: string;
  /** 0..100. What the engine measured, when it measured a magnitude. */
  magnitude?: number;
  pressure: Pressure;
  evidence: Evidence[];
  /** Required when the observation looks forward. */
  uncertainty?: Uncertainty;
  /** Graph node ids this concerns, for cross-engine joins. */
  subjects?: string[];
  observedAt: Date;
}

/**
 * A door, not an order. Every hard truth the system surfaces must arrive
 * holding something small the person could actually do today, which is why
 * `effortMinutes` is required and capped by the orchestrator.
 */
export interface Proposal {
  id: string;
  engine: EngineId;
  domain: Domain | null;
  /** Imperative, concrete, and small. "Call your father", not "improve family". */
  action: string;
  /** The honest reason, drawn from observations. Shown verbatim. */
  because: string;
  effortMinutes: number;
  pressure: Pressure;
  /** Observation ids this proposal answers. */
  addresses: string[];
  /**
   * The laughably small version, for the days when the action is too big.
   * Momentum does the rest.
   */
  tinyStep?: string;
  /** Set when declining should be remembered permanently. */
  dismissible?: boolean;
}

export interface EngineOutput {
  observations: Observation[];
  proposals: Proposal[];
}

export const EMPTY_OUTPUT: EngineOutput = Object.freeze({
  observations: Object.freeze([]) as unknown as Observation[],
  proposals: Object.freeze([]) as unknown as Proposal[],
});

// ---------------------------------------------------------------------------
// Engine input
// ---------------------------------------------------------------------------

/** A person's declared vs. observed balance in one domain. */
export interface DomainState {
  domain: Domain;
  /** 0..100, what they said matters. */
  importance: number;
  /** 0..100, what their behaviour shows. */
  attention: number;
  /** 0..100, engine-computed drift. */
  neglectRisk: number;
}

/**
 * What the Personalization engine has learned. Every engine reads this, which
 * is how one preference change retunes the whole system at once.
 */
export interface PersonalizationState {
  /** How blunt the person has asked us to be. */
  insightIntensity: 'off' | 'gentle' | 'direct';
  motivationStyle: 'balanced' | 'gentle' | 'push';
  chronotype?: 'early' | 'neutral' | 'late';
  /** Minutes of real focus typically available, used to size proposals. */
  attentionSpanMinutes?: number;
  /** Topics the person has permanently declined. Honoured without survey. */
  declinedTopics: string[];
}

/**
 * Everything an engine is allowed to see, assembled by the host once per cycle.
 *
 * Passing a snapshot rather than repository handles is what keeps engines pure
 * and keeps the LLM off the request path: the expensive gathering happens once,
 * deterministically, before any engine runs.
 */
export interface EngineContext {
  userId: string;
  /** Injected, never read from the clock, so cycles are reproducible in tests. */
  now: Date;
  /** Age in years, when known. Every life-window calculation depends on it. */
  age: number | null;
  domains: DomainState[];
  personalization: PersonalizationState;
  /** Observations from engines that ran earlier this cycle. */
  priorObservations: Observation[];
  /**
   * Arbitrary engine-specific payloads the host loaded, keyed by engine id.
   * Typed at the engine boundary rather than here so the kernel stays stable
   * as engines evolve.
   */
  data: Partial<Record<EngineId, unknown>>;
}

// ---------------------------------------------------------------------------
// The engine interface
// ---------------------------------------------------------------------------

export interface Engine {
  id: EngineId;
  /**
   * Engines that must run first, because this one reads their observations.
   * The orchestrator topologically sorts on these and rejects cycles.
   */
  dependsOn?: EngineId[];
  /**
   * Pure. Same context in, same output out. If an engine needs the network or
   * a database it belongs in the host, with its result passed via `data`.
   */
  run(ctx: EngineContext): EngineOutput;
}

/** True when the person has asked this engine's whole topic to stay quiet. */
export function isMuted(ctx: EngineContext, topic: string): boolean {
  return ctx.personalization.declinedTopics.includes(topic);
}

/**
 * Clamp a proposal to what the person actually has attention for. Sizing
 * proposals to the user rather than to the engine's ambition is the difference
 * between a companion and a taskmaster.
 */
export function fitsAttention(p: Proposal, ctx: EngineContext): boolean {
  const span = ctx.personalization.attentionSpanMinutes;
  return span == null || p.effortMinutes <= span;
}
