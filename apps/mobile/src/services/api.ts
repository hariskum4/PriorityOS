/**
 * Thin API client with automatic access-token refresh.
 */
import { storage } from './storage';
import { useAuth } from '../store/auth';

const BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

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
  const res = await fetch(`${BASE}/auth/refresh`, {
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
  const res = await fetch(`${BASE}${path}`, {
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
