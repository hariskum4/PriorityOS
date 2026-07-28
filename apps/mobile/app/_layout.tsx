import React, { useEffect } from 'react';
import { View } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { useAuth } from '@/store/auth';
import { api } from '@/services/api';
import { track } from '@/services/analytics';
import { restoreCache, startPersisting } from '@/services/cache';
import { watchNetwork } from '@/services/network';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { colors, isLight } from '@/theme';

watchNetwork();

/** Dev-only handle, so cache and offline behaviour can be inspected live. */
declare const __DEV__: boolean;

const queryClient = new QueryClient({
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
    restoreCache(queryClient).finally(() => {
      stop = startPersisting(queryClient);
      setReady(true);
    });
    return () => stop?.();
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
