/**
 * One place that decides what this process is allowed to run with.
 *
 * The rule: a missing environment variable must never quietly downgrade
 * security. Before this existed, an unset `JWT_ACCESS_SECRET` fell back to the
 * string 'dev-secret' — which is in the repository — and an unset
 * `CORS_ORIGINS` reflected every origin with credentials. Both failures were
 * invisible: the app booted, logged nothing, and served traffic.
 *
 * So: in production every secret is required and the process refuses to start
 * without one. In development the convenience defaults stay, because a local
 * clone should run with no setup — but they are announced loudly enough that
 * nobody mistakes them for configuration.
 */

export const isProduction = process.env.NODE_ENV === 'production';

/** Only ever used off production, and never silently. */
const DEV_FALLBACKS: Record<string, string> = {
  JWT_ACCESS_SECRET: 'dev-only-access-secret',
  JWT_REFRESH_SECRET: 'dev-only-refresh-secret',
};

const warned = new Set<string>();

export function requireSecret(name: keyof typeof DEV_FALLBACKS | string): string {
  const value = process.env[name];
  if (value) return value;

  if (isProduction) {
    throw new Error(
      `${name} is not set. Refusing to start: signing tokens with a default `
      + 'secret would let anyone mint credentials for any account.',
    );
  }

  const fallback = DEV_FALLBACKS[name];
  if (!fallback) throw new Error(`${name} is not set and has no development default.`);
  if (!warned.has(name)) {
    warned.add(name);
    // eslint-disable-next-line no-console
    console.warn(`[env] ${name} unset — using an insecure development value.`);
  }
  return fallback;
}

/**
 * Allowed browser origins. Production must name them; there is no "reflect
 * whatever asked" mode, because that plus `credentials: true` hands any site
 * the ability to act as a logged-in user.
 */
export function corsOrigins(): string[] | boolean {
  const configured = process.env.CORS_ORIGINS
    ?.split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  if (configured?.length) return configured;

  if (isProduction) {
    throw new Error(
      'CORS_ORIGINS is not set. Refusing to start: an open CORS policy with '
      + 'credentials lets any website act as a signed-in user.',
    );
  }
  return true;
}

/** Bodies are prose and small JSON. Anything larger is a mistake or an attack. */
export const BODY_LIMIT = process.env.BODY_LIMIT ?? '256kb';
