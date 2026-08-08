/**
 * Background work must finish everywhere, and never take a request with it.
 *
 * The bug this guards against was silent by construction: on Vercel the
 * function froze the moment the response flushed, the deferred generation was
 * suspended mid-call, and the endpoint returned its fallback forever without
 * a single error. Nothing had failed — the work just never ran.
 *
 * So the two properties that matter are (1) the promise still runs when the
 * platform hook is absent, and (2) nothing the hook does can break the caller.
 */
import { describe, it, expect, vi } from 'vitest';
import { keepAlive } from './keep-alive';

describe('work that outlives the response', () => {
  /* Off Vercel — local Nest, a container — `waitUntil` is a no-op and the
     promise finishes the old way. */
  it('lets the promise run to completion without the platform hook', async () => {
    let done = false;
    const work = Promise.resolve().then(() => { done = true; });
    keepAlive(work);
    await work;
    expect(done).toBe(true);
  });

  it('returns immediately rather than awaiting the work', () => {
    let settled = false;
    const slow = new Promise<void>((r) => setTimeout(() => { settled = true; r(); }, 30));
    keepAlive(slow);
    /* The whole point: the response is not held for the model. */
    expect(settled).toBe(false);
  });

  /**
   * A rejection inside background work must not surface as an unhandled
   * rejection, which on a serverless instance is a crash rather than a log.
   * The caller attaches its own catch; this asserts `keepAlive` does not
   * strip or re-throw it.
   */
  it('does not turn a handled rejection into an unhandled one', async () => {
    const onUnhandled = vi.fn();
    process.once('unhandledRejection', onUnhandled);
    const caught = Promise.reject(new Error('model down')).catch(() => 'handled');
    keepAlive(caught);
    await expect(caught).resolves.toBe('handled');
    await new Promise((r) => setImmediate(r));
    expect(onUnhandled).not.toHaveBeenCalled();
    process.off('unhandledRejection', onUnhandled);
  });

  it('accepts an already-settled promise', () => {
    expect(() => keepAlive(Promise.resolve(1))).not.toThrow();
  });
});
