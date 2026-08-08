/**
 * Work that outlives the response, on a platform that stops the clock.
 *
 * `generateOrDefer` answers with the engine's copy and lets the model catch up
 * behind it. That works on a long-lived container — the process is still
 * there, so a floating promise finishes — and it is what the API ran on when
 * the pattern was written.
 *
 * On Vercel it works only by luck. A serverless function is frozen the moment
 * its response is flushed, so the floating promise is suspended mid-flight; it
 * resumes only if that same instance happens to be invoked again before it is
 * recycled. Under a burst of requests the work slips through. Under ordinary
 * spaced-out traffic — one person opening one screen — it does not, and
 * nothing reports a failure, because nothing failed. The endpoint simply
 * returns its fallback.
 *
 * Both halves of that were measured against production, by reading the
 * `model` column, which is the only place the difference shows:
 *
 *   `moment_prompts` — reads spaced 25s apart by the smoke test — was
 *   `fallback` 4 times out of 4, never once reaching the model.
 *
 *   `daily_focus` did complete at 08:05:59, mid-way through a burst of six
 *   verification requests that kept the instance awake. That is the luck, and
 *   it is why the failure looked intermittent rather than total.
 *
 * With `waitUntil`, a single isolated request with no follow-up traffic
 * completes the generation — verified at 09:15:24 on the same account.
 *
 * `waitUntil` is the platform's answer: it tells Vercel to hold the instance
 * open until the promise settles, within the function's `maxDuration` (60s
 * here, against a 25s model timeout). Off Vercel it is a silent no-op and the
 * promise finishes the old way, so this is safe in every environment the app
 * runs in — local Nest, a container, or a function.
 */

type WaitUntil = (work: Promise<unknown>) => void;

/**
 * Resolved once, and never allowed to throw.
 *
 * `@vercel/functions` is a dependency of this workspace, but the function
 * bundle only carries what `includeFiles` names — so a missing module here is
 * a deployment detail, not a reason to fail a request. Absent, the promise is
 * simply left floating, which is exactly the behaviour this replaced.
 */
let resolved: WaitUntil | null | undefined;

function vercelWaitUntil(): WaitUntil | null {
  if (resolved !== undefined) return resolved;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
    const mod = require('@vercel/functions');
    resolved = typeof mod?.waitUntil === 'function' ? (mod.waitUntil as WaitUntil) : null;
  } catch {
    resolved = null;
  }
  return resolved;
}

/**
 * Run `work` past the response, asking the platform to wait where it can.
 *
 * The promise is started by the caller and is already running; this only
 * decides whether the host is asked to stay alive for it. `work` must already
 * handle its own failures — an unhandled rejection inside a background task is
 * a crashed instance, not a logged warning.
 */
export function keepAlive(work: Promise<unknown>): void {
  const waitUntil = vercelWaitUntil();
  if (waitUntil) {
    try {
      waitUntil(work);
      return;
    } catch {
      /* Outside a request context the SDK is a no-op, but a future version
         throwing must not take the request with it. */
    }
  }
  void work;
}
