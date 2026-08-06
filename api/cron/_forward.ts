/**
 * Vercel Cron's half of the arrangement: an alarm clock, not a worker.
 *
 * The jobs themselves stay in the API, next to the services and the database
 * they need. What Vercel provides is the one thing Render's free tier cannot
 * — a clock that fires whether or not the API happens to be awake. Seven
 * `@Cron` decorators sat in that codebase for three weeks without producing a
 * single notification, because a spun-down service runs no scheduler.
 *
 * The request also wakes the instance, which is the point: by the time the
 * work starts there is a process to do it.
 *
 * Two secrets, doing different jobs. `CRON_SECRET` is Vercel's own — it is
 * sent on every cron invocation and is how this function knows the request
 * came from the scheduler rather than from anybody who guessed the path.
 * `API_CRON_SECRET` is what this function then presents to the API. Separate,
 * so neither side can be impersonated with the other's.
 */
type Req = { headers: Record<string, string | string[] | undefined> };
type Res = { status: (code: number) => Res; json: (body: unknown) => void };

export function forward(kind: 'daily' | 'weekly') {
  return async function handler(req: Req, res: Res) {
    const expected = process.env.CRON_SECRET;
    const given = String(req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
    if (!expected || given !== expected) {
      res.status(401).json({ error: 'not the scheduler' });
      return;
    }

    const base = process.env.API_BASE_URL;
    const apiSecret = process.env.API_CRON_SECRET;
    if (!base || !apiSecret) {
      res.status(500).json({ error: 'API_BASE_URL or API_CRON_SECRET is not configured' });
      return;
    }

    /**
     * Generous, deliberately. The first request of the day pays Render's cold
     * start — about forty seconds on the free tier — before any work begins,
     * and the daily batch then touches every onboarded user. Nobody is
     * watching this one; the only wrong answer is giving up on a job that
     * would have finished.
     */
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 300_000);
    try {
      const r = await fetch(`${base}/cron/${kind}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiSecret}` },
        signal: controller.signal,
      });
      const body = await r.text();
      /* The API's own report passes straight through, so a failed job shows
         up in Vercel's cron log rather than only in Render's. */
      res.status(r.status).json({ kind, upstream: r.status, body: body.slice(0, 4000) });
    } catch (err) {
      res.status(504).json({ kind, error: String((err as Error)?.message ?? err) });
    } finally {
      clearTimeout(timer);
    }
  };
}
