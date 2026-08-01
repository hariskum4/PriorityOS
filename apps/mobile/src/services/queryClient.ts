/**
 * The one query client, as a module rather than a closure in the root layout.
 *
 * It lives here because signing in and signing out have to be able to empty
 * it. When it was created inside `RootLayout`, nothing outside the React tree
 * could reach it — so `logout` cleared the *persisted* copy and left every
 * response from the previous account sitting in memory. The next person to
 * sign in on that device got the previous person's dashboard, relationships
 * and journal served instantly from cache, and one second later the persister
 * wrote all of it back to disk under their session.
 */
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      /**
       * gcTime has to outlive the persisted copy, or restore hands back
       * entries the client immediately discards — but it cannot exceed the
       * 32-bit setTimeout ceiling.
       *
       * Set to 30 days this silently inverted: 2,592,000,000ms overflows
       * setTimeout, which then fires on the next tick, so every restored
       * query was garbage-collected the instant it landed. Restore logged
       * five entries and the screens still came up empty. 24.8 days is the
       * largest timeout the platform can actually hold.
       */
      gcTime: 2_147_483_647,
      staleTime: 60_000,
      /**
       * offlineFirst, not online: serve what we have and fetch behind it.
       * The default pauses the query entirely without a network, which is the
       * blank-screen behaviour this replaces.
       */
      networkMode: 'offlineFirst',
      retry: 2,
      refetchOnReconnect: true,
    },
    mutations: {
      /**
       * A write made offline waits instead of failing. Recording a memory on
       * a plane is exactly when someone most wants to record one, and losing
       * it teaches them not to trust the app with anything.
       */
      networkMode: 'offlineFirst',
      retry: 3,
    },
  },
});
