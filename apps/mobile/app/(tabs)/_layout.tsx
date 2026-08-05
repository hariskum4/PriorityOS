import React from 'react';
import { View, useWindowDimensions } from 'react-native';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { OfflineBar } from '@/components/OfflineBar';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useDayRollover } from '@/hooks/useNow';
import { colors } from '@/theme';

const icon = (name: keyof typeof Ionicons.glyphMap, focusedName: keyof typeof Ionicons.glyphMap) =>
  ({ focused, color }: { focused: boolean; color: string }) => (
    <Ionicons name={focused ? focusedName : name} size={22} color={color} />
  );

export default function TabsLayout() {
  /**
   * Eight tabs is more than a narrow phone can label.
   *
   * Below this width the words ran together into "TodayTimeMissionsPeople…"
   * and clipped at the edge. The icons are distinct on their own, so the
   * labels are what gives way — a legible icon row beats an illegible word
   * row, and every destination stays reachable either way.
   */
  const { width } = useWindowDimensions();
  const showLabels = width >= 360;

  /**
   * When the date turns under an open app, refetch.
   *
   * Everything the server sent was answered for the day it was asked on —
   * which missions are today's, which rhythms have been kept, where the
   * streak stands. Past midnight that is not stale by a minute, it is about
   * yesterday, and redrawing it under today's heading is worse than not
   * redrawing it at all. It lives here rather than on a screen because the
   * day belongs to the app, not to whichever tab is in front at the time.
   */
  useDayRollover();

  return (
    // The bar sits above the whole tab stack rather than inside each screen:
    // being offline is a fact about the app, not about Today.
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <OfflineBar />
      <ErrorBoundary label="tabs">
      <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          // The dock sits on the ground, separated by a hairline rather than
          // a raised slab — the sky should feel continuous behind it.
          backgroundColor: colors.bg,
          borderTopColor: colors.lineSoft,
          borderTopWidth: 1,
          height: 60,
          paddingBottom: 7,
          paddingTop: 8,
          elevation: 0,
        },
        tabBarShowLabel: showLabels,
        tabBarLabelStyle: { fontSize: 10.5, fontWeight: '500', letterSpacing: 0.2 },
        tabBarItemStyle: { paddingHorizontal: 0 },
        tabBarActiveTintColor: colors.amber,
        tabBarInactiveTintColor: colors.textFaint,
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Today', tabBarIcon: icon('sunny-outline', 'sunny') }} />
      <Tabs.Screen name="time" options={{ title: 'Time', tabBarIcon: icon('hourglass-outline', 'hourglass') }} />
      <Tabs.Screen name="missions" options={{ title: 'Missions', tabBarIcon: icon('flag-outline', 'flag') }} />
      <Tabs.Screen name="people" options={{ title: 'People', tabBarIcon: icon('people-outline', 'people') }} />
      <Tabs.Screen name="journal" options={{ title: 'Journal', tabBarIcon: icon('create-outline', 'create') }} />
      {/*
        Reachable, but not from the bar.

        Eight destinations is more than a phone can label and more than a
        reader can hold, and two of these pairs were doing one job each:
        Journal and Review are both reflective writing on different clocks,
        and Time and Record are both this life described back to you — once in
        numbers, once in sentences. Each now sits inside its pair, behind a
        permanent entry point rather than a tab of its own.

        `href: null` hides the tab and keeps the route, so every existing link,
        deep link and `router.push` still resolves.
      */}
      <Tabs.Screen name="review" options={{ title: 'Review', href: null }} />
      <Tabs.Screen name="record" options={{ title: 'Record', href: null }} />
      <Tabs.Screen name="you" options={{ title: 'You', tabBarIcon: icon('person-circle-outline', 'person-circle') }} />
      </Tabs>
      </ErrorBoundary>
    </View>
  );
}
