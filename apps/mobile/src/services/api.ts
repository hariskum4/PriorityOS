/**
 * Thin API client with automatic access-token refresh.
 */
import { storage } from './storage';
import { useAuth } from '../store/auth';

const BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

async function refreshTokens(): Promise<boolean> {
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
