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
  const res = await fetch(`${requireBase()}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });
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

export async function api<T = unknown>(
  path: string,
  options: { method?: string; body?: unknown } = {},
  retry = true,
): Promise<T> {
  const token = useAuth.getState().accessToken;
  const res = await fetch(`${requireBase()}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
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
