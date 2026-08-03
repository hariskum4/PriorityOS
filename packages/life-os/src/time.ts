/**
 * The Time Engine.
 *
 * Every other engine reasons about a life as if hours were abundant. This one
 * holds the constraint: a week is a fixed budget, and most of it is already
 * committed before anyone chooses anything.
 *
 * It exists mainly so that two questions can be answered honestly rather than
 * encouragingly:
 *
 *   · **Is this even possible?** Six domains asking for an hour a week each,
 *     from someone with four free hours, is not a motivation problem. Saying
 *     so is the difference between a tool and a taskmaster.
 *   · **What genuinely will not wait?** Some windows close on their own
 *     schedule regardless of what anyone decides — a parent's unhurried years,
 *     a child still at home. This engine is where those are named, and it is
 *     the floor the Focus feature is not allowed to overrule.
 *
 * The second is the whole reason this belongs in the kernel rather than in a
 * screen. A person choosing to pour ninety days into one part of their life
 * deserves to be told, once and without drama, which two things were never
 * eligible to be postponed.
 */

import {
  Domain, Engine, EngineContext, EngineOutput, Evidence,
  Observation, Proposal, Uncertainty, isMuted,
} from './contract';

export interface TimeEngineData {
  /** Waking hours a week not already committed to work, sleep or admin. */
  freeHoursPerWeek: number;
  /** Hours a week the person's own declared priorities would need. */
  claimedHoursPerWeek?: number;
  /** Windows that close whether or not anyone is paying attention. */
  closingWindows?: ClosingWindow[];
}

export interface ClosingWindow {
  /** Graph node id — `person:<id>` or a domain. */
  subjectId: string;
  label: string;
  domain: Domain;
  /** Years of the *good* kind left, not years of life. */
  qualityYears: number;
  /** What makes it close: an age, a health situation, a child growing up. */
  because: string;
}

/** Below this, a window is short enough that ninety days is a real fraction of it. */
export const CLOSING_WINDOW_YEARS = 12;
/** Asking for more than this multiple of what exists is arithmetic, not effort. */
const OVERCOMMIT_RATIO = 1.15;

const projection = (basis: string): Uncertainty => ({
  level: 'high',
  basis,
  assumptions: [
    'This is a planning horizon, not a prediction about anyone.',
    'It moves as circumstances move, in both directions.',
    'Quality years use a conservative cutoff; many people are active well past it.',
  ],
});

/**
 * The things a season of focus is not allowed to postpone.
 *
 * Exported because the Focus feature reads it directly: the moment someone
 * chooses to concentrate on one domain, this is what gets shown beside the
 * choice. Sorted shortest-window first, and capped — a floor of nine items is
 * not a floor, it is a reason to ignore the whole idea.
 */
export function nonPostponable(
  windows: ClosingWindow[],
  limit = 3,
): ClosingWindow[] {
  return [...windows]
    .filter((w) => Number.isFinite(w.qualityYears) && w.qualityYears <= CLOSING_WINDOW_YEARS)
    .sort((a, b) => a.qualityYears - b.qualityYears || a.label.localeCompare(b.label))
    .slice(0, limit);
}

export const timeEngine: Engine = {
  id: 'time',

  run(ctx: EngineContext): EngineOutput {
    const data = ctx.data.time as TimeEngineData | undefined;
    if (!data || isMuted(ctx, 'time')) return { observations: [], proposals: [] };

    const observations: Observation[] = [];
    const proposals: Proposal[] = [];
    const free = Math.max(data.freeHoursPerWeek, 0);

    /* 1. The budget does not close. Said as arithmetic about the week, never
       as a comment on the person's discipline. */
    const claimed = data.claimedHoursPerWeek ?? 0;
    if (claimed > 0 && free > 0 && claimed > free * OVERCOMMIT_RATIO) {
      const id = 'time:overcommitted';
      const over = Math.round((claimed - free) * 10) / 10;
      observations.push({
        id,
        engine: 'time',
        domain: null,
        statement: `What you have asked of yourself this week needs about ${Math.round(claimed)} hours, and there are roughly ${Math.round(free)}. That is a sum, not a shortcoming.`,
        magnitude: Math.round(Math.min((claimed / free - 1) * 100, 100)),
        pressure: 'mention',
        evidence: [
          { label: 'free hours a week', value: Math.round(free), source: 'engine:time' },
          { label: 'hours your priorities claim', value: Math.round(claimed), source: 'allocation' },
        ],
        observedAt: ctx.now,
      });
      proposals.push({
        id: `${id}:stack`,
        engine: 'time',
        domain: null,
        action: 'Find one hour that can serve two of these at once',
        because: `${over} hours have to come from somewhere, and stacking is the only place they exist.`,
        effortMinutes: 5,
        pressure: 'mention',
        addresses: [id],
        tinyStep: 'Name the two that could share an hour. That is the whole task.',
        dismissible: true,
      });
    }

    /* 2. What will not wait. The floor, and the reason this engine exists. */
    const closing = nonPostponable(data.closingWindows ?? []);
    if (closing.length) {
      const names = closing.map((w) => w.label);
      const id = 'time:closing-windows';
      observations.push({
        id,
        engine: 'time',
        domain: closing[0].domain,
        statement: names.length === 1
          ? `Time with ${names[0]} is on a shorter clock than the rest of your life is.`
          : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]} are on shorter clocks than the rest of your life is.`,
        magnitude: Math.round(
          Math.min(1, CLOSING_WINDOW_YEARS / Math.max(closing[0].qualityYears, 1)) * 100,
        ),
        pressure: 'whisper',
        evidence: closing.map((w): Evidence => ({
          label: `unhurried years with ${w.label}`,
          value: Math.round(w.qualityYears),
          source: 'engine:time',
        })),
        uncertainty: projection(
          `ages and health as you described them, for ${closing.length} ${closing.length === 1 ? 'person' : 'people'}`,
        ),
        subjects: closing.map((w) => w.subjectId),
        observedAt: ctx.now,
      });
    }

    return { observations, proposals };
  },
};
