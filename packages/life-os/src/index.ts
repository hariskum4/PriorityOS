/**
 * @priority/life-os — the Life Operating System kernel.
 *
 * `packages/scoring-engine` is the mathematics; this is the operating system
 * around it. It owns three things and deliberately nothing else:
 *
 *   contract.ts     the engine interface every engine implements, and the
 *                   vocabulary they all speak (Observation, Proposal, Evidence,
 *                   Uncertainty, Pressure)
 *   orchestrator.ts the cycle — resolve order, run engines, then reduce many
 *                   competing voices into the few things a person should see
 *   lifeGraph.ts    the substrate that makes "everything affects everything"
 *                   computable and explainable
 *
 * Engines themselves live beside these as pure modules (decision.ts first,
 * being the spec's declared heart). Anything that needs a database, a network
 * call, or the current time belongs in `apps/api`, which assembles an
 * `EngineContext` and hands it in.
 *
 * The invariant worth protecting: nothing in this package performs I/O, reads
 * the clock, or calls a model. That is what makes a person's whole life model
 * runnable inside a unit test.
 */

export * from './contract';
export * from './orchestrator';
export * from './lifeGraph';

// Engines, in the order they matter to the mission.
export * from './decision';
export * from './regret';
export * from './goal';
export * from './prediction';
export * from './knowledge';
export * from './capture';
