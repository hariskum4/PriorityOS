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
import { dehydrate, hydrate } from '@tanstack/react-query';
import type { DehydratedState, QueryClient } from '@tanstack/react-query';

const VERSION = 3;
const KEY = `priority-query-cache-v${VERSION}`;

/** How long a stored response stays usable offline before it is dropped. */
export const MAX_CACHE_AGE = 30 * 24 * 60 * 60 * 1000;

/** Writes are batched: six queries resolving together is one save, not six. */
const WRITE_DELAY_MS = 1_000;

interface Snapshot {
  version: number;
  savedAt: number;
  /**
   * Whose life this is. A snapshot with no owner, or one belonging to somebody
   * else, is dropped rather than restored — the guarantee has to hold even if
   * a sign-out never ran, because the app was force-quit or the process died
   * between accounts.
   */
  ownerId: string | null;
  entries: Array<{ key: unknown[]; data: unknown; updatedAt: number }>;
  /**
   * Writes that were paused mid-flight when the process died — a journal
   * entry composed on a plane, a call logged in a lift. Only the mutation
   * key and its variables are stored; the function to finish the job is
   * looked up from `setMutationDefaults` at hydration. Absent in snapshots
   * written before this field existed, which is fine: their writes were
   * already lost the old way.
   */
  mutations?: DehydratedState['mutations'];
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
export async function restoreCache(
  queryClient: QueryClient,
  ownerId: string | null,
): Promise<number> {
  try {
    const raw = await store.get(KEY);
    if (!raw) return 0;

    const snapshot = JSON.parse(raw) as Snapshot;
    if (snapshot.version !== VERSION || Date.now() - snapshot.savedAt > MAX_CACHE_AGE) {
      await store.remove(KEY);
      return 0;
    }
    /**
     * The ownership check, and the reason this file has a version 2.
     *
     * Restoring by key alone is what let a new account open onto the previous
     * account's life: the snapshot was written under one user and handed to
     * whoever launched the app next. Signed out (`ownerId === null`) nothing
     * is restored at all — there is no screen to fill yet, and the login form
     * has no use for a cache.
     */
    if (!ownerId || snapshot.ownerId !== ownerId) {
      await store.remove(KEY);
      return 0;
    }

    let restored = 0;
    for (const entry of snapshot.entries) {
      if (entry.data === undefined) continue;
      queryClient.setQueryData(entry.key, entry.data, { updatedAt: entry.updatedAt });
      restored++;
    }
    /**
     * Put interrupted writes back in flight. Hydration re-creates each paused
     * mutation from its stored key + variables (the defaults registered in
     * mutationDefaults.ts supply the function), and the resume call retries
     * them — or re-pauses them, if the device is still offline.
     */
    if (snapshot.mutations?.length) {
      hydrate(queryClient, { queries: [], mutations: snapshot.mutations });
      void queryClient.resumePausedMutations().catch(() => {});
    }
    return restored;
  } catch {
    // A corrupt cache is not worth a crash on launch. Drop it and go online.
    await store.remove(KEY).catch(() => {});
    return 0;
  }
}

/**
 * Mirror the cache to disk as it changes. Returns an unsubscribe.
 *
 * `ownerOf` is read at write time rather than passed once, because the same
 * subscription outlives a sign-out: whoever is signed in when the timer fires
 * is who the snapshot belongs to.
 */
export function startPersisting(
  queryClient: QueryClient,
  ownerOf: () => string | null,
): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const write = async () => {
    timer = null;
    try {
      /* Signed out, there is nobody to write a life for. Without this the
         persister happily saved the cache of the account that just left. */
      const ownerId = ownerOf();
      if (!ownerId) return;

      const entries = queryClient.getQueryCache().getAll()
        .filter((q) => q.state.data !== undefined)
        .map((q) => ({
          key: q.queryKey as unknown[],
          data: q.state.data,
          updatedAt: q.state.dataUpdatedAt,
        }));

      // Only paused mutations are worth keeping: a running one either
      // finishes (nothing to save) or fails into the paused state (saved on
      // the next tick of this subscription).
      const mutations = dehydrate(queryClient, {
        shouldDehydrateQuery: () => false,
        shouldDehydrateMutation: (m) => m.state.isPaused,
      }).mutations;

      /**
       * An empty snapshot never replaces a populated one. Open the app with no
       * connection, every query fails, and a naive save writes that emptiness
       * over the last good copy — so the first offline launch destroys the
       * thing that makes the second one work. A paused write is the one
       * exception: saving it is the entire point of persisting at all.
       */
      if (!entries.length && !mutations.length) return;

      const snapshot: Snapshot = {
        version: VERSION, savedAt: Date.now(), ownerId, entries, mutations,
      };
      await store.set(KEY, JSON.stringify(snapshot));
    } catch {
      // A full disk must never take down the app. Losing the cache costs a
      // network round trip, not correctness.
    }
  };

  const schedule = () => {
    if (timer) return;
    timer = setTimeout(write, WRITE_DELAY_MS);
  };
  // Both caches: a write pausing offline is exactly the state change the
  // snapshot exists to capture, and it arrives via the mutation cache.
  const unsubQueries = queryClient.getQueryCache().subscribe(schedule);
  const unsubMutations = queryClient.getMutationCache().subscribe(schedule);
  return () => {
    unsubQueries();
    unsubMutations();
  };
}

/** Called on sign-out: someone else's life must not be sitting in this cache. */
export async function clearPersistedCache() {
  await store.remove(KEY).catch(() => {});
}
