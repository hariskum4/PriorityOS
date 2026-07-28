/**
 * The Life Graph.
 *
 * "Everything influences everything else" is easy to assert and worthless until
 * it is computable. This is the substrate that makes it computable: a typed
 * graph of the things in a person's life, with weighted, signed influence edges
 * that other engines traverse.
 *
 * Two operations matter:
 *
 *   `propagate()`  — spreads a change from one node outward along influence
 *                    edges with distance decay, so "your sleep dropped" becomes
 *                    a quantified expectation about decision quality and
 *                    patience at home rather than a vibe.
 *
 *   `explain()`    — returns the actual path between two nodes, so the system
 *                   can say *why* it thinks career stress is reaching a
 *                   relationship. Provenance again: the explanation is read
 *                   off the graph, never generated.
 *
 * Deliberately not a general graph database. It is small (hundreds of nodes per
 * person), in-memory, immutable once built, and pure — which is what lets the
 * whole life model run inside a unit test.
 */

import { Domain } from './contract';

export type NodeKind =
  | 'domain' | 'person' | 'goal' | 'habit' | 'memory'
  | 'decision' | 'knowledge' | 'place' | 'metric';

export interface GraphNode {
  id: string;
  kind: NodeKind;
  label: string;
  domain?: Domain;
  /**
   * 0..100 current standing, where higher is healthier. Optional because some
   * nodes (a place, a book) have no health of their own.
   */
  state?: number;
}

/**
 * A directed influence. `weight` is how much `from` moves `to`, signed:
 * +0.6 means they rise together, −0.6 means one rises as the other falls.
 *
 * Signed weights are the whole point. An unsigned "relatedness" graph cannot
 * express the most important fact in the product — that career and health
 * frequently trade against each other.
 */
export interface GraphEdge {
  from: string;
  to: string;
  /** −1..1 */
  weight: number;
  /** Why this edge exists, shown verbatim when explaining a path. */
  rationale: string;
}

/** How far influence travels before it is considered noise. */
const MAX_DEPTH = 3;
/** Multiplier applied per hop, so second-order effects are weaker. */
const HOP_DECAY = 0.55;
/** Effects smaller than this are dropped rather than reported as findings. */
const NOISE_FLOOR = 0.02;

export interface Influence {
  nodeId: string;
  /** Signed expected change, same units as `state` (0..100 scale). */
  delta: number;
  /** Hops from the origin. 1 = direct. */
  distance: number;
  /** The chain that produced it, origin-first. */
  via: string[];
}

export class LifeGraph {
  private nodes = new Map<string, GraphNode>();
  private outgoing = new Map<string, GraphEdge[]>();
  private incoming = new Map<string, GraphEdge[]>();

  static from(nodes: GraphNode[], edges: GraphEdge[]): LifeGraph {
    const g = new LifeGraph();
    nodes.forEach((n) => g.addNode(n));
    edges.forEach((e) => g.addEdge(e));
    return g;
  }

  addNode(node: GraphNode): this {
    this.nodes.set(node.id, node);
    return this;
  }

  /** Silently ignores edges to unknown nodes — a partial graph still reasons. */
  addEdge(edge: GraphEdge): this {
    if (!this.nodes.has(edge.from) || !this.nodes.has(edge.to)) return this;
    if (!this.outgoing.has(edge.from)) this.outgoing.set(edge.from, []);
    if (!this.incoming.has(edge.to)) this.incoming.set(edge.to, []);
    this.outgoing.get(edge.from)!.push(edge);
    this.incoming.get(edge.to)!.push(edge);
    return this;
  }

  node(id: string): GraphNode | undefined {
    return this.nodes.get(id);
  }

  get order(): number {
    return this.nodes.size;
  }

  neighbours(id: string): GraphEdge[] {
    return this.outgoing.get(id) ?? [];
  }

  /** Nodes of a kind, in insertion order for deterministic output. */
  ofKind(kind: NodeKind): GraphNode[] {
    return [...this.nodes.values()].filter((n) => n.kind === kind);
  }

  /**
   * Spread a change outward from one node.
   *
   * Breadth-first with decay, keeping the strongest path to each node rather
   * than summing every route — summing double-counts a shared cause and makes
   * a modest change look catastrophic three hops out.
   */
  propagate(originId: string, delta: number): Influence[] {
    if (!this.nodes.has(originId) || delta === 0) return [];

    const best = new Map<string, Influence>();
    type Step = { id: string; delta: number; depth: number; via: string[] };
    const queue: Step[] = [{ id: originId, delta, depth: 0, via: [originId] }];

    while (queue.length) {
      const step = queue.shift()!;
      if (step.depth >= MAX_DEPTH) continue;

      for (const edge of this.neighbours(step.id)) {
        // Never fold influence back through the chain that produced it.
        if (step.via.includes(edge.to)) continue;

        const next = step.delta * edge.weight * HOP_DECAY;
        if (Math.abs(next) < NOISE_FLOOR) continue;

        const depth = step.depth + 1;
        const via = [...step.via, edge.to];
        const existing = best.get(edge.to);

        if (!existing || Math.abs(next) > Math.abs(existing.delta)) {
          best.set(edge.to, { nodeId: edge.to, delta: next, distance: depth, via });
        }
        queue.push({ id: edge.to, delta: next, depth, via });
      }
    }

    return [...best.values()].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  }

  /**
   * The strongest influence path between two nodes, with each hop's rationale.
   *
   * This is what turns "your work is affecting your marriage" from an assertion
   * into a citation: the returned rationales are the sentences shown to the
   * person, in order.
   */
  explain(fromId: string, toId: string): { hops: GraphEdge[]; strength: number } | null {
    if (!this.nodes.has(fromId) || !this.nodes.has(toId)) return null;

    let bestPath: GraphEdge[] | null = null;
    let bestStrength = 0;

    const walk = (id: string, path: GraphEdge[], strength: number, seen: Set<string>) => {
      if (path.length > MAX_DEPTH) return;
      if (id === toId && path.length > 0) {
        if (Math.abs(strength) > Math.abs(bestStrength)) {
          bestStrength = strength;
          bestPath = [...path];
        }
        return;
      }
      for (const edge of this.neighbours(id)) {
        if (seen.has(edge.to)) continue;
        seen.add(edge.to);
        walk(edge.to, [...path, edge], strength * edge.weight, seen);
        seen.delete(edge.to);
      }
    };

    walk(fromId, [], 1, new Set([fromId]));
    return bestPath ? { hops: bestPath, strength: bestStrength } : null;
  }

  /**
   * Nodes whose state is low and which many things depend on — the load-bearing
   * weak points. Sorted by how much of the rest of the graph they hold up, so
   * effort goes where it moves the most life at once.
   */
  loadBearingRisks(threshold = 50): Array<{ node: GraphNode; dependents: number }> {
    return [...this.nodes.values()]
      .filter((n) => typeof n.state === 'number' && n.state < threshold)
      .map((n) => ({ node: n, dependents: this.neighbours(n.id).length }))
      .filter((r) => r.dependents > 0)
      .sort((a, b) =>
        (b.dependents - a.dependents)
        || ((a.node.state ?? 0) - (b.node.state ?? 0)));
  }
}

/**
 * The default cross-domain influence model.
 *
 * These weights encode the causal claims the product spec makes out loud —
 * career stress reaching relationships, sleep reaching decision quality,
 * exercise reaching confidence, finances reaching freedom. They are starting
 * priors, meant to be replaced per-person by the Personalization engine once
 * there is enough behavioural evidence to beat a prior.
 *
 * Every edge carries the sentence shown to the user when it is used, so the
 * model cannot drift away from the explanation.
 */
export const DEFAULT_DOMAIN_EDGES: GraphEdge[] = [
  { from: 'health', to: 'career', weight: 0.5,
    rationale: 'Rested weeks are the ones where your work actually lands.' },
  { from: 'health', to: 'mindfulness', weight: 0.45,
    rationale: 'A body under strain makes stillness harder to reach.' },
  { from: 'career', to: 'health', weight: -0.45,
    rationale: 'Long stretches of work are usually paid for in sleep and movement.' },
  { from: 'career', to: 'relationships', weight: -0.5,
    rationale: 'Work rarely asks permission before taking evenings.' },
  { from: 'career', to: 'finances', weight: 0.6,
    rationale: 'Steady work is what makes the financial picture calm.' },
  { from: 'finances', to: 'purpose', weight: 0.35,
    rationale: 'Money buys the freedom to choose what you spend a decade on.' },
  { from: 'finances', to: 'mindfulness', weight: 0.3,
    rationale: 'Financial pressure is one of the loudest kinds of background noise.' },
  { from: 'relationships', to: 'mindfulness', weight: 0.4,
    rationale: 'Feeling held by people is most of what settles a mind.' },
  { from: 'relationships', to: 'purpose', weight: 0.35,
    rationale: 'Most people find their sense of why through other people.' },
  { from: 'mindfulness', to: 'health', weight: 0.35,
    rationale: 'Attention is what makes the healthy choice reachable in the moment.' },
  { from: 'growth', to: 'career', weight: 0.4,
    rationale: 'What you learn shows up in your work about a season later.' },
  { from: 'growth', to: 'purpose', weight: 0.45,
    rationale: 'Becoming someone slightly different is how purpose gets found.' },
  { from: 'experiences', to: 'relationships', weight: 0.5,
    rationale: 'Shared experience is the raw material of closeness.' },
  { from: 'experiences', to: 'mindfulness', weight: 0.35,
    rationale: 'Novelty is one of the few reliable ways back into the present.' },
  { from: 'purpose', to: 'career', weight: 0.4,
    rationale: 'Knowing why makes the work cost less.' },
];

/** Build the eight-domain skeleton from current standing. */
export function domainGraph(states: Array<{ domain: Domain; state: number }>): LifeGraph {
  const nodes: GraphNode[] = states.map((s) => ({
    id: s.domain, kind: 'domain', label: s.domain, domain: s.domain, state: s.state,
  }));
  const known = new Set(nodes.map((n) => n.id));
  const edges = DEFAULT_DOMAIN_EDGES.filter((e) => known.has(e.from) && known.has(e.to));
  return LifeGraph.from(nodes, edges);
}
