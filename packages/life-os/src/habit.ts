/**
 * The Habit Engine.
 *
 * Rhythms are the mechanism by which a domain gets fed at all, and until now
 * nothing in the kernel read them. The scoring engine knew a habit's rate; the
 * life model did not, so the system could see that health was starving and
 * never notice that the walk meant to feed it had quietly stopped three weeks
 * ago.
 *
 * The whole engine is built around one refusal: **it never reports a miss.**
 *
 * That is not softness, it is the documented failure mode. Streak mechanics
 * optimise early engagement charts and then produce the what-the-hell effect —
 * one broken run and the person quits entirely (RESEARCH_NOTES §2). So this
 * engine has no concept of a broken streak. It notices three things:
 *
 *   1. **A rhythm that has stopped**, and says so as information about the
 *      rhythm — it was probably the wrong size — rather than about the person.
 *   2. **A rhythm being kept that the person may not have noticed**, because
 *      the only feedback most habit apps give for success is silence.
 *   3. **Too many at once**, which is the choice-overload half of the same
 *      research and the predictable result of letting every domain offer one.
 *
 * Deterministic: rate over a trailing window against the target that was
 * agreed. No model, no clock.
 */

import {
  Domain, Engine, EngineContext, EngineOutput, Evidence,
  Observation, Proposal, isMuted,
} from './contract';

export interface HabitRecord {
  id: string;
  title: string;
  domain: Domain;
  /** What was agreed, per week. */
  targetPerWeek: number;
  /** Observed rate per week over the trailing window. */
  perWeek: number;
  /** Days the rate was measured over, for honest evidence. */
  windowDays: number;
  /** Days since the last time it was kept. Null if never. */
  daysSinceKept: number | null;
  createdAt: Date;
}

export interface HabitEngineData {
  habits: HabitRecord[];
}

/** Below this fraction of the agreed rate, a rhythm has stopped rather than dipped. */
const STOPPED_FRACTION = 0.34;
/** At or above this, it is genuinely being kept and deserves to be told. */
const KEPT_FRACTION = 0.9;
/** Long enough that "it stopped" is true rather than "this was a quiet week". */
const STOPPED_AFTER_DAYS = 14;
/** More live rhythms than this and the person is being asked for too much. */
const TOO_MANY = 5;
/** A rhythm younger than this has not had time to be anything yet. */
const GRACE_DAYS = 10;

const DAY_MS = 86_400_000;

const ageDays = (h: HabitRecord, now: Date) =>
  Math.max(0, Math.floor((now.getTime() - h.createdAt.getTime()) / DAY_MS));

export function keptFraction(h: HabitRecord): number {
  if (h.targetPerWeek <= 0) return 1;
  return h.perWeek / h.targetPerWeek;
}

function evidenceFor(h: HabitRecord): Evidence[] {
  const ev: Evidence[] = [
    { label: `${h.title} — agreed`, value: `${h.targetPerWeek}/week`, source: 'Habit.targetPerWeek' },
    { label: `${h.title} — actual`, value: `${h.perWeek}/week`, source: `HabitLog over ${h.windowDays} days` },
  ];
  if (h.daysSinceKept != null) {
    ev.push({ label: `days since ${h.title} was kept`, value: h.daysSinceKept, source: 'HabitLog' });
  }
  return ev;
}

export const habitEngine: Engine = {
  id: 'habit',

  run(ctx: EngineContext): EngineOutput {
    const data = ctx.data.habit as HabitEngineData | undefined;
    const habits = (data?.habits ?? []).filter((h) => ageDays(h, ctx.now) >= GRACE_DAYS);
    if (!habits.length || isMuted(ctx, 'habits')) return { observations: [], proposals: [] };

    const observations: Observation[] = [];
    const proposals: Proposal[] = [];

    /* 1. Carrying too many. Said before any individual rhythm is discussed,
       because the answer to five stalled habits is not five nudges. */
    if (habits.length > TOO_MANY) {
      const id = 'habit:crowded';
      observations.push({
        id,
        engine: 'habit',
        domain: null,
        statement: `You are carrying ${habits.length} standing rhythms at once, which is more than most weeks have room for.`,
        magnitude: Math.min(100, habits.length * 12),
        pressure: 'mention',
        evidence: [{ label: 'active rhythms', value: habits.length, source: 'Habit' }],
        observedAt: ctx.now,
      });
      proposals.push({
        id: `${id}:retire`,
        engine: 'habit',
        domain: null,
        action: 'End one rhythm you no longer need',
        because: 'Ending one keeps its streak and its logs — it only stops being asked for.',
        effortMinutes: 2,
        pressure: 'mention',
        addresses: [id],
        tinyStep: 'Just decide which one. Ending it can wait.',
        dismissible: true,
      });
    }

    /* 2. The one that has stopped. One, never a list. */
    const stopped = habits
      .filter((h) => keptFraction(h) < STOPPED_FRACTION
        && (h.daysSinceKept == null || h.daysSinceKept >= STOPPED_AFTER_DAYS))
      .sort((a, b) => keptFraction(a) - keptFraction(b) || a.title.localeCompare(b.title))[0];

    if (stopped) {
      const id = `habit:${stopped.id}:stopped`;
      observations.push({
        id,
        engine: 'habit',
        domain: stopped.domain,
        /* About the rhythm, not the person. The distinction is the engine. */
        statement: `“${stopped.title}” has stopped, which usually means the size was wrong rather than the intention.`,
        magnitude: Math.round((1 - keptFraction(stopped)) * 100),
        pressure: 'mention',
        evidence: evidenceFor(stopped),
        subjects: [`habit:${stopped.id}`, stopped.domain],
        observedAt: ctx.now,
      });
      proposals.push({
        id: `${id}:shrink`,
        engine: 'habit',
        domain: stopped.domain,
        action: `Halve “${stopped.title}” to ${Math.max(1, Math.floor(stopped.targetPerWeek / 2))} a week`,
        because: `${stopped.targetPerWeek} a week has not been landing. A smaller rhythm that holds beats a larger one that does not.`,
        effortMinutes: 2,
        pressure: 'mention',
        addresses: [id],
        tinyStep: `Do “${stopped.title}” once this week and let that be enough.`,
        dismissible: true,
      });
    }

    /* 3. The one being kept. Success is otherwise met with silence, which is
       how people conclude nothing is being noticed. */
    const kept = habits
      .filter((h) => keptFraction(h) >= KEPT_FRACTION && h.perWeek > 0)
      .sort((a, b) => keptFraction(b) - keptFraction(a) || a.title.localeCompare(b.title))[0];

    if (kept && !stopped) {
      observations.push({
        id: `habit:${kept.id}:kept`,
        engine: 'habit',
        domain: kept.domain,
        statement: `“${kept.title}” is holding at ${kept.perWeek} a week. That is the quiet kind of progress nothing else in here will tell you about.`,
        magnitude: Math.round(Math.min(keptFraction(kept), 1.5) * 66),
        pressure: 'whisper',
        evidence: evidenceFor(kept),
        subjects: [`habit:${kept.id}`, kept.domain],
        observedAt: ctx.now,
      });
    }

    return { observations, proposals };
  },
};
