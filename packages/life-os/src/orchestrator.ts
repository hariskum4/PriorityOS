/**
 * The orchestration layer.
 *
 * One deterministic cycle: resolve engine order, run each engine over a shared
 * snapshot, then reduce many competing voices into the small number of things a
 * person should actually see today.
 *
 * The reduction is the hard part and the ethical part. Fourteen engines with
 * opinions will happily produce forty proposals, and forty proposals is not a
 * life operating system — it is the overwhelm the product exists to remove. So
 * the orchestrator is built to *suppress*, and every suppression rule below is
 * a product principle expressed as code:
 *
 *   · one insistent thing at a time      — anti-overload
 *   · at most one profound truth a week  — scarcity is what separates truth
 *                                          from nagging (Ration)
 *   · declined topics never return       — Retreat, honoured permanently
 *   · nothing without a door             — every truth arrives with an action
 *   · quiet when there is nothing to say — an empty cycle is a valid, good
 *                                          outcome; silence is a feature
 *
 * Deterministic throughout: no clock reads, no randomness, stable sorts. The
 * same context always produces the same day.
 */

import {
  Domain, Engine, EngineContext, EngineId, EngineOutput, Observation,
  PRESSURE_ORDER, Pressure, Proposal, fitsAttention,
} from './contract';

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export class EngineCycleError extends Error {}

/**
 * Holds the engines and the order they must run in.
 *
 * Registration is the entire extension mechanism: adding the Knowledge engine
 * later means `registry.register(knowledgeEngine)` and nothing else. The kernel
 * never learns what a specific engine does.
 */
export class EngineRegistry {
  private engines = new Map<EngineId, Engine>();

  register(engine: Engine): this {
    this.engines.set(engine.id, engine);
    return this;
  }

  get(id: EngineId): Engine | undefined {
    return this.engines.get(id);
  }

  get size(): number {
    return this.engines.size;
  }

  /**
   * Topological order over `dependsOn`, with ties broken by registration order
   * so a cycle is reproducible rather than merely correct.
   *
   * Missing dependencies are skipped instead of throwing: a deployment that
   * has not enabled the Prediction engine yet should degrade to a system
   * without forecasts, not to a 500.
   */
  resolveOrder(): Engine[] {
    const ordered: Engine[] = [];
    const state = new Map<EngineId, 'visiting' | 'done'>();

    const visit = (engine: Engine, path: EngineId[]): void => {
      const mark = state.get(engine.id);
      if (mark === 'done') return;
      if (mark === 'visiting') {
        throw new EngineCycleError(
          `Engine dependency cycle: ${[...path, engine.id].join(' → ')}`,
        );
      }
      state.set(engine.id, 'visiting');
      for (const depId of engine.dependsOn ?? []) {
        const dep = this.engines.get(depId);
        if (dep) visit(dep, [...path, engine.id]);
      }
      state.set(engine.id, 'done');
      ordered.push(engine);
    };

    for (const engine of this.engines.values()) visit(engine, []);
    return ordered;
  }
}

// ---------------------------------------------------------------------------
// Cycle configuration
// ---------------------------------------------------------------------------

export interface CycleBudget {
  /** Hard cap on proposals surfaced. The daily flow must fit in five minutes. */
  maxProposals: number;
  /** How many things may be `insist` at once. One, by design. */
  maxInsist: number;
  /** Proposals per domain, so one loud domain cannot own the whole day. */
  maxPerDomain: number;
  /**
   * Days that must pass between profound, mortality-adjacent truths.
   * Seven: one a week, maximum.
   */
  profoundCooldownDays: number;
}

export const DEFAULT_BUDGET: CycleBudget = {
  maxProposals: 5,
  maxInsist: 1,
  maxPerDomain: 2,
  profoundCooldownDays: 7,
};

export interface CycleInput {
  context: EngineContext;
  budget?: Partial<CycleBudget>;
  /**
   * When the last profound truth was shown. Enforces the ration rule across
   * cycles, which the kernel cannot know on its own.
   */
  lastProfoundAt?: Date | null;
  /**
   * Observation ids already shown, so the same truth is not re-delivered as
   * though it were news.
   */
  seenObservationIds?: readonly string[];
  /**
   * Subjects already spoken for outside this cycle — the people and goals
   * today's pending missions are about.
   *
   * The one-nudge-per-person rule below was only ever enforced *within* a
   * cycle, and missions are created by surfaces the cycle never sees. So a
   * new account that picked "Reach out to Vikram this week — one message is
   * enough" at the end of onboarding opened Today to that mission sitting
   * directly above this kernel's own "Call Vikram — not a text". One screen,
   * one person, two instructions, and the second contradicting the first.
   *
   * Same rule, wider scope: if something on this person's plate is already
   * about Vikram, the day does not raise him again.
   */
  addressedSubjects?: readonly string[];
  /**
   * The wording of work already accepted and not yet finished — pending
   * mission titles, in the host.
   *
   * `addressedSubjects` catches the same *person* twice; this catches the
   * same *ask* twice when there is no subject to catch it by. A standing
   * "Book the checkup you have moved three times" has no person and no goal
   * on it, so nothing above stops the engine proposing its own wording of the
   * identical errand directly underneath. The accepted copy is the one the
   * reader already said yes to, and the engine's copy must yield to it.
   */
  addressedActions?: readonly string[];
}

export interface CycleResult {
  /** Everything every engine noticed. Kept whole for trending and audit. */
  observations: Observation[];
  /** What the person should actually see, already ranked and budgeted. */
  proposals: Proposal[];
  /** The single most important thing, or null when today needs nothing. */
  now: Proposal | null;
  /** Proposals that lost, with the reason. Makes the reduction auditable. */
  suppressed: Array<{ proposal: Proposal; reason: SuppressionReason }>;
  /** Engines that threw, so one bad engine cannot take down the day. */
  failures: Array<{ engine: EngineId; error: string }>;
  ranAt: Date;
}

export type SuppressionReason =
  | 'muted-topic'
  | 'exceeds-attention'
  | 'no-supporting-observation'
  | 'domain-quota'
  | 'insist-quota'
  | 'profound-cooldown'
  | 'already-seen'
  | 'duplicate-action'
  | 'subject-already-addressed'
  | 'already-accepted'
  | 'budget-full';

// ---------------------------------------------------------------------------
// The cycle
// ---------------------------------------------------------------------------

const DAY_MS = 86_400_000;

/**
 * Mortality-adjacent framing. These proposals are the ones that land hardest
 * and are therefore rationed hardest; a proposal is profound if the engine that
 * produced it deals in finite time or accumulated regret.
 */
function isProfound(p: Proposal): boolean {
  return p.engine === 'regret' || p.engine === 'time';
}

/**
 * Rank a proposal.
 *
 * Order of precedence, and the middle term is the one that matters: pressure,
 * then **how significant the underlying finding was**, then cheapness.
 *
 * Significance has to outrank cheapness. Ranking on effort alone lets a
 * one-minute bit of tidying beat an eight-week pattern of a person's top value
 * being starved — the cheap thing wins every time and the product quietly
 * becomes a chore list. Cheapness is a tie-breaker between things that matter
 * equally, never a reason to prefer the trivial.
 */
function score(p: Proposal, observations: Map<string, Observation>): number {
  const pressure = PRESSURE_ORDER[p.pressure] * 10_000;
  const significance = p.addresses.reduce((max, id) => {
    const magnitude = observations.get(id)?.magnitude ?? 0;
    return Math.max(max, magnitude);
  }, 0) * 30;
  const grounded = p.addresses.length > 0 ? 100 : 0;
  const cheap = Math.max(0, 60 - Math.min(p.effortMinutes, 60));
  return pressure + significance + grounded + cheap;
}

/** Normalise action wording for duplicate detection across engines. */
function textKey(action: string): string {
  return action.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function actionKey(p: Proposal): string {
  return textKey(p.action);
}

/**
 * Normalise a subject tag so the same person matches whoever tagged them.
 *
 * The relationship and time engines tag people as graph node ids
 * (`person:<id>`); goals and the host's own records use the bare id. One key
 * for both, so a set seeded from either spelling still collides — the
 * alternative is a rule that reads as enforced and quietly is not.
 */
function subjectKey(s: string): string {
  return s.replace(/^person:/, '');
}

/**
 * Who or what a proposal is about — the person, goal, or item at its centre.
 *
 * Read from the observations a proposal answers, which is the only place a
 * subject is ever recorded — `Proposal` has no `subjects` field. This comment
 * used to promise a fallback to `p.subjects` "when present", which no engine
 * could supply and no code read; anyone debugging a missed suppression would
 * have gone looking for it.
 */
function subjectsOf(p: Proposal, observations: Map<string, Observation>): string[] {
  const fromObservations = p.addresses.flatMap(
    (id) => observations.get(id)?.subjects ?? [],
  );
  return [...new Set(fromObservations.map(subjectKey))];
}

/**
 * Run one full cycle.
 *
 * The registry is an explicit argument rather than part of `CycleInput`: which
 * engines are enabled is a deployment concern, not part of a person's context.
 */
export function runCycleWith(
  registry: EngineRegistry,
  input: CycleInput,
): CycleResult {
  const budget: CycleBudget = { ...DEFAULT_BUDGET, ...input.budget };
  const seenIds = new Set(input.seenObservationIds ?? []);
  const ctx = input.context;

  // ---- 1. run engines over a shared, growing snapshot --------------------
  const observations: Observation[] = [];
  const candidates: Proposal[] = [];
  const failures: CycleResult['failures'] = [];

  for (const engine of registry.resolveOrder()) {
    let out: EngineOutput;
    try {
      // Each engine sees what earlier engines found, which is how the Decision
      // engine can reason over the Regret engine's conclusions.
      out = engine.run({ ...ctx, priorObservations: [...observations] });
    } catch (err) {
      // One broken engine degrades the day; it never cancels it.
      failures.push({
        engine: engine.id,
        error: err instanceof Error ? err.message : String(err),
      });
      continue;
    }
    observations.push(...out.observations);
    candidates.push(...out.proposals);
  }

  // ---- 2. reduce ---------------------------------------------------------
  const suppressed: CycleResult['suppressed'] = [];
  const drop = (proposal: Proposal, reason: SuppressionReason) =>
    suppressed.push({ proposal, reason });

  const observationById = new Map(observations.map((o) => [o.id, o]));

  const profoundBlocked = (() => {
    if (!input.lastProfoundAt) return false;
    const days = (ctx.now.getTime() - input.lastProfoundAt.getTime()) / DAY_MS;
    return days < budget.profoundCooldownDays;
  })();

  // Stable ordering before any quota is applied, so suppression is predictable.
  const ranked = candidates
    .map((p, i) => ({ p, i }))
    .sort((a, b) =>
      (score(b.p, observationById) - score(a.p, observationById)) || (a.i - b.i))
    .map(({ p }) => p);

  const accepted: Proposal[] = [];
  const perDomain = new Map<Domain | 'none', number>();
  const usedActions = new Set<string>();
  // One nudge per person, per goal, per book — per cycle, and per anything
  // already on the plate. Two engines noticing the same friend is two engines
  // agreeing, and a person nudged twice about Sam in one morning reads the app
  // as broken, not thorough. Seeded with what other surfaces already claimed.
  const addressedSubjects = new Set<string>((input.addressedSubjects ?? []).map(subjectKey));
  /* The wording of work already accepted. Same rule as `usedActions` below,
     carried across the accept boundary: the standing copy is the one already
     on screen, so the engines' copy of the same ask must not appear beside it. */
  const standingActions = new Set<string>((input.addressedActions ?? []).map(textKey));
  let insistCount = 0;

  for (const p of ranked) {
    // Retreat: a declined topic never comes back, and never asks why.
    if (ctx.personalization.declinedTopics.includes(p.domain ?? '')) {
      drop(p, 'muted-topic'); continue;
    }
    if (ctx.personalization.insightIntensity === 'off' && isProfound(p)) {
      drop(p, 'muted-topic'); continue;
    }
    // Nothing reaches a person unless an engine actually measured something.
    if (p.addresses.length === 0 || !p.addresses.some((id) => observationById.has(id))) {
      drop(p, 'no-supporting-observation'); continue;
    }
    if (p.addresses.every((id) => seenIds.has(id))) {
      drop(p, 'already-seen'); continue;
    }
    if (!fitsAttention(p, ctx)) {
      drop(p, 'exceeds-attention'); continue;
    }
    if (profoundBlocked && isProfound(p)) {
      drop(p, 'profound-cooldown'); continue;
    }
    const key = actionKey(p);
    if (usedActions.has(key)) {
      // Two engines reaching the same conclusion is agreement, not two tasks.
      drop(p, 'duplicate-action'); continue;
    }
    // And the same conclusion reached yesterday and already said yes to.
    if (standingActions.has(key)) {
      drop(p, 'already-accepted'); continue;
    }
    // Same person or same goal, differently worded, still one nudge.
    const subjects = subjectsOf(p, observationById);
    if (subjects.some((s) => addressedSubjects.has(s))) {
      drop(p, 'subject-already-addressed'); continue;
    }
    const domainKey = p.domain ?? 'none';
    if ((perDomain.get(domainKey) ?? 0) >= budget.maxPerDomain) {
      drop(p, 'domain-quota'); continue;
    }
    if (p.pressure === 'insist' && insistCount >= budget.maxInsist) {
      // Demote rather than discard: it still matters, it just stops shouting.
      const softened: Proposal = { ...p, pressure: 'mention' };
      if (accepted.length >= budget.maxProposals) {
        drop(p, 'budget-full'); continue;
      }
      accepted.push(softened);
      perDomain.set(domainKey, (perDomain.get(domainKey) ?? 0) + 1);
      usedActions.add(key);
      subjects.forEach((s) => addressedSubjects.add(s));
      continue;
    }
    if (accepted.length >= budget.maxProposals) {
      drop(p, 'budget-full'); continue;
    }
    if (p.pressure === 'insist') insistCount += 1;
    accepted.push(p);
    perDomain.set(domainKey, (perDomain.get(domainKey) ?? 0) + 1);
    usedActions.add(key);
    subjects.forEach((s) => addressedSubjects.add(s));
  }

  return {
    observations,
    proposals: accepted,
    // An empty day is a legitimate result. "Nothing pending" is the product
    // working, not a failure to fill a slot.
    now: accepted[0] ?? null,
    suppressed,
    failures,
    ranAt: ctx.now,
  };
}

/** Did this cycle surface a profound truth? Used to persist the ration clock. */
export function cycleUsedProfound(result: CycleResult): boolean {
  return result.proposals.some(isProfound);
}
