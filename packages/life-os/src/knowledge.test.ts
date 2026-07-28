import { describe, it, expect } from 'vitest';
import {
  knowledgeEngine, topicOverlap, bestMatch,
  KnowledgeEngineData, KnowledgeItem, KnowledgeTarget,
} from './knowledge';
import { EngineContext } from './contract';

const NOW = new Date('2026-07-28T09:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

const item = (over: Partial<KnowledgeItem> = {}): KnowledgeItem => ({
  id: 'k1',
  kind: 'book',
  title: 'Deep Work',
  topics: ['focus', 'attention', 'career'],
  status: 'queued',
  ...over,
});

const target = (over: Partial<KnowledgeTarget> = {}): KnowledgeTarget => ({
  id: 't1',
  kind: 'goal',
  label: 'ship the proposal',
  topics: ['focus', 'career'],
  needsHelp: true,
  ...over,
});

const ctx = (d: KnowledgeEngineData): EngineContext => ({
  userId: 'u1', now: NOW, age: 34, domains: [],
  personalization: { insightIntensity: 'gentle', motivationStyle: 'balanced', declinedTopics: [] },
  priorObservations: [],
  data: { knowledge: d } as EngineContext['data'],
});

describe('topic matching', () => {
  it('is case and whitespace insensitive, and deduplicates', () => {
    expect(topicOverlap([' Focus ', 'CAREER', 'focus'], ['focus', 'career']))
      .toEqual(['focus', 'career']);
  });

  it('requires more than one shared topic — a single tag is coincidence', () => {
    const m = bestMatch(target({ topics: ['career'] }), [item()]);
    expect(m).toBeNull();
  });

  it('prefers something already started over something unread', () => {
    // Finishing is cheaper than beginning; this engine reduces load.
    const m = bestMatch(target(), [
      item({ id: 'unread', title: 'A New Book', status: 'queued' }),
      item({ id: 'started', title: 'Zzz Later Alphabetically', status: 'active' }),
    ]);
    expect(m!.item.id).toBe('started');
  });

  it('ignores finished and released items when matching', () => {
    const m = bestMatch(target(), [
      item({ id: 'done', status: 'finished' }),
      item({ id: 'gone', status: 'released' }),
    ]);
    expect(m).toBeNull();
  });
});

describe('the connection — the actual value', () => {
  it('surfaces the book the person already owns for the goal they are stuck on', () => {
    const out = knowledgeEngine.run(ctx({
      items: [item({ status: 'active' })],
      targets: [target()],
    }));
    const o = out.observations[0];
    expect(o.statement).toContain('Deep Work');
    expect(o.statement).toContain('ship the proposal');
    expect(o.evidence.some((e) => e.label === 'shared topics')).toBe(true);
  });

  it('says nothing to someone who is not stuck', () => {
    // A relevant book aimed at someone doing fine is noise with good manners.
    const out = knowledgeEngine.run(ctx({
      items: [item({ status: 'active' })],
      targets: [target({ needsHelp: false })],
    }));
    expect(out.observations.filter((o) => o.id.startsWith('knowledge:match'))).toHaveLength(0);
  });

  it('works for an open decision as well as a stalled goal', () => {
    const out = knowledgeEngine.run(ctx({
      items: [item({ title: 'Die With Zero', topics: ['money', 'time', 'regret'] })],
      targets: [target({ id: 'd1', kind: 'decision', label: 'whether to take the offer', topics: ['money', 'regret'] })],
    }));
    expect(out.observations[0].statement).toContain('Die With Zero');
    expect(out.observations[0].evidence.some((e) => e.label === 'open decision')).toBe(true);
  });

  it('keeps the door tiny', () => {
    const out = knowledgeEngine.run(ctx({
      items: [item({ status: 'active' })], targets: [target()],
    }));
    const p = out.proposals[0];
    expect(p.tinyStep).toMatch(/one page/i);
    expect(p.effortMinutes).toBeLessThanOrEqual(15);
  });
});

describe('finished but not applied', () => {
  it('asks for one line about what changes, not a summary', () => {
    const out = knowledgeEngine.run(ctx({
      items: [item({ status: 'finished' })],
      targets: [target({ needsHelp: false })],
    }));
    const p = out.proposals.find((x) => x.id.endsWith(':capture'))!;
    expect(p.because).toMatch(/not a summary/i);
    expect(p.because).toMatch(/otherwise it was entertainment/i);
  });

  it('leaves alone a finished item that already has a takeaway', () => {
    const out = knowledgeEngine.run(ctx({
      items: [item({ status: 'finished', takeaway: 'Protect mornings.' })],
      targets: [target({ needsHelp: false })],
    }));
    expect(out.observations.filter((o) => o.id.startsWith('knowledge:apply'))).toHaveLength(0);
  });

  it('does not chase a finished item unrelated to anything live', () => {
    const out = knowledgeEngine.run(ctx({
      items: [item({ status: 'finished', topics: ['gardening', 'roses'] })],
      targets: [target()],
    }));
    expect(out.observations.filter((o) => o.id.startsWith('knowledge:apply'))).toHaveLength(0);
  });
});

describe('release', () => {
  it('names the abandoned book and offers to let it go', () => {
    const out = knowledgeEngine.run(ctx({
      items: [item({ status: 'active', lastTouchedAt: daysAgo(120), progress: 0.3 })],
      targets: [],
    }));
    const p = out.proposals.find((x) => x.id.endsWith(':release'))!;
    expect(p.action).toContain('Deep Work');
    expect(p.because).toMatch(/not failing at it/i);
    expect(p.effortMinutes).toBeLessThanOrEqual(2);
  });

  it('reports progress as evidence when the medium has a position', () => {
    const out = knowledgeEngine.run(ctx({
      items: [item({ status: 'active', lastTouchedAt: daysAgo(90), progress: 0.42 })],
      targets: [],
    }));
    const o = out.observations.find((x) => x.id.startsWith('knowledge:stalled'))!;
    expect(o.evidence.find((e) => e.label === 'progress')!.value).toBe('42%');
  });

  it('offers only the most abandoned one, not a purge list', () => {
    const out = knowledgeEngine.run(ctx({
      items: [
        item({ id: 'a', title: 'A', status: 'active', lastTouchedAt: daysAgo(200) }),
        item({ id: 'b', title: 'B', status: 'active', lastTouchedAt: daysAgo(100) }),
        item({ id: 'c', title: 'C', status: 'active', lastTouchedAt: daysAgo(80) }),
      ],
      targets: [],
    }));
    const releases = out.proposals.filter((p) => p.id.endsWith(':release'));
    expect(releases).toHaveLength(1);
    expect(releases[0].action).toContain('A');
  });

  it('leaves a recently touched item alone', () => {
    const out = knowledgeEngine.run(ctx({
      items: [item({ status: 'active', lastTouchedAt: daysAgo(5) })],
      targets: [],
    }));
    expect(out.observations.filter((o) => o.id.startsWith('knowledge:stalled'))).toHaveLength(0);
  });
});

describe('what it refuses to do', () => {
  it('never reports a backlog count or tells anyone to read more', () => {
    // "12 books behind" changes nobody's life and makes everyone feel worse.
    const out = knowledgeEngine.run(ctx({
      items: Array.from({ length: 20 }, (_, i) =>
        item({ id: `k${i}`, title: `Book ${i}`, status: 'queued' })),
      targets: [target()],
    }));
    const text = [
      ...out.observations.map((o) => o.statement),
      ...out.proposals.map((p) => `${p.action} ${p.because}`),
    ].join(' ').toLowerCase();
    expect(text).not.toMatch(/backlog|behind|unread|\b20 (books|items)\b|read more/);
  });

  it('is silent with an empty library', () => {
    const out = knowledgeEngine.run(ctx({ items: [], targets: [target()] }));
    expect(out.observations).toEqual([]);
  });

  it('is silent with no data', () => {
    const out = knowledgeEngine.run({ ...ctx({ items: [], targets: [] }), data: {} });
    expect(out.observations).toEqual([]);
  });

  it('keeps every proposal dismissible and grounded', () => {
    const out = knowledgeEngine.run(ctx({
      items: [item({ status: 'active', lastTouchedAt: daysAgo(120) })],
      targets: [target()],
    }));
    const ids = new Set(out.observations.map((o) => o.id));
    expect(out.proposals.length).toBeGreaterThan(0);
    expect(out.proposals.every((p) => p.dismissible === true)).toBe(true);
    expect(out.proposals.every((p) => p.addresses.every((a) => ids.has(a)))).toBe(true);
  });
});
