import React, { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { useAuth } from '@/store/auth';
import { api } from '@/services/api';
import { track } from '@/services/analytics';
import { colors, isLight } from '@/theme';

const queryClient = new QueryClient();

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
      <AuthGate>
        <StatusBar style={isLight ? 'dark' : 'light'} />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.bg },
          }}
        />
      </AuthGate>
    </QueryClientProvider>
  );
}
