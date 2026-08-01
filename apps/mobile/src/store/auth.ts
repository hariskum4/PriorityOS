import { create } from 'zustand';
import { storage } from '../services/storage';
import { clearPersistedCache } from '../services/cache';
import { queryClient } from '../services/queryClient';

/**
 * The user id inside an access token, or null if there isn't one to read.
 *
 * Used to decide whose cache is whose. Nothing security-sensitive rests on
 * this — the server verifies the signature on every request; this only answers
 * "is the data on this device the same person's as the token on this device",
 * and answering "no" on a malformed token is the safe direction.
 */
export function userIdFromToken(token: string | null): string | null {
  if (!token) return null;
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const padded = payload.replace(/-/g, '+').replace(/_/g, '/')
      .padEnd(payload.length + ((4 - (payload.length % 4)) % 4), '=');
    const sub = JSON.parse(
      typeof atob === 'function'
        ? atob(padded)
        : Buffer.from(padded, 'base64').toString('utf8'),
    )?.sub;
    return typeof sub === 'string' && sub ? sub : null;
  } catch {
    return null;
  }
}

interface AuthState {
  accessToken: string | null;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setTokens: (t: { accessToken: string; refreshToken: string }) => Promise<void>;
  logout: () => Promise<void>;
}

/**
 * Empty every copy of the previous account's life.
 *
 * Order matters. The in-memory cache goes first: `startPersisting` is still
 * subscribed and a pending write could otherwise land after the file was
 * removed and put it straight back. Clearing memory first makes any such
 * write a no-op — it skips empty snapshots — and only then is the file gone
 * for good.
 */
async function forgetEverything() {
  queryClient.clear();
  await clearPersistedCache();
}

export const useAuth = create<AuthState>((set) => ({
  accessToken: null,
  hydrated: false,
  hydrate: async () => {
    const accessToken = await storage.getItem('accessToken');
    set({ accessToken, hydrated: true });
  },
  /**
   * Signing in — including registering, which lands here too.
   *
   * The clear is not belt-and-braces on top of `logout`: a session can end
   * without anyone pressing Log out. A refresh token that rotated away, an
   * expired session, a fresh account created on a device someone else used —
   * all of those arrive here with another person's dashboard, relationships
   * and journal sitting in the query cache, and React Query serves cached
   * data before the first refetch resolves. That is what "signed up as a new
   * user and saw the demo account's data" was.
   */
  setTokens: async ({ accessToken, refreshToken }) => {
    await forgetEverything();
    await storage.setItem('accessToken', accessToken);
    await storage.setItem('refreshToken', refreshToken);
    set({ accessToken });
  },
  logout: async () => {
    await storage.deleteItem('accessToken');
    await storage.deleteItem('refreshToken');
    // The offline cache holds a readable copy of this person's life. Signing
    // out has to take it with them, or the next person to open the app on this
    // device reads it.
    await forgetEverything();
    set({ accessToken: null });
  },
}));
