import { INestApplication, ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { json, urlencoded } from 'express';
import { corsOrigins, BODY_LIMIT } from './common/env';

/**
 * Everything that makes this a Priority API rather than a bare Nest app.
 *
 * Two things boot it now — the long-lived process in `main.ts` and the
 * serverless handler in `/api/index.ts` — and the difference between them
 * must be where they listen, nothing else. This existed inline in `main.ts`
 * when there was only one, and copying it into the second entry point is how
 * a whitelist pipe, a body limit or a CORS rule ends up applying on one host
 * and not the other: a mass-assignment hole that reproduces on production and
 * not locally, and nothing to see in the diff.
 *
 * So both call this, and neither is allowed its own opinion.
 */
export function configureApp(app: INestApplication): INestApplication {
  /* Strips anything not declared on a DTO. This is what stands between
     `PATCH /missions/:id` and every column being writable — see the note on
     `UpdateMissionDto`. */
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // Standard header hardening. This API serves JSON to a native app and a web
  // build, so the CSP default — which assumes it is serving an HTML document —
  // is off rather than fought with.
  app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: false }));

  // Entries are prose, not uploads. A cap stops one request becoming a
  // memory-exhaustion lever.
  app.use(json({ limit: BODY_LIMIT }));
  app.use(urlencoded({ extended: true, limit: BODY_LIMIT }));

  // Production must name its origins: corsOrigins() throws rather than fall
  // back to reflecting every origin with credentials.
  app.enableCors({ origin: corsOrigins(), credentials: true });

  return app;
}
