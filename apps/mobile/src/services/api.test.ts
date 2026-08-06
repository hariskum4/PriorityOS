/**
 * What happens when the server says the session is over.
 *
 * The bug these exist for: `doRefresh` returned false both when it could not
 * reach the server and when the server explicitly rejected the refresh token.
 * The second left the tokens sitting in storage, so `AuthGate` saw a non-null
 * `accessToken` and never routed to the login screen, while every query under
 * it failed. What a reader saw was "Nothing here yet. Once you have answered a
 * few things about your life, today will have something to ask for" — an app
 * telling somebody with a year of journal entries that it had never met them.
 *
 * The distinction under test is between an answer and no answer. A 401 is the
 * server saying the session is over. A 500 or a dead socket is not, and must
 * never cost anybody their session.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { api } from './api';

const logout = vi.fn(async () => {});
const setTokens = vi.fn(async () => {});
let accessToken: string | null = 'expired-access-token';
const stored: Record<string, string | null> = { refreshToken: 'a-refresh-token' };

vi.mock('../store/auth', () => ({
  useAuth: { getState: () => ({ accessToken, logout, setTokens }) },
}));
vi.mock('./storage', () => ({
  storage: {
    getItem: async (k: string) => stored[k] ?? null,
    setItem: async (k: string, v: string) => { stored[k] = v; },
    deleteItem: async (k: string) => { stored[k] = null; },
  },
}));

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** A fetch that answers each call from a queue, and records what it was asked. */
function scriptedFetch(steps: Array<(url: string) => Response>) {
  const calls: string[] = [];
  const fn = vi.fn(async (url: string) => {
    calls.push(url);
    const step = steps.shift();
    if (!step) throw new Error(`unexpected extra request to ${url}`);
    return step(url);
  });
  return { fn, calls };
}

beforeEach(() => {
  logout.mockClear();
  setTokens.mockClear();
  accessToken = 'expired-access-token';
  stored.refreshToken = 'a-refresh-token';
});

afterEach(() => { vi.unstubAllGlobals(); });

describe('a session the server has ended', () => {
  it('signs the reader out when the refresh token is rejected', async () => {
    const { fn } = scriptedFetch([
      () => json({ message: 'Unauthorized' }, 401),   // the original request
      () => json({ message: 'Unauthorized' }, 401),   // /auth/refresh says no
    ]);
    vi.stubGlobal('fetch', fn);

    await expect(api('/dashboard')).rejects.toThrow();
    /* The whole point: the tokens must not survive this, or the app renders a
       populated account as an empty one. */
    expect(logout).toHaveBeenCalledTimes(1);
  });

  it('signs the reader out on a 403 too', async () => {
    const { fn } = scriptedFetch([
      () => json({}, 401),
      () => json({ message: 'Forbidden' }, 403),
    ]);
    vi.stubGlobal('fetch', fn);

    await expect(api('/dashboard')).rejects.toThrow();
    expect(logout).toHaveBeenCalledTimes(1);
  });
});

describe('a session the server has not ended', () => {
  it('keeps the reader signed in when the refresh endpoint is broken', async () => {
    /* A 500 is the server having a bad day. Losing a session over it would
       turn a five-minute outage into every user signing back in. */
    const { fn } = scriptedFetch([
      () => json({}, 401),
      () => json({ message: 'boom' }, 500),
    ]);
    vi.stubGlobal('fetch', fn);

    await expect(api('/dashboard')).rejects.toThrow();
    expect(logout).not.toHaveBeenCalled();
    expect(stored.refreshToken).toBe('a-refresh-token');
  });

  it('keeps the reader signed in when the refresh request never leaves', async () => {
    const fn = vi.fn(async (url: string) => {
      if (url.endsWith('/auth/refresh')) throw new TypeError('Failed to fetch');
      return json({}, 401);
    });
    vi.stubGlobal('fetch', fn as never);

    await expect(api('/dashboard')).rejects.toThrow();
    expect(logout).not.toHaveBeenCalled();
    expect(stored.refreshToken).toBe('a-refresh-token');
  });

  it('retries the original request once the refresh succeeds', async () => {
    const { fn, calls } = scriptedFetch([
      () => json({}, 401),
      () => json({ accessToken: 'fresh', refreshToken: 'rotated' }),
      () => json({ ok: true }),
    ]);
    vi.stubGlobal('fetch', fn);

    await expect(api('/dashboard')).resolves.toEqual({ ok: true });
    expect(setTokens).toHaveBeenCalledWith({ accessToken: 'fresh', refreshToken: 'rotated' });
    expect(logout).not.toHaveBeenCalled();
    expect(calls).toEqual([
      'http://api.test/dashboard',
      'http://api.test/auth/refresh',
      'http://api.test/dashboard',
    ]);
  });

  it('does not refresh twice when two screens 401 at once', async () => {
    /* One refresh at a time is what stops the first rotating the token out
       from under the other four. */
    let refreshes = 0;
    const fn = vi.fn(async (url: string) => {
      if (url.endsWith('/auth/refresh')) {
        refreshes += 1;
        return json({ accessToken: 'fresh', refreshToken: 'rotated' });
      }
      return refreshes === 0 ? json({}, 401) : json({ ok: true });
    });
    vi.stubGlobal('fetch', fn as never);

    await Promise.all([api('/dashboard'), api('/missions'), api('/habits')]);
    expect(refreshes).toBe(1);
  });
});
