import React from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/theme';

const icon = (name: keyof typeof Ionicons.glyphMap, focusedName: keyof typeof Ionicons.glyphMap) =>
  ({ focused, color }: { focused: boolean; color: string }) => (
    <Ionicons name={focused ? focusedName : name} size={22} color={color} />
  );

export default function TabsLayout() {
  return (
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
        tabBarLabelStyle: { fontSize: 10.5, fontWeight: '500', letterSpacing: 0.2 },
        tabBarActiveTintColor: colors.amber,
        tabBarInactiveTintColor: colors.textFaint,
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Today', tabBarIcon: icon('sunny-outline', 'sunny') }} />
      <Tabs.Screen name="time" options={{ title: 'Time', tabBarIcon: icon('hourglass-outline', 'hourglass') }} />
      <Tabs.Screen name="missions" options={{ title: 'Missions', tabBarIcon: icon('flag-outline', 'flag') }} />
      <Tabs.Screen name="people" options={{ title: 'People', tabBarIcon: icon('people-outline', 'people') }} />
      <Tabs.Screen name="journal" options={{ title: 'Journal', tabBarIcon: icon('create-outline', 'create') }} />
      <Tabs.Screen name="review" options={{ title: 'Review', tabBarIcon: icon('telescope-outline', 'telescope') }} />
      {/* Everything the system knows, readable. Generated, never stored. */}
      <Tabs.Screen name="record" options={{ title: 'Record', tabBarIcon: icon('book-outline', 'book') }} />
      <Tabs.Screen name="you" options={{ title: 'You', tabBarIcon: icon('person-circle-outline', 'person-circle') }} />
    </Tabs>
  );
}
