/**
 * The one honest line about the network.
 *
 * Silence is the wrong default here. If someone writes a memory on a plane and
 * the app says nothing, they cannot tell whether it was saved, and the only way
 * to find out is to close the app and risk losing it. So: say plainly that the
 * connection is gone, say plainly that something is waiting, and then get out
 * of the way — no modal, no retry button, nothing to dismiss.
 *
 * It reports rather than blocks, because everything still works offline. The
 * bar is information, not an error.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { onlineManager, useIsMutating } from '@tanstack/react-query';
import { colors, type, alpha } from '@/theme';

export function OfflineBar() {
  const [online, setOnline] = React.useState(onlineManager.isOnline());
  const pending = useIsMutating();

  React.useEffect(() => onlineManager.subscribe(setOnline), []);

  // A save in flight on a working connection is not news; only say something
  // when the network is the reason a change has not landed.
  if (online) return null;

  return (
    <View style={s.bar}>
      <View style={s.dot} />
      <Text style={s.text}>
        {pending
          ? `Offline — ${pending} ${pending === 1 ? 'change' : 'changes'} will send when you reconnect`
          : 'Offline — showing your last saved record'}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 7,
    paddingHorizontal: 14,
    backgroundColor: alpha(colors.amber, 0.12),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: alpha(colors.amber, 0.3),
  },
  dot: {
    width: 5, height: 5, borderRadius: 3,
    backgroundColor: colors.amber, opacity: 0.9,
  },
  text: { ...type.label, color: colors.amber },
});
