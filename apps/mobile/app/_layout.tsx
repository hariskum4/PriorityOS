import React, { useEffect } from 'react';
import { View } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { useAuth, userIdFromToken } from '@/store/auth';
import { api } from '@/services/api';
import { track } from '@/services/analytics';
import { queryClient } from '@/services/queryClient';
import { storage } from '@/services/storage';
import { restoreCache, startPersisting } from '@/services/cache';
import { watchNetwork } from '@/services/network';
// Side effects only: registers the resumable capture writes. Must load before
// restoreCache runs, or hydrated paused mutations find no function to run.
import '@/services/mutationDefaults';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { colors, isLight } from '@/theme';

watchNetwork();

/** Dev-only handle, so cache and offline behaviour can be inspected live. */
declare const __DEV__: boolean;

if (__DEV__) (globalThis as any).__qc = queryClient;

/**
 * Restore before anything renders.
 *
 * Children are held back for one turn while the last good responses go back
 * into the client. Rendering first and hydrating after is what produces the
 * flash of an empty life — and offline, where the refetch never lands, it is
 * not a flash but the whole session.
 */
function CacheGate({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = React.useState(false);

  useEffect(() => {
    let stop: (() => void) | undefined;
    let cancelled = false;
    (async () => {
      /* Whose device this is, read straight off the stored token — the cache
         has to be handed back to the account that wrote it and no other. */
      const owner = userIdFromToken(await storage.getItem('accessToken'));
      await restoreCache(queryClient, owner);
      /* Before the persister, not after: until the store holds the token it
         reports nobody as signed in, and every write in that window is
         dropped. AuthGate calls this too; it is idempotent. */
      await useAuth.getState().hydrate();
      if (cancelled) return;
      /* Read live at each write: the same subscription outlives sign-outs and
         sign-ins, so the owner is whoever holds the token at that moment. */
      stop = startPersisting(
        queryClient,
        () => userIdFromToken(useAuth.getState().accessToken),
      );
      setReady(true);
    })();
    return () => { cancelled = true; stop?.(); };
  }, []);

  if (!ready) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  return <>{children}</>;
}

function AuthGate({ children }: { children: React.ReactNode }) {
  const { accessToken, hydrated, hydrate } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => { hydrate(); }, []);

  useEffect(() => {
    // Daily-active signal — fire-and-forget on every authenticated launch.
    if (accessToken) track('app_opened');
  }, [accessToken]);

  useEffect(() => {
    if (!hydrated) return;
    const inAuth = segments[0] === '(auth)';
    if (!accessToken && !inAuth) router.replace('/(auth)/login');
    if (accessToken && inAuth) {
      // New accounts go through onboarding to the Life Reveal; returning
      // users land on Today.
      api<{ onboardingCompleted: boolean }>('/me')
        .then((me) => router.replace(me.onboardingCompleted ? '/(tabs)' : '/onboarding'))
        .catch(() => router.replace('/(tabs)'));
    }
  }, [accessToken, hydrated, segments]);

  return <>{children}</>;
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary label="app">
      <CacheGate>
      <AuthGate>
        <StatusBar style={isLight ? 'dark' : 'light'} />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.bg },
          }}
        />
      </AuthGate>
      </CacheGate>
      </ErrorBoundary>
    </QueryClientProvider>
  );
}
