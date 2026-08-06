import type { IncomingMessage, ServerResponse } from 'http';

/**
 * The whole API, as one Vercel function.
 *
 * It ran on Render, which is a long-lived container: fine, free, and eight
 * thousand miles from the database. Every request paid about 1.2 seconds per
 * round trip from Oregon to the pooler in ap-south-1, and that single number
 * is behind every latency bug this app has had — sign-up at nineteen seconds,
 * a completion at twenty-eight, a dashboard at six. Each was fixed by removing
 * round trips, which is real work that buys back a constant somebody else set.
 *
 * `regions: ["bom1"]` in vercel.json is the other way to fix it: the function
 * runs in Mumbai, beside the database, and the constant goes from 1.2 seconds
 * to single-digit milliseconds. Render's fifty-second cold start goes with it.
 *
 * Three things about this file are load-bearing:
 *
 *   **Booted once, not per request.** A Vercel function instance is reused
 *   across invocations, so the Nest application — with its dependency graph,
 *   its Prisma client and its connection — is created on the first request and
 *   held. Creating it per request would open a new database connection per
 *   request and exhaust the pooler under any real traffic.
 *
 *   **The promise is cached, not the app.** Two requests can arrive at a cold
 *   instance before the first has finished booting. Caching the promise means
 *   the second waits for the first boot; caching the app means two boots.
 *
 *   **It imports the compiled output, not the source.** Vercel bundles
 *   functions with esbuild, which does not emit `design:paramtypes` — the
 *   decorator metadata Nest's entire dependency injection reads. Bundled from
 *   source, every constructor argument becomes undefined and nothing resolves.
 *   `tsc` emits it, so the build compiles the API first and this imports the
 *   result.
 */

/* eslint-disable @typescript-eslint/no-var-requires, global-require */

type Handler = (req: IncomingMessage, res: ServerResponse) => void;

let booting: Promise<Handler> | null = null;

async function boot(): Promise<Handler> {
  const { NestFactory } = require('@nestjs/core');
  const { AppModule } = require('../apps/api/dist/src/app.module');
  const { configureApp } = require('../apps/api/dist/src/configure');

  const app = configureApp(await NestFactory.create(AppModule, { logger: ['error', 'warn'] }));

  /**
   * The API answers under `/api`, because it now shares a domain with the web
   * app.
   *
   * On Render it owned its own hostname and could serve `/me` and `/missions`
   * at the root. Here the SPA owns the root — `/`, `/time`, `/missions` are
   * all Expo Router paths — and `/missions` would mean two different things
   * depending on who answered first. Namespacing the API is the only way both
   * can live on one origin, and it is also what makes CORS stop mattering: the
   * client is now same-origin.
   */
  app.setGlobalPrefix('api');

  await app.init();
  return app.getHttpAdapter().getInstance();
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (!booting) booting = boot();
  try {
    const express = await booting;
    express(req, res);
  } catch (err) {
    /* A failed boot must not be cached as a permanently broken instance —
       the next request gets a fresh attempt. */
    booting = null;
    // eslint-disable-next-line no-console
    console.error('[api] boot failed', err);
    res.statusCode = 503;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ message: 'The API is starting up. Try again in a moment.' }));
  }
}
