/**
 * Thin API client with automatic access-token refresh.
 */
import { storage } from './storage';
import { useAuth } from '../store/auth';

declare const __DEV__: boolean;

/**
 * Where the API is, and what to do when nobody said.
 *
 * The fallback used to be `http://localhost:3000`, which is not this API — it
 * is whatever else happens to be listening on 3000 on the developer's machine.
 * A wrong port is not a quiet default here: this client posts journal entries,
 * relationships and profile details, so a mistaken host means sending somebody's
 * private writing to an unrelated process. The API's own `.env` uses 3001, and
 * so does `.claude/launch.json`.
 *
 * In development an unset value falls back to 3001 and says so once. In a
 * release build there is no sensible fallback at all — an app shipped pointing
 * at localhost is broken for every user — so the value stays empty and the
 * first request fails with a message naming the variable, rather than hanging
 * against a host that will never answer.
 */
const DEV_FALLBACK = 'http://localhost:3001';

function resolveBase(): string {
  const configured = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (configured) return configured.replace(/\/+$/, '');
  if (__DEV__) {
    console.warn(
      `[api] EXPO_PUBLIC_API_URL is not set — falling back to ${DEV_FALLBACK}. ` +
      'Set it in apps/mobile/.env if the API is somewhere else.',
    );
    return DEV_FALLBACK;
  }
  return '';
}

const BASE = resolveBase();

/**
 * Is the API answering?
 *
 * Unauthenticated and body-less on purpose: this asks one question — is there
 * something on the other end — so it stays correct whether or not the reader
 * is signed in, and cannot itself be the thing that fails.
 *
 * *Any* HTTP response counts as reachable, including an error one. Checking
 * `res.ok` conflated "the server is down" with "the server said no": probing
 * every few seconds trips the API's own rate limiter, and the resulting 429 —
 * which is proof of a server that is very much alive — read as still offline
 * and pinned the offline banner up permanently. Only a transport failure,
 * where nothing answers at all, means unreachable.
 */
export async function pingServer(): Promise<boolean> {
  if (!BASE) return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);
  try {
    await fetch(`${BASE}/health`, { signal: controller.signal });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** Fail with the cause, not with a timeout against nothing. */
function requireBase(): string {
  if (!BASE) {
    throw new Error(
      'EXPO_PUBLIC_API_URL is not set. This build has no API to talk to — ' +
      'set it at build time and rebuild.',
    );
  }
  return BASE;
}

/**
 * One refresh at a time.
 *
 * A screen opening five queries at once will get five 401s at once. Without
 * this, each fired its own refresh: the first rotated the stored token and the
 * other four presented one that no longer existed, so four requests failed and
 * the server logged four stack traces on every sign-in. They all wait on the
 * same promise now, and the losers get the winner's tokens.
 */
let inFlight: Promise<boolean> | null = null;

async function doRefresh(): Promise<boolean> {
  const refreshToken = await storage.getItem('refreshToken');
  if (!refreshToken) return false;
  let res: Response;
  try {
    res = await fetch(`${requireBase()}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
  } catch {
    // Offline mid-refresh is not "your session ended" — let the original
    // request report the network failure instead of signing anyone out.
    return false;
  }
  if (!res.ok) return false;
  const tokens = await res.json();
  await useAuth.getState().setTokens(tokens);
  return true;
}

function refreshTokens(): Promise<boolean> {
  if (!inFlight) {
    inFlight = doRefresh().finally(() => { inFlight = null; });
  }
  return inFlight;
}

/**
 * How long to wait before calling it dead.
 *
 * A refused connection rejects immediately, but a request that is *accepted*
 * and never answered — a paused database behind the API, a captive wifi
 * portal, a server mid-restart — hangs forever, and every caller of this
 * client renders that as a permanently disabled button. There is no state in
 * this app worth waiting more than fifteen seconds for.
 */
const TIMEOUT_MS = 15_000;

/** A failure that means "the network, not the server" — worth saying differently. */
export class OfflineError extends Error {
  constructor(message = "Couldn't reach Priority — check your connection.") {
    super(message);
    this.name = 'OfflineError';
    // Extending a builtin breaks the prototype chain once this is downlevelled,
    // which silently turns every `instanceof OfflineError` into false. Restored
    // here, but callers should still prefer `isOfflineError` below.
    Object.setPrototypeOf(this, OfflineError.prototype);
  }
}

/**
 * Identify an offline failure without trusting `instanceof`.
 *
 * The bundler can hand the same logical class to two modules as two different
 * constructors, so a prototype check is not a safe basis for whether the user
 * sees "you are offline". The name is stable across every path.
 */
export function isOfflineError(e: unknown): boolean {
  return (e as { name?: string } | null)?.name === 'OfflineError';
}

export async function api<T = unknown>(
  path: string,
  options: { method?: string; body?: unknown } = {},
  retry = true,
): Promise<T> {
  const token = useAuth.getState().accessToken;
  // Resolved before the try: a missing base URL is a build mistake with its own
  // actionable message, and catching it here would relabel it as "you're
  // offline" — sending someone to check their wifi over an unset env var.
  const url = `${requireBase()}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, {
      method: options.method ?? 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
  } catch (e: any) {
    // An abort here is our own timeout; a TypeError is fetch's way of saying
    // the request never left. Both are "offline" as far as a reader cares.
    if (e?.name === 'AbortError') {
      throw new OfflineError("That took too long — Priority couldn't be reached.");
    }
    throw new OfflineError();
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 401 && retry && (await refreshTokens())) {
    return api<T>(path, options, false);
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    // class-validator returns message as an array — surface it readably.
    const msg = (err as any).message;
    throw new Error(
      Array.isArray(msg) ? msg.join('. ') : msg ?? `Request failed (${res.status})`,
    );
  }
  return res.json() as Promise<T>;
}
