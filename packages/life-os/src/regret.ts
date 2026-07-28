/**
 * The Regret Engine.
 *
 * The product's mission has two halves — maximise meaningful living, minimise
 * future regret — and this engine owns the second. It is also the most
 * dangerous engine in the system, because "you will regret this" is the single
 * most manipulative sentence software can say to a person. So the design is
 * defensive by construction.
 *
 * The patterns come from palliative-care research on what people actually say
 * at the end, most famously Bronnie Ware's account of the recurring five. They
 * are not invented, and they are not the app's opinion about how to live:
 *
 *   1. courage to live a life true to yourself   → values/attention divergence
 *   2. I wish I hadn't worked so hard            → career crowding out the rest
 *   3. courage to express my feelings            → things left unsaid
 *   4. staying in touch with friends             → friendship drift
 *   5. letting myself be happier                 → joy treated as optional
 *
 * Four rules keep this humane rather than coercive:
 *
 *   · **Detect patterns, not moments.** A single bad week is not a regret. Every
 *     detector requires sustained divergence, so a hard fortnight never triggers
 *     a lecture about someone's life.
 *   · **Name the pattern, never the verdict.** Output describes what the data
 *     shows. It does not tell anyone what they will feel on their deathbed.
 *   · **Never without a door.** Every detection carries a small, concrete action
 *     — and the doors here are deliberately tiny, because the topics are heavy.
 *   · **Rationed elsewhere.** This engine is marked profound, so the
 *     orchestrator's one-a-week cooldown applies. It may notice constantly and
 *     is permitted to speak rarely.
 *
 * Deterministic throughout. Nothing here is generated.
 */

import {
  Domain, Engine, EngineContext, EngineOutput, Evidence,
  Observation, Proposal,
} from './contract';

export type RegretPattern =
  | 'living-someone-elses-life'
  | 'worked-too-hard'
  | 'left-things-unsaid'
  | 'lost-touch'
  | 'joy-deferred'
  | 'body-ignored';

/** What the host loads into `ctx.data.regret`. */
export interface RegretEngineData {
  /**
   * Weekly attention samples per domain, oldest first. Patterns need history;
   * a detector with fewer than `MIN_WEEKS` samples stays silent.
   */
  attentionHistory: Array<{ domain: Domain; weekly: number[] }>;
  /** People the person said matter, with how long since real contact. */
  contacts: Array<{
    id: string;
    name: string;
    relationType: string;
    daysSinceContact: number | null;
    /** Their own target gap, in days. */
    desiredGapDays: number;
  }>;
  /**
   * Things the person told us they wanted to say and haven't — promises,
   * intended conversations. Sourced from journal and onboarding, never inferred.
   */
  unsaid: Array<{ id: string; note: string; ageDays: number; personName?: string }>;
  /** Their declared priority order, most important first. */
  valueRanking: Domain[];
}

/** A pattern must hold for at least this many weeks to count. */
const MIN_WEEKS = 4;
/** Sustained gap (points) between declared importance and actual attention. */
const DIVERGENCE_THRESHOLD = 25;
/** Attention share above which one domain is crowding out the others. */
const CROWDING_THRESHOLD = 70;
/** A domain starved below this, sustained, reads as deferred rather than dipped. */
const STARVED_THRESHOLD = 25;
/** Something unsaid for longer than this has stopped being "not yet". */
const UNSAID_STALE_DAYS = 60;

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

/** The trailing window a pattern is judged over. */
function recent(weekly: number[]): number[] {
  return weekly.slice(-Math.max(MIN_WEEKS, Math.min(12, weekly.length)));
}

interface Detection {
  pattern: RegretPattern;
  domain: Domain | null;
  statement: string;
  magnitude: number;
  evidence: Evidence[];
  action: string;
  because: string;
  tinyStep: string;
  effortMinutes: number;
  subjects?: string[];
}

// ---------------------------------------------------------------------------
// Detectors
// ---------------------------------------------------------------------------

/**
 * Pattern 1 — living someone else's life.
 *
 * The most profound of the five and, pleasingly, the most computable: it is the
 * sustained distance between what someone *said* mattered most and where their
 * hours actually went. No inference about their soul, just arithmetic on their
 * own two answers.
 */
function livingSomeoneElsesLife(d: RegretEngineData, domains: EngineContext['domains']): Detection | null {
  const top = d.valueRanking[0];
  if (!top) return null;

  const state = domains.find((s) => s.domain === top);
  const history = d.attentionHistory.find((h) => h.domain === top);
  if (!state || !history || history.weekly.length < MIN_WEEKS) return null;

  const sustained = mean(recent(history.weekly));
  const gap = state.importance - sustained;
  if (gap < DIVERGENCE_THRESHOLD) return null;

  return {
    pattern: 'living-someone-elses-life',
    domain: top,
    statement: `You put ${top} first, and for the last ${recent(history.weekly).length} weeks it has received about ${Math.round(sustained)} out of the ${Math.round(state.importance)} you said it deserves.`,
    magnitude: Math.round(gap),
    evidence: [
      { label: `declared importance of ${top}`, value: Math.round(state.importance), source: 'onboarding:priorityRanking' },
      { label: `sustained attention to ${top}`, value: Math.round(sustained), source: 'behaviour:weekly attention' },
      { label: 'weeks of evidence', value: recent(history.weekly).length, source: 'behaviour:weekly attention' },
    ],
    action: `Put one hour of ${top} in this week`,
    because: `This is the gap you would most likely look back on. One hour is enough to start closing it.`,
    tinyStep: `Open your calendar and find the hour. Don't fill it yet.`,
    effortMinutes: 5,
  };
}

/**
 * Pattern 2 — worked too hard.
 *
 * Deliberately requires *both* career crowding and something else starving.
 * Loving your work is not a regret; a career eating the rest of a life is.
 */
function workedTooHard(d: RegretEngineData, domains: EngineContext['domains']): Detection | null {
  const career = d.attentionHistory.find((h) => h.domain === 'career');
  if (!career || career.weekly.length < MIN_WEEKS) return null;

  const careerLevel = mean(recent(career.weekly));
  if (careerLevel < CROWDING_THRESHOLD) return null;

  const casualties = (['relationships', 'health'] as Domain[])
    .map((domain) => {
      const h = d.attentionHistory.find((x) => x.domain === domain);
      return h && h.weekly.length >= MIN_WEEKS
        ? { domain, level: mean(recent(h.weekly)) }
        : null;
    })
    .filter((x): x is { domain: Domain; level: number } => x !== null)
    .filter((x) => x.level < STARVED_THRESHOLD);

  if (!casualties.length) return null;
  const worst = casualties.sort((a, b) => a.level - b.level)[0];

  return {
    pattern: 'worked-too-hard',
    domain: 'career',
    statement: `Work has held about ${Math.round(careerLevel)} of your attention for ${recent(career.weekly).length} weeks while ${worst.domain} has run at ${Math.round(worst.level)}. That trade is being made, whether or not it was chosen.`,
    magnitude: Math.round(careerLevel - worst.level),
    evidence: [
      { label: 'sustained career attention', value: Math.round(careerLevel), source: 'behaviour:weekly attention' },
      { label: `sustained ${worst.domain} attention`, value: Math.round(worst.level), source: 'behaviour:weekly attention' },
      { label: 'weeks sustained', value: recent(career.weekly).length, source: 'behaviour:weekly attention' },
    ],
    action: `Protect one evening this week`,
    because: `Not less ambition — one evening that work is not allowed to take.`,
    tinyStep: `Pick the evening. Tell one person it is theirs.`,
    effortMinutes: 5,
    subjects: [worst.domain],
  };
}

/**
 * Pattern 3 — things left unsaid.
 *
 * Only ever fires on things the person themselves wrote down as wanting to say.
 * The engine never infers that someone has feelings they are suppressing; that
 * would be both wrong and intrusive.
 */
function leftUnsaid(d: RegretEngineData): Detection | null {
  const stale = d.unsaid
    .filter((u) => u.ageDays >= UNSAID_STALE_DAYS)
    .sort((a, b) => b.ageDays - a.ageDays);
  if (!stale.length) return null;

  const oldest = stale[0];
  const who = oldest.personName ? ` to ${oldest.personName}` : '';

  return {
    pattern: 'left-things-unsaid',
    domain: 'relationships',
    statement: `You wrote down something you wanted to say${who} ${Math.round(oldest.ageDays / 7)} weeks ago, and it is still waiting.`,
    magnitude: Math.min(100, Math.round(oldest.ageDays / 2)),
    evidence: [
      { label: 'days since you noted it', value: Math.round(oldest.ageDays), source: 'journal:unsaid' },
      { label: 'other things waiting', value: stale.length - 1, source: 'journal:unsaid' },
    ],
    action: oldest.personName ? `Say it to ${oldest.personName}` : 'Say the thing you wrote down',
    because: `You already decided this mattered. The only thing left is the saying.`,
    tinyStep: `Open the message. Type the first sentence. Send it or don't.`,
    effortMinutes: 10,
    subjects: [oldest.id],
  };
}

/**
 * Pattern 4 — lost touch.
 *
 * Friendships specifically, because they are the ones that decay without any
 * single moment of decision. Judged against the person's own target cadence,
 * never against a norm we invented.
 */
function lostTouch(d: RegretEngineData): Detection | null {
  const drifting = d.contacts
    .filter((c) => c.relationType === 'friend' || c.relationType === 'friends')
    .filter((c) => c.daysSinceContact !== null)
    .map((c) => ({ c, ratio: (c.daysSinceContact as number) / Math.max(1, c.desiredGapDays) }))
    .filter((x) => x.ratio >= 3)
    .sort((a, b) => b.ratio - a.ratio);

  if (!drifting.length) return null;
  const { c, ratio } = drifting[0];

  return {
    pattern: 'lost-touch',
    domain: 'relationships',
    statement: `It has been ${c.daysSinceContact} days since you spoke to ${c.name} — about ${Math.round(ratio)}× longer than the gap you said you wanted.`,
    magnitude: Math.min(100, Math.round(ratio * 20)),
    evidence: [
      { label: `days since ${c.name}`, value: c.daysSinceContact as number, source: 'ContactLog' },
      { label: 'your target gap (days)', value: c.desiredGapDays, source: 'Relationship.desiredCallFrequency' },
      { label: 'others drifting', value: drifting.length - 1, source: 'ContactLog' },
    ],
    action: `Send ${c.name} one message`,
    because: `Friendships rarely end in a decision. They end in a gap that nobody closed.`,
    tinyStep: `One line. A memory, a photo, or just "you crossed my mind".`,
    effortMinutes: 3,
    subjects: [c.id],
  };
}

/**
 * Pattern 5 — joy deferred.
 *
 * Ware's fifth is the one people dismiss as soft, and it is the one most
 * visible in data: experiences and mindfulness held near zero for months while
 * everything else gets funded.
 */
function joyDeferred(d: RegretEngineData): Detection | null {
  const candidates = (['experiences', 'mindfulness'] as Domain[])
    .map((domain) => {
      const h = d.attentionHistory.find((x) => x.domain === domain);
      return h && h.weekly.length >= MIN_WEEKS
        ? { domain, level: mean(recent(h.weekly)), weeks: recent(h.weekly).length }
        : null;
    })
    .filter((x): x is { domain: Domain; level: number; weeks: number } => x !== null)
    .filter((x) => x.level < STARVED_THRESHOLD)
    .sort((a, b) => a.level - b.level);

  if (!candidates.length) return null;
  const worst = candidates[0];

  return {
    pattern: 'joy-deferred',
    domain: worst.domain,
    statement: `${worst.domain === 'experiences' ? 'Doing things you enjoy' : 'Time that is genuinely yours'} has run at about ${Math.round(worst.level)} for ${worst.weeks} weeks. It is the easiest thing to keep postponing and the hardest to get back.`,
    magnitude: Math.round(STARVED_THRESHOLD - worst.level) * 4,
    evidence: [
      { label: `sustained ${worst.domain} attention`, value: Math.round(worst.level), source: 'behaviour:weekly attention' },
      { label: 'weeks at this level', value: worst.weeks, source: 'behaviour:weekly attention' },
    ],
    action: worst.domain === 'experiences' ? 'Claim one day this month' : 'Take twenty minutes with nothing in your hands',
    because: `Not a plan. One thing, on a date, that exists for no reason but enjoying it.`,
    tinyStep: `Name the thing. Naming it is the whole step.`,
    effortMinutes: 5,
  };
}

/**
 * Health, added to Ware's five because it is the regret the others are usually
 * paid for. Same sustained-pattern rule.
 */
function bodyIgnored(d: RegretEngineData): Detection | null {
  const h = d.attentionHistory.find((x) => x.domain === 'health');
  if (!h || h.weekly.length < MIN_WEEKS) return null;
  const level = mean(recent(h.weekly));
  if (level >= STARVED_THRESHOLD) return null;

  return {
    pattern: 'body-ignored',
    domain: 'health',
    statement: `Your body has been getting about ${Math.round(level)} of your attention for ${recent(h.weekly).length} weeks. Everything else on this list gets harder when that number stays low.`,
    magnitude: Math.round((STARVED_THRESHOLD - level) * 4),
    evidence: [
      { label: 'sustained health attention', value: Math.round(level), source: 'behaviour:weekly attention' },
      { label: 'weeks at this level', value: recent(h.weekly).length, source: 'behaviour:weekly attention' },
    ],
    action: 'Move for twenty minutes today',
    because: `Not a programme. Twenty minutes, once, to prove it is still available.`,
    tinyStep: 'Put your shoes on. You are allowed to stop there.',
    effortMinutes: 20,
  };
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

/** Exposed for testing and for the Decision engine, which reads these. */
export function detectRegretPatterns(
  data: RegretEngineData,
  domains: EngineContext['domains'],
): Detection[] {
  return [
    livingSomeoneElsesLife(data, domains),
    workedTooHard(data, domains),
    leftUnsaid(data),
    lostTouch(data),
    joyDeferred(data),
    bodyIgnored(data),
  ].filter((x): x is Detection => x !== null)
    // Strongest signal first; the orchestrator will still ration to one.
    .sort((a, b) => b.magnitude - a.magnitude);
}

export const regretEngine: Engine = {
  id: 'regret',

  run(ctx: EngineContext): EngineOutput {
    const data = ctx.data.regret as RegretEngineData | undefined;
    if (!data) return { observations: [], proposals: [] };

    const detections = detectRegretPatterns(data, ctx.domains);
    const observations: Observation[] = [];
    const proposals: Proposal[] = [];

    for (const d of detections) {
      const id = `regret:${d.pattern}`;
      observations.push({
        id,
        engine: 'regret',
        domain: d.domain,
        statement: d.statement,
        magnitude: Math.min(100, d.magnitude),
        // Never `insist`. These land hard enough on their own, and the person
        // did not ask to be confronted today.
        pressure: d.magnitude >= 60 ? 'mention' : 'whisper',
        evidence: d.evidence,
        subjects: d.subjects,
        observedAt: ctx.now,
      });
      proposals.push({
        id: `${id}:door`,
        engine: 'regret',
        domain: d.domain,
        action: d.action,
        because: d.because,
        effortMinutes: d.effortMinutes,
        pressure: 'whisper',
        addresses: [id],
        tinyStep: d.tinyStep,
        dismissible: true,
      });
    }

    return { observations, proposals };
  },
};
