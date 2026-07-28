/**
 * The Goal Engine.
 *
 * Goals here are living systems, not checkboxes. Each one carries momentum,
 * confidence, and risk, and the engine's defining behaviour is what it does
 * when momentum drops: **it adapts the plan instead of blaming the person.**
 *
 * That single commitment rules out most of what goal software normally does.
 * There is no "you're behind", no completion percentage used as a scold, no
 * streak to break. When a goal stalls the engine has exactly three moves, in
 * escalating order of honesty:
 *
 *   1. **shrink the step** — the goal is fine, the next action was too big
 *   2. **unblock** — the goal is waiting on another goal, so say which
 *   3. **offer release** — it has been stalled long enough that the kind thing
 *      is to say out loud that priorities are allowed to change
 *
 * Move 3 is the one most products refuse to make, and it is the reason this one
 * can be trusted. A goal you are allowed to abandon is a goal you can look at
 * honestly.
 *
 * Deterministic: momentum is decayed progress cadence, confidence is milestone
 * rate against time remaining. No model involved.
 */

import {
  Domain, Engine, EngineContext, EngineOutput, Evidence,
  Observation, Proposal, Uncertainty,
} from './contract';

export interface GoalRecord {
  id: string;
  title: string;
  domain: Domain;
  /** Why this matters to them, in their words. Used verbatim, never rewritten. */
  purpose?: string;
  milestonesTotal: number;
  milestonesDone: number;
  /** Progress timestamps, oldest first. The raw material for momentum. */
  progressAt: Date[];
  targetDate?: Date | null;
  createdAt: Date;
  /** Goal ids this one waits on. */
  dependsOn?: string[];
  status: 'active' | 'achieved' | 'released';
}

export interface GoalEngineData {
  goals: GoalRecord[];
}

/** Progress older than this contributes almost nothing to momentum. */
const MOMENTUM_HALF_LIFE_DAYS = 21;
/** Stalled past this and the engine stops suggesting and starts offering release. */
const RELEASE_AFTER_STALLED_DAYS = 75;
/** Below this momentum a goal counts as stalled rather than slow. */
const STALLED_MOMENTUM = 20;
/** More active goals than this in one domain and attention is spread too thin. */
const MAX_ACTIVE_PER_DOMAIN = 3;

const DAY_MS = 86_400_000;

function daysBetween(a: Date, b: Date): number {
  return (b.getTime() - a.getTime()) / DAY_MS;
}

/**
 * Momentum, 0..100.
 *
 * Exponentially decayed count of recent progress events, normalised against a
 * "healthy" cadence of roughly one step a week. Decay rather than a fixed
 * window means momentum fades gradually instead of falling off a cliff the day
 * a 30-day window rolls over — which is what makes it feel fair.
 */
export function goalMomentum(goal: GoalRecord, now: Date): number {
  if (!goal.progressAt.length) return 0;
  const weighted = goal.progressAt.reduce((sum, at) => {
    const age = Math.max(0, daysBetween(at, now));
    return sum + Math.pow(0.5, age / MOMENTUM_HALF_LIFE_DAYS);
  }, 0);
  // Three decayed steps ≈ full momentum. Above that adds nothing; this is not
  // a leaderboard.
  return Math.round(Math.min(100, (weighted / 3) * 100));
}

/** Days since anything happened, or since creation if nothing ever has. */
export function daysStalled(goal: GoalRecord, now: Date): number {
  const last = goal.progressAt.length
    ? goal.progressAt[goal.progressAt.length - 1]
    : goal.createdAt;
  return Math.max(0, Math.round(daysBetween(last, now)));
}

/**
 * Confidence that this lands by its target date, 0..100, with the reasoning.
 *
 * Compares observed milestone rate against the rate still required. Deliberately
 * conservative and deliberately honest about not knowing: a goal with no target
 * date gets no confidence figure at all rather than a made-up one.
 */
export function goalConfidence(
  goal: GoalRecord,
  now: Date,
): { value: number; uncertainty: Uncertainty } | null {
  if (!goal.targetDate || goal.milestonesTotal <= 0) return null;

  const elapsed = Math.max(1, daysBetween(goal.createdAt, now));
  const remaining = daysBetween(now, goal.targetDate);
  const doneFraction = goal.milestonesDone / goal.milestonesTotal;

  // Already there.
  if (doneFraction >= 1) {
    return {
      value: 100,
      uncertainty: {
        level: 'low',
        basis: 'all milestones complete',
        assumptions: ['Completion is measured by milestones, not by how it feels.'],
      },
    };
  }
  // Past the date and unfinished: confidence in *this* date is gone, which is a
  // fact about the date, not a judgement about the person.
  if (remaining <= 0) {
    return {
      value: 0,
      uncertainty: {
        level: 'low',
        basis: 'the target date has passed',
        assumptions: ['A missed date says the plan needs changing, not that the goal was wrong.'],
      },
    };
  }

  const observedRate = doneFraction / elapsed;          // milestones-fraction per day
  const requiredRate = (1 - doneFraction) / remaining;
  const ratio = requiredRate > 0 ? observedRate / requiredRate : 2;

  const value = Math.round(Math.max(0, Math.min(100, ratio * 60)));
  const samples = goal.progressAt.length;

  return {
    value,
    uncertainty: {
      level: samples >= 5 ? 'low' : samples >= 2 ? 'moderate' : 'high',
      basis: `${samples} recorded step(s) over ${Math.round(elapsed)} days`,
      assumptions: [
        'Assumes your recent pace continues unchanged.',
        'Milestones are treated as equal in size, which they rarely are.',
        'This is a projection of a plan, not a prediction about you.',
      ],
    },
  };
}

/** Risk factors, each with the reason it applies. */
export function goalRisks(
  goal: GoalRecord,
  now: Date,
  byId: Map<string, GoalRecord>,
): Array<{ kind: 'stalled' | 'blocked' | 'undated' | 'overdue'; note: string }> {
  const risks: Array<{ kind: 'stalled' | 'blocked' | 'undated' | 'overdue'; note: string }> = [];
  const stalled = daysStalled(goal, now);

  if (goalMomentum(goal, now) < STALLED_MOMENTUM) {
    risks.push({ kind: 'stalled', note: `Nothing has moved for ${stalled} days.` });
  }
  const blockers = (goal.dependsOn ?? [])
    .map((id) => byId.get(id))
    .filter((g): g is GoalRecord => !!g && g.status === 'active' && goalMomentum(g, now) < STALLED_MOMENTUM);
  if (blockers.length) {
    risks.push({
      kind: 'blocked',
      note: `Waiting on ${blockers.map((b) => `“${b.title}”`).join(' and ')}, which ${blockers.length === 1 ? 'has' : 'have'} also stopped moving.`,
    });
  }
  if (!goal.targetDate) {
    risks.push({ kind: 'undated', note: 'No date, so nothing ever makes it urgent.' });
  } else if (goal.targetDate.getTime() < now.getTime() && goal.milestonesDone < goal.milestonesTotal) {
    risks.push({ kind: 'overdue', note: 'The date has passed. The date was the guess, not the goal.' });
  }
  return risks;
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

export const goalEngine: Engine = {
  id: 'goal',

  run(ctx: EngineContext): EngineOutput {
    const data = ctx.data.goal as GoalEngineData | undefined;
    const active = (data?.goals ?? []).filter((g) => g.status === 'active');
    if (!active.length) return { observations: [], proposals: [] };

    const byId = new Map(active.map((g) => [g.id, g]));
    const observations: Observation[] = [];
    const proposals: Proposal[] = [];

    for (const goal of active) {
      const momentum = goalMomentum(goal, ctx.now);
      const stalled = daysStalled(goal, ctx.now);
      const confidence = goalConfidence(goal, ctx.now);
      const risks = goalRisks(goal, ctx.now, byId);

      const evidence: Evidence[] = [
        { label: 'momentum', value: momentum, source: 'goal:progress cadence' },
        { label: 'days since last step', value: stalled, source: 'goal:progressAt' },
        { label: 'milestones', value: `${goal.milestonesDone}/${goal.milestonesTotal}`, source: 'goal:milestones' },
      ];
      if (confidence) {
        evidence.push({ label: 'confidence in the date', value: confidence.value, source: 'goal:projection' });
      }

      const obsId = `goal:${goal.id}`;
      const blocked = risks.find((r) => r.kind === 'blocked');

      observations.push({
        id: obsId,
        engine: 'goal',
        domain: goal.domain,
        statement: momentum >= STALLED_MOMENTUM
          ? `“${goal.title}” is moving — ${goal.milestonesDone} of ${goal.milestonesTotal} done, last step ${stalled} day(s) ago.`
          : blocked
            ? `“${goal.title}” is stuck, and not for the reason it looks like. ${blocked.note}`
            : `“${goal.title}” has not moved in ${stalled} days.`,
        magnitude: momentum,
        pressure: 'whisper',
        evidence,
        uncertainty: confidence?.uncertainty,
        subjects: [goal.id],
        observedAt: ctx.now,
      });

      // ---- the three moves, in escalating honesty ------------------------
      if (momentum >= STALLED_MOMENTUM) continue; // moving: say nothing more

      if (blocked) {
        // Move 2 — unblock. Naming the real obstacle beats nagging the symptom.
        const blocker = (goal.dependsOn ?? [])
          .map((id) => byId.get(id))
          .find((g): g is GoalRecord => !!g && g.status === 'active');
        proposals.push({
          id: `${obsId}:unblock`,
          engine: 'goal',
          domain: goal.domain,
          action: blocker ? `Move “${blocker.title}” one step` : `Clear what “${goal.title}” is waiting on`,
          because: `“${goal.title}” is not stalled because you stopped caring. It is waiting on something else.`,
          effortMinutes: 15,
          pressure: 'whisper',
          addresses: [obsId],
          tinyStep: 'Do the smallest visible part of the blocker. Ten minutes.',
          dismissible: true,
        });
      } else if (stalled >= RELEASE_AFTER_STALLED_DAYS) {
        // Move 3 — offer release. The kind, honest option most software omits.
        proposals.push({
          id: `${obsId}:release`,
          engine: 'goal',
          domain: goal.domain,
          action: `Decide about “${goal.title}”`,
          because: `Untouched for ${stalled} days. That usually means it stopped mattering, and that is allowed. Keep it or let it go — either is a real answer.`,
          effortMinutes: 3,
          pressure: 'whisper',
          addresses: [obsId],
          tinyStep: 'Keep, or let go. No explanation required.',
          dismissible: true,
        });
      } else {
        // Move 1 — shrink the step. The goal is fine; the ask was too big.
        proposals.push({
          id: `${obsId}:shrink`,
          engine: 'goal',
          domain: goal.domain,
          action: `Take the smallest possible step on “${goal.title}”`,
          because: goal.purpose
            ? `You said this matters because: ${goal.purpose}`
            : `Nothing has moved in ${stalled} days, which usually means the next step is too big rather than that you are.`,
          effortMinutes: 10,
          pressure: 'whisper',
          addresses: [obsId],
          tinyStep: 'Make the next step so small it feels silly. Then do that.',
          dismissible: true,
        });
      }
    }

    // ---- over-commitment: a system problem, not a personal failing --------
    const perDomain = new Map<Domain, GoalRecord[]>();
    for (const g of active) {
      perDomain.set(g.domain, [...(perDomain.get(g.domain) ?? []), g]);
    }
    for (const [domain, goals] of perDomain) {
      if (goals.length <= MAX_ACTIVE_PER_DOMAIN) continue;
      const id = `goal:overcommitted:${domain}`;
      observations.push({
        id,
        engine: 'goal',
        domain,
        statement: `You have ${goals.length} live goals in ${domain}. That is usually why none of them move.`,
        magnitude: Math.min(100, goals.length * 20),
        pressure: 'mention',
        evidence: [
          { label: `active goals in ${domain}`, value: goals.length, source: 'goal:active count' },
          { label: 'a workable number', value: MAX_ACTIVE_PER_DOMAIN, source: 'life-os:MAX_ACTIVE_PER_DOMAIN' },
        ],
        observedAt: ctx.now,
      });
      proposals.push({
        id: `${id}:choose`,
        engine: 'goal',
        domain,
        action: `Pick which ${domain} goal is actually this season's`,
        because: `Nothing is wrong with the others. They just can't all be now.`,
        effortMinutes: 5,
        pressure: 'whisper',
        addresses: [id],
        tinyStep: 'Choose one. The rest keep waiting, which they are already doing.',
        dismissible: true,
      });
    }

    return { observations, proposals };
  },
};
