import { describe, it, expect } from 'vitest';
import { LifeGraph, domainGraph, DEFAULT_DOMAIN_EDGES } from './lifeGraph';

describe('life graph', () => {
  it('propagates a change outward with decay', () => {
    const g = domainGraph([
      { domain: 'career', state: 40 },
      { domain: 'health', state: 55 },
      { domain: 'relationships', state: 45 },
      { domain: 'mindfulness', state: 50 },
    ]);

    // Career surging is the product's headline claim: it is paid for elsewhere.
    const effects = g.propagate('career', 20);
    const byId = new Map(effects.map((e) => [e.nodeId, e]));

    expect(byId.get('health')!.delta).toBeLessThan(0);
    expect(byId.get('relationships')!.delta).toBeLessThan(0);
    // Second-order effects exist but are weaker than first-order ones.
    const mind = byId.get('mindfulness');
    expect(mind!.distance).toBeGreaterThan(1);
    expect(Math.abs(mind!.delta)).toBeLessThan(Math.abs(byId.get('health')!.delta));
  });

  it('keeps the strongest path rather than summing every route', () => {
    // Summing would double-count a shared cause and inflate distant effects.
    const g = LifeGraph.from(
      [
        { id: 'a', kind: 'domain', label: 'a', state: 50 },
        { id: 'b', kind: 'domain', label: 'b', state: 50 },
        { id: 'c', kind: 'domain', label: 'c', state: 50 },
        { id: 'd', kind: 'domain', label: 'd', state: 50 },
      ],
      [
        { from: 'a', to: 'b', weight: 1, rationale: 'r' },
        { from: 'a', to: 'c', weight: 1, rationale: 'r' },
        { from: 'b', to: 'd', weight: 1, rationale: 'r' },
        { from: 'c', to: 'd', weight: 1, rationale: 'r' },
      ],
    );
    const d = g.propagate('a', 100).find((e) => e.nodeId === 'd')!;
    // Two routes of equal strength: 100 * 0.55 * 0.55 ≈ 30.25, not ~60.
    expect(d.delta).toBeCloseTo(30.25, 1);
  });

  it('never folds influence back through its own chain', () => {
    const g = LifeGraph.from(
      [
        { id: 'x', kind: 'domain', label: 'x', state: 50 },
        { id: 'y', kind: 'domain', label: 'y', state: 50 },
      ],
      [
        { from: 'x', to: 'y', weight: 0.8, rationale: 'r' },
        { from: 'y', to: 'x', weight: 0.8, rationale: 'r' },
      ],
    );
    const effects = g.propagate('x', 50);
    expect(effects.map((e) => e.nodeId)).toEqual(['y']);
  });

  it('explains a connection with the real rationales, in order', () => {
    const g = domainGraph([
      { domain: 'career', state: 30 },
      { domain: 'relationships', state: 40 },
    ]);
    const path = g.explain('career', 'relationships');
    expect(path).not.toBeNull();
    expect(path!.hops).toHaveLength(1);
    // The sentence shown to the person is read off the edge, never generated.
    expect(path!.hops[0].rationale).toMatch(/evenings/i);
    expect(path!.strength).toBeLessThan(0);
  });

  it('returns null when two nodes are genuinely unconnected', () => {
    const g = LifeGraph.from(
      [
        { id: 'p', kind: 'person', label: 'Amma' },
        { id: 'b', kind: 'knowledge', label: 'A book' },
      ],
      [],
    );
    expect(g.explain('p', 'b')).toBeNull();
    expect(g.explain('p', 'missing')).toBeNull();
  });

  it('ignores edges pointing at nodes it does not have', () => {
    const g = LifeGraph.from(
      [{ id: 'only', kind: 'domain', label: 'only', state: 50 }],
      [{ from: 'only', to: 'ghost', weight: 1, rationale: 'r' }],
    );
    expect(g.neighbours('only')).toHaveLength(0);
    expect(g.order).toBe(1);
  });

  it('surfaces load-bearing weak points ahead of isolated ones', () => {
    const g = domainGraph([
      { domain: 'health', state: 25 },        // low and influences much
      { domain: 'career', state: 30 },
      { domain: 'relationships', state: 20 }, // low but influences less
      { domain: 'mindfulness', state: 80 },   // healthy, excluded
      { domain: 'finances', state: 40 },
      { domain: 'purpose', state: 45 },
    ]);
    const risks = g.loadBearingRisks(50);
    expect(risks.map((r) => r.node.id)).not.toContain('mindfulness');
    // Effort should go where it moves the most life at once.
    expect(risks[0].dependents).toBeGreaterThanOrEqual(risks[risks.length - 1].dependents);
  });

  it('has a signed influence model — some domains genuinely trade off', () => {
    const negative = DEFAULT_DOMAIN_EDGES.filter((e) => e.weight < 0);
    expect(negative.length).toBeGreaterThan(0);
    // Every edge carries the sentence shown when it is used.
    expect(DEFAULT_DOMAIN_EDGES.every((e) => e.rationale.trim().length > 10)).toBe(true);
  });

  it('does nothing for an unknown origin or a zero change', () => {
    const g = domainGraph([{ domain: 'health', state: 50 }]);
    expect(g.propagate('nope', 10)).toEqual([]);
    expect(g.propagate('health', 0)).toEqual([]);
  });
});
