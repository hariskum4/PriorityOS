/**
 * Work that outlives the response, on a platform that stops the clock.
 *
 * `generateOrDefer` answers with the engine's copy and lets the model catch up
 * behind it. That works on a long-lived container — the process is still
 * there, so a floating promise finishes — and it is what the API ran on when
 * the pattern was written.
 *
 * It does not work on Vercel. A serverless function is frozen the moment its
 * response is flushed, so the floating promise is suspended mid-flight and the
 * instance is usually recycled before it ever resumes. The deferred work never
 * finished, and nothing said so: the endpoint returned the fallback every
 * time, correctly, forever.
 *
 * Found by running the AI smoke test against production and reading the
 * `model` column. Every kind that calls `generate` directly had real
 * generations; `moment_prompts`, the one that defers, had **zero** across
 * every attempt — 4 rows, all `fallback`. `daily_focus` defers too and had
 * survived only because a second, blocking caller writes the same kind.
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
