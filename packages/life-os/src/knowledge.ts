/**
 * The Knowledge Engine.
 *
 * Books, articles, podcasts, notes — everything a person takes in — as
 * *connected* knowledge rather than a reading list. The distinction matters
 * because a reading list is a debt, and this engine is explicitly designed not
 * to create one.
 *
 * It has exactly three jobs:
 *
 *   1. **Surface the right thing at the right moment.** The person is stuck on a
 *      goal, or weighing a decision, and they already own the book about it.
 *      Connecting those two facts is the whole value, and it is the one thing a
 *      reading list can never do.
 *
 *   2. **Turn a finished thing into an action.** A book read and not applied is
 *      entertainment. When an item is finished and overlaps a live goal, the
 *      engine asks for one sentence about what to actually do differently.
 *
 *   3. **Offer release.** Abandoned items are not failures. Half-read books
 *      generate a specific, useless kind of guilt, so the engine names them and
 *      offers to let them go.
 *
 * What it deliberately never does: count unread items, report a backlog size,
 * or suggest reading more. There is no "12 books behind" anywhere in here,
 * because that number changes nobody's life and makes everyone feel worse.
 *
 * Matching is deterministic topic overlap — no embeddings, no model. Overlap on
 * a shared vocabulary is unglamorous and it is inspectable, which for something
 * that interrupts a person is the better trade.
 */

import {
  Domain, Engine, EngineContext, EngineOutput, Evidence,
  Observation, Proposal,
} from './contract';

export type KnowledgeKind = 'book' | 'article' | 'podcast' | 'video' | 'note' | 'course';

export interface KnowledgeItem {
  id: string;
  kind: KnowledgeKind;
  title: string;
  /** Normalised lowercase topic tags. The join key for everything here. */
  topics: string[];
  status: 'queued' | 'active' | 'finished' | 'released';
  domain?: Domain;
  /** Progress 0..1, when the medium has a position. */
  progress?: number;
  lastTouchedAt?: Date | null;
  /** A line the person kept. Their words, shown verbatim. */
  takeaway?: string;
}

/** A goal or decision this engine can connect knowledge to. */
export interface KnowledgeTarget {
  id: string;
  kind: 'goal' | 'decision';
  label: string;
  topics: string[];
  domain?: Domain;
  /** True when the goal is stalled or the decision is open — the useful moment. */
  needsHelp: boolean;
}

export interface KnowledgeEngineData {
  items: KnowledgeItem[];
  targets: KnowledgeTarget[];
}

/** Untouched longer than this and an "active" item has quietly been abandoned. */
const ABANDONED_AFTER_DAYS = 60;
/** Below this share of shared topics, a match is a coincidence. */
const MIN_OVERLAP = 2;

const DAY_MS = 86_400_000;

/** Shared topics between two tag sets, case-insensitive. */
export function topicOverlap(a: string[], b: string[]): string[] {
  const set = new Set(b.map((t) => t.trim().toLowerCase()));
  return a
    .map((t) => t.trim().toLowerCase())
    .filter((t) => set.has(t))
    .filter((t, i, arr) => arr.indexOf(t) === i);
}

/**
 * Best item to surface for a target.
 *
 * Prefers items already started over unread ones — finishing something is
 * cheaper than beginning something, and this engine's job is to reduce load.
 */
export function bestMatch(
  target: KnowledgeTarget,
  items: KnowledgeItem[],
): { item: KnowledgeItem; shared: string[] } | null {
  const candidates = items
    .filter((i) => i.status === 'active' || i.status === 'queued')
    .map((item) => ({ item, shared: topicOverlap(item.topics, target.topics) }))
    .filter((m) => m.shared.length >= MIN_OVERLAP)
    .sort((a, b) =>
      // more overlap first, then already-started, then stable by title
      (b.shared.length - a.shared.length)
      || (Number(b.item.status === 'active') - Number(a.item.status === 'active'))
      || a.item.title.localeCompare(b.item.title));

  return candidates[0] ?? null;
}

export const knowledgeEngine: Engine = {
  id: 'knowledge',
  dependsOn: ['goal', 'decision'],

  run(ctx: EngineContext): EngineOutput {
    const data = ctx.data.knowledge as KnowledgeEngineData | undefined;
    if (!data?.items.length) return { observations: [], proposals: [] };

    const observations: Observation[] = [];
    const proposals: Proposal[] = [];

    // ---- 1. the connection ---------------------------------------------
    // Only for targets that actually need help. Surfacing a relevant book at a
    // person who is doing fine is just noise with good manners.
    for (const target of data.targets.filter((t) => t.needsHelp)) {
      const match = bestMatch(target, data.items);
      if (!match) continue;

      const id = `knowledge:match:${target.id}:${match.item.id}`;
      const started = match.item.status === 'active';

      observations.push({
        id,
        engine: 'knowledge',
        domain: target.domain ?? match.item.domain ?? null,
        statement: started
          ? `You're partway through “${match.item.title}” and it covers ${match.shared.join(' and ')} — which is exactly what ${target.label} is stuck on.`
          : `“${match.item.title}” is in your list and covers ${match.shared.join(' and ')} — the thing ${target.label} needs.`,
        magnitude: Math.min(100, match.shared.length * 25),
        pressure: 'whisper',
        evidence: [
          { label: 'shared topics', value: match.shared.join(', '), source: 'knowledge:topics' },
          { label: 'item status', value: match.item.status, source: 'knowledge:status' },
          { label: target.kind === 'goal' ? 'stalled goal' : 'open decision', value: target.label, source: `${target.kind}:needsHelp` },
        ],
        subjects: [target.id, match.item.id],
        observedAt: ctx.now,
      });
      proposals.push({
        id: `${id}:read`,
        engine: 'knowledge',
        domain: target.domain ?? null,
        action: started
          ? `Read the next section of “${match.item.title}”`
          : `Start “${match.item.title}”`,
        because: `You already have the thing you need for ${target.label}. It's just not open.`,
        effortMinutes: 15,
        pressure: 'whisper',
        addresses: [id],
        tinyStep: 'Open it. Read one page. Close it if you want.',
        dismissible: true,
      });
    }

    // ---- 2. finished but not applied ------------------------------------
    // The gap between reading and changing anything. One sentence closes it.
    for (const item of data.items.filter((i) => i.status === 'finished' && !i.takeaway)) {
      const relevant = data.targets
        .map((t) => ({ t, shared: topicOverlap(item.topics, t.topics) }))
        .filter((m) => m.shared.length >= MIN_OVERLAP)
        .sort((a, b) => b.shared.length - a.shared.length)[0];
      if (!relevant) continue;

      const id = `knowledge:apply:${item.id}`;
      observations.push({
        id,
        engine: 'knowledge',
        domain: item.domain ?? relevant.t.domain ?? null,
        statement: `You finished “${item.title}” and haven't written down what it changed. It overlaps ${relevant.t.label}.`,
        magnitude: 40,
        pressure: 'whisper',
        evidence: [
          { label: 'finished item', value: item.title, source: 'knowledge:status' },
          { label: 'shared topics', value: relevant.shared.join(', '), source: 'knowledge:topics' },
        ],
        subjects: [item.id, relevant.t.id],
        observedAt: ctx.now,
      });
      proposals.push({
        id: `${id}:capture`,
        engine: 'knowledge',
        domain: item.domain ?? null,
        action: `Write one line about “${item.title}”`,
        because: `Not a summary. One thing you'll do differently — otherwise it was entertainment.`,
        effortMinutes: 5,
        pressure: 'whisper',
        addresses: [id],
        tinyStep: 'One sentence, starting "So I should…".',
        dismissible: true,
      });
    }

    // ---- 3. release --------------------------------------------------
    // Named individually and offered up, because a half-read book is a specific
    // and useless kind of guilt.
    const abandoned = data.items.filter((i) => {
      if (i.status !== 'active' || !i.lastTouchedAt) return false;
      return (ctx.now.getTime() - i.lastTouchedAt.getTime()) / DAY_MS >= ABANDONED_AFTER_DAYS;
    });

    if (abandoned.length) {
      const oldest = [...abandoned].sort((a, b) =>
        (a.lastTouchedAt!.getTime() - b.lastTouchedAt!.getTime()))[0];
      const days = Math.round((ctx.now.getTime() - oldest.lastTouchedAt!.getTime()) / DAY_MS);
      const id = `knowledge:stalled:${oldest.id}`;
      const evidence: Evidence[] = [
        { label: 'days untouched', value: days, source: 'knowledge:lastTouchedAt' },
        { label: 'others like it', value: abandoned.length - 1, source: 'knowledge:status' },
      ];
      if (typeof oldest.progress === 'number') {
        evidence.push({ label: 'progress', value: `${Math.round(oldest.progress * 100)}%`, source: 'knowledge:progress' });
      }

      observations.push({
        id,
        engine: 'knowledge',
        domain: oldest.domain ?? null,
        statement: `“${oldest.title}” has sat open for ${days} days. It probably stopped being the right thing to read.`,
        magnitude: 30,
        pressure: 'whisper',
        evidence,
        subjects: [oldest.id],
        observedAt: ctx.now,
      });
      proposals.push({
        id: `${id}:release`,
        engine: 'knowledge',
        domain: oldest.domain ?? null,
        action: `Let “${oldest.title}” go`,
        because: `Abandoning a book is not failing at it. Closing it clears the shelf and the small guilt attached to it.`,
        effortMinutes: 1,
        pressure: 'whisper',
        addresses: [id],
        tinyStep: 'Mark it released. You can always come back.',
        dismissible: true,
      });
    }

    return { observations, proposals };
  },
};
