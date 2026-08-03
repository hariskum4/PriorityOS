/**
 * The Relationship Engine.
 *
 * The slot has been declared in the kernel contract since it was written and
 * has been empty ever since, which is the single largest hole in this product:
 * the relationship graph is the one thing no competitor has, and no engine was
 * reading it. A job seeker with a friend two streets away was told to mentor
 * someone; a person whose mother is 79 was told to read about money.
 *
 * Four things it looks for, in descending order of how much they cost to miss:
 *
 *   1. **A closing window.** Someone whose remaining quality-years are short
 *      and whose rhythm has slipped. This is the only observation in the whole
 *      system that can be *permanently* too late, so it outranks everything.
 *   2. **Drift.** Past the cadence they themselves chose, by enough that it is
 *      a pattern rather than a busy fortnight.
 *   3. **One-sidedness.** They said they want more time with someone and the
 *      log shows the opposite. Their own words against their own behaviour.
 *   4. **A tie worth having that never gets fed.** High closeness, no rhythm,
 *      nothing logged — the friendship that quietly becomes an acquaintance.
 *
 * What it deliberately does not do:
 *
 *   · **No guilt arithmetic.** It never counts missed calls or says "you have
 *     not spoken in 214 days" as an accusation. Days appear as evidence, and
 *     the sentence a person reads is about the person, not the gap.
 *   · **No ranking people.** Closeness orders the engine's attention, never
 *     the copy. Nobody is told who matters more.
 *   · **One person at a time.** Fourteen overdue friendships is a list, and a
 *     list is what makes someone close the app. The orchestrator would cap it
 *     anyway; this engine does not generate the noise in the first place.
 *
 * Pure and deterministic, like every engine here: the host loads contact logs
 * and window estimates, and hands them in.
 */

import {
  Domain, Engine, EngineContext, EngineOutput, Evidence,
  Observation, Proposal, Pressure, Uncertainty, isMuted,
} from './contract';

/** Cadences as the People tab stores them, in days. */
export const CADENCE_DAYS: Record<string, number> = {
  daily: 1, weekly: 7, biweekly: 14, monthly: 30, quarterly: 90, yearly: 365,
};

export interface RelationshipRecord {
  id: string;
  name: string;
  /** mother | father | spouse | child | friend | … — used for framing only. */
  relationType: string;
  domain: Domain;
  /** 0..10 as collected at onboarding. */
  closeness: number;
  /** The rhythm *they* chose, not one the app assigned. */
  desiredCadence?: string | null;
  /** Null when nothing has ever been logged — which is itself a signal. */
  lastContactAt?: Date | null;
  /** They said, in as many words, that they want more of this person. */
  wantsMoreTime?: boolean;
  /**
   * Quality-years left, from the time engine. Null when age is unknown —
   * and null means silent, never assumed.
   */
  windowYears?: number | null;
  /** How they said this person's age is treating them. */
  healthConcern?: boolean;
  /** Moments logged with them in the recent past. Evidence of a live tie. */
  momentsRecent?: number;
}

export interface RelationshipEngineData {
  relationships: RelationshipRecord[];
}

const DAY_MS = 86_400_000;

/** Below this many quality-years, a slipping rhythm is not a scheduling matter. */
const SHORT_WINDOW_YEARS = 12;
/** Past this multiple of their own cadence, drift is a pattern not a fortnight. */
const DRIFT_RATIO = 2;
/** A tie this close with no rhythm at all is worth naming. */
const UNFED_CLOSENESS = 7;
/** Never logged counts as this far past cadence — unknown is not "fine". */
const NEVER_LOGGED_RATIO = 3;

function daysSince(at: Date | null | undefined, now: Date): number | null {
  if (!at) return null;
  return Math.max(0, Math.floor((now.getTime() - at.getTime()) / DAY_MS));
}

/**
 * How far past their own agreed rhythm this person is.
 *
 * Deliberately expressed as a ratio of *their* cadence rather than in raw
 * days: a fortnight is nothing for a friend seen quarterly and a long time
 * for a parent called daily, and an engine that cannot tell those apart will
 * nag the wrong person every time.
 */
export function overdueRatio(rel: RelationshipRecord, now: Date): number {
  const cadence = CADENCE_DAYS[rel.desiredCadence ?? ''] ?? 30;
  const since = daysSince(rel.lastContactAt, now);
  if (since === null) return NEVER_LOGGED_RATIO;
  return Math.round((since / cadence) * 100) / 100;
}

function evidenceFor(rel: RelationshipRecord, now: Date): Evidence[] {
  const since = daysSince(rel.lastContactAt, now);
  const ev: Evidence[] = [
    { label: `closeness with ${rel.name}`, value: rel.closeness, source: 'onboarding:relationships' },
    {
      label: `rhythm ${rel.name} was given`,
      value: rel.desiredCadence ?? 'none set',
      source: 'onboarding:desiredCallFrequency',
    },
  ];
  if (since !== null) {
    ev.push({
      label: `days since last logged contact with ${rel.name}`,
      value: since,
      source: 'ContactLog',
      observedAt: rel.lastContactAt ?? undefined,
    });
  } else {
    ev.push({ label: `logged contact with ${rel.name}`, value: 'none yet', source: 'ContactLog' });
  }
  if (rel.windowYears != null) {
    ev.push({
      label: `quality years estimated with ${rel.name}`,
      value: rel.windowYears,
      source: 'engine:time',
    });
  }
  return ev;
}

const windowUncertainty = (rel: RelationshipRecord): Uncertainty => ({
  level: 'high',
  basis: 'a regional life-expectancy average adjusted for what you told us',
  assumptions: [
    `This is a planning horizon, not a prediction about ${rel.name}.`,
    'Health situations change, in both directions, and this moves with them.',
    'It assumes your current pace of seeing them continues unchanged.',
  ],
});

/**
 * Which single relationship most wants attention, and why.
 *
 * Exported because the host surfaces this outside a cycle too — the People tab
 * and the focus floor both need the same answer, and two implementations of
 * "who is most overdue" would eventually disagree in front of the user.
 */
export function mostWanting(
  rels: RelationshipRecord[],
  now: Date,
): { rel: RelationshipRecord; kind: 'window' | 'drift' | 'one-sided' | 'unfed'; ratio: number } | null {
  const scored = rels
    .map((rel) => {
      const ratio = overdueRatio(rel, now);
      const short = rel.windowYears != null && rel.windowYears <= SHORT_WINDOW_YEARS;
      const drifting = ratio >= DRIFT_RATIO;
      const neverFed = !rel.lastContactAt && !(rel.momentsRecent ?? 0);

      let kind: 'window' | 'drift' | 'one-sided' | 'unfed' | null = null;
      let rank = 0;
      if (short && (drifting || rel.healthConcern)) { kind = 'window'; rank = 400; }
      else if (drifting && rel.wantsMoreTime) { kind = 'one-sided'; rank = 300; }
      else if (drifting) { kind = 'drift'; rank = 200; }
      else if (neverFed && rel.closeness >= UNFED_CLOSENESS) { kind = 'unfed'; rank = 100; }

      /* Closeness and lateness order the engine's attention. They never reach
         the copy — nobody is told where they came in a ranking of people. */
      const score = rank + rel.closeness * 4 + Math.min(ratio, 6) * 6;
      return kind ? { rel, kind, ratio, score } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => b.score - a.score || a.rel.name.localeCompare(b.rel.name));

  return scored[0] ? { rel: scored[0].rel, kind: scored[0].kind, ratio: scored[0].ratio } : null;
}

/** Warm, specific, and never a countdown. */
function statementFor(
  kind: 'window' | 'drift' | 'one-sided' | 'unfed',
  rel: RelationshipRecord,
): string {
  switch (kind) {
    case 'window':
      return `You and ${rel.name} have fewer unhurried years ahead than the rhythm you have been keeping assumes.`;
    case 'one-sided':
      return `You said you wanted more time with ${rel.name}, and the last while has gone the other way.`;
    case 'drift':
      return `${rel.name} has slipped past the rhythm you chose for them.`;
    case 'unfed':
      return `${rel.name} is one of the people you are closest to, and nothing about them is on a rhythm.`;
  }
}

function actionFor(rel: RelationshipRecord): { action: string; tiny: string; minutes: number } {
  const near = ['spouse', 'partner', 'child', 'son', 'daughter'].includes(rel.relationType);
  if (near) {
    return {
      action: `Take ${rel.name} out of the house for an hour, no screens`,
      tiny: `Ask ${rel.name} one question you do not already know the answer to`,
      minutes: 60,
    };
  }
  return {
    action: `Call ${rel.name} — not a text`,
    tiny: `Send ${rel.name} one line, right now, about nothing in particular`,
    minutes: 15,
  };
}

const pressureFor = (kind: string, ratio: number): Pressure => {
  if (kind === 'window') return 'insist';
  if (ratio >= 4) return 'insist';
  if (ratio >= DRIFT_RATIO) return 'mention';
  return 'whisper';
};

export const relationshipEngine: Engine = {
  id: 'relationship',

  run(ctx: EngineContext): EngineOutput {
    const data = ctx.data.relationship as RelationshipEngineData | undefined;
    const rels = data?.relationships ?? [];
    if (!rels.length || isMuted(ctx, 'relationships')) {
      return { observations: [], proposals: [] };
    }

    const top = mostWanting(rels, ctx.now);
    if (!top) return { observations: [], proposals: [] };

    const { rel, kind, ratio } = top;
    const id = `relationship:${rel.id}:${kind}`;
    const pressure = pressureFor(kind, ratio);

    const observation: Observation = {
      id,
      engine: 'relationship',
      domain: rel.domain,
      statement: statementFor(kind, rel),
      /* Magnitude is lateness against their own rhythm, capped so a person
         never becomes a number with a very large value attached. */
      magnitude: Math.round(Math.min(ratio / 4, 1) * 100),
      pressure,
      evidence: evidenceFor(rel, ctx.now),
      ...(kind === 'window' ? { uncertainty: windowUncertainty(rel) } : {}),
      subjects: [`person:${rel.id}`, rel.domain],
      observedAt: ctx.now,
    };

    const { action, tiny, minutes } = actionFor(rel);
    const proposal: Proposal = {
      id: `${id}:reach`,
      engine: 'relationship',
      domain: rel.domain,
      action,
      because: statementFor(kind, rel),
      effortMinutes: minutes,
      pressure,
      addresses: [id],
      tinyStep: tiny,
      /* A closing window is the one thing here worth asking about twice. The
         rest are the person's own business to decline permanently. */
      dismissible: kind !== 'window',
    };

    return { observations: [observation], proposals: [proposal] };
  },
};