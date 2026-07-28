/**
 * The cache that survives being closed.
 *
 * A record of someone's life is not a feed — most of what this app shows was
 * true yesterday and will still be true tomorrow. Holding the last good
 * response on disk means the app opens to a life rather than to spinners: on a
 * plane, in a lift, or on a mobile network at 7pm.
 *
 * Written directly against the query cache rather than through
 * PersistQueryClientProvider. That provider restored the snapshot correctly
 * here — it logged five queries, the right buster, 86 seconds old — and then
 * never applied it, leaving every screen empty while a perfectly good cache sat
 * on disk. `setQueryData` was verified to populate those same screens
 * instantly, so this uses the primitive that works and carries no extra
 * dependency.
 *
 * Deliberately not SecureStore: that is the keychain, meant for the two tokens,
 * with per-item size limits a serialised cache would blow through. Cached
 * responses are ordinary application data.
 *
 * VERSION is a kill switch. When a response shape changes, bumping it discards
 * every stored entry rather than rehydrating yesterday's shape into today's
 * component and crashing somewhere far from the cause.
 */
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { QueryClient } from '@tanstack/react-query';

const VERSION = 1;
const KEY = `priority-query-cache-v${VERSION}`;

/** How long a stored response stays usable offline before it is dropped. */
export const MAX_CACHE_AGE = 30 * 24 * 60 * 60 * 1000;

/** Writes are batched: six queries resolving together is one save, not six. */
const WRITE_DELAY_MS = 1_000;

interface Snapshot {
  version: number;
  savedAt: number;
  entries: Array<{ key: unknown[]; data: unknown; updatedAt: number }>;
}

/** The web build has localStorage; AsyncStorage there pulls in a shim we don't need. */
const store = {
  get: (k: string): Promise<string | null> => (Platform.OS === 'web'
    ? Promise.resolve(window.localStorage.getItem(k))
    : AsyncStorage.getItem(k)),
  set: (k: string, v: string): Promise<void> => (Platform.OS === 'web'
    ? Promise.resolve(window.localStorage.setItem(k, v))
    : AsyncStorage.setItem(k, v)),
  remove: (k: string): Promise<void> => (Platform.OS === 'web'
    ? Promise.resolve(window.localStorage.removeItem(k))
    : AsyncStorage.removeItem(k)),
};

/**
 * Put the last good responses back before anything renders.
 *
 * `updatedAt` is carried across so restored entries keep their real age:
 * pretending they arrived just now would suppress the refetch that should
 * happen as soon as there is a network again.
 */
export async function restoreCache(queryClient: QueryClient): Promise<number> {
  try {
    const raw = await store.get(KEY);
    if (!raw) return 0;

    const snapshot = JSON.parse(raw) as Snapshot;
    if (snapshot.version !== VERSION || Date.now() - snapshot.savedAt > MAX_CACHE_AGE) {
      await store.remove(KEY);
      return 0;
    }

    let restored = 0;
    for (const entry of snapshot.entries) {
      if (entry.data === undefined) continue;
      queryClient.setQueryData(entry.key, entry.data, { updatedAt: entry.updatedAt });
      restored++;
    }
    return restored;
  } catch {
    // A corrupt cache is not worth a crash on launch. Drop it and go online.
    await store.remove(KEY).catch(() => {});
    return 0;
  }
}

/** Mirror the cache to disk as it changes. Returns an unsubscribe. */
export function startPersisting(queryClient: QueryClient): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const write = async () => {
    timer = null;
    try {
      const entries = queryClient.getQueryCache().getAll()
        .filter((q) => q.state.data !== undefined)
        .map((q) => ({
          key: q.queryKey as unknown[],
          data: q.state.data,
          updatedAt: q.state.dataUpdatedAt,
        }));

      /**
       * An empty snapshot never replaces a populated one. Open the app with no
       * connection, every query fails, and a naive save writes that emptiness
       * over the last good copy — so the first offline launch destroys the
       * thing that makes the second one work.
       */
      if (!entries.length) return;

      const snapshot: Snapshot = { version: VERSION, savedAt: Date.now(), entries };
      await store.set(KEY, JSON.stringify(snapshot));
    } catch {
      // A full disk must never take down the app. Losing the cache costs a
      // network round trip, not correctness.
    }
  };

  return queryClient.getQueryCache().subscribe(() => {
    if (timer) return;
    timer = setTimeout(write, WRITE_DELAY_MS);
  });
}

/** Called on sign-out: someone else's life must not be sitting in this cache. */
export async function clearPersistedCache() {
  await store.remove(KEY).catch(() => {});
}
