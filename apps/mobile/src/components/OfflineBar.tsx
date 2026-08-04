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
import { onlineManager, useIsMutating, useQueryClient } from '@tanstack/react-query';
import { isOfflineError, pingServer } from '@/services/api';
import { colors, type, alpha } from '@/theme';

/**
 * Whether the *server* is answering — a different question from whether the
 * device has a network.
 *
 * `onlineManager` reads the browser's own connectivity, so with the machine
 * happily online and the API down, it reported "online" and this bar stayed
 * hidden while every screen rendered stale cache as if it were live. A reader
 * saw their streak, their scores and their missions, and had no way to know
 * none of it had been confirmed. This watches what the app's own requests are
 * actually doing: any request failing with `OfflineError` marks the server
 * unreachable, and any request succeeding clears it.
 */
function useServerReachable(): boolean {
  const qc = useQueryClient();
  const [reachable, setReachable] = React.useState(true);

  React.useEffect(() => {
    const unsubQueries = qc.getQueryCache().subscribe((event) => {
      const state = event?.query?.state;
      if (!state) return;
      if (state.status === 'success') setReachable(true);
      // `fetchFailureReason` is set on the *first* failed attempt, where
      // `status` only turns to 'error' once the retries are exhausted. With
      // two retries and backoff that is seven seconds of a screen showing
      // confident stale numbers before it admits anything is wrong.
      else if (isOfflineError(state.fetchFailureReason) || isOfflineError(state.error)) {
        setReachable(false);
      }
    });
    const unsubMutations = qc.getMutationCache().subscribe((event) => {
      const state = event?.mutation?.state;
      if (!state) return;
      if (state.status === 'success') setReachable(true);
      else if (isOfflineError(state.failureReason) || isOfflineError(state.error)) {
        setReachable(false);
      }
    });
    return () => { unsubQueries(); unsubMutations(); };
  }, [qc]);

  /**
   * Find out when the server comes back.
   *
   * Nothing else will ask. React Query stops once its retries are exhausted,
   * and `refetchOnReconnect` only fires when the *device* regains a network —
   * which never happens if the phone was online all along and it was the API
   * that was down. Without this the bar latches on and keeps telling a reader
   * their data is stale long after it isn't, which is its own kind of lying.
   *
   * A direct ping rather than a refetch: it answers the exact question, needs
   * no auth, and does not depend on which queries happen to be mounted.
   */
  React.useEffect(() => {
    if (reachable) return;
    let cancelled = false;
    const probe = async () => {
      if (await pingServer() && !cancelled) {
        setReachable(true);
        qc.refetchQueries({ type: 'active' }).catch(() => {});
      }
    };
    // Ten seconds, not five: the probe is polling a rate-limited endpoint, and
    // a recovery a few seconds later is not worth being throttled for.
    const id = setInterval(probe, 10_000);
    probe();
    return () => { cancelled = true; clearInterval(id); };
  }, [reachable, qc]);

  return reachable;
}

export function OfflineBar() {
  const [online, setOnline] = React.useState(onlineManager.isOnline());
  const reachable = useServerReachable();
  const pending = useIsMutating();

  React.useEffect(() => onlineManager.subscribe(setOnline), []);

  // A save in flight on a working connection is not news; only say something
  // when the network is the reason a change has not landed.
  if (online && reachable) return null;

  const label = !online
    ? pending
      ? `Offline — ${pending} ${pending === 1 ? 'change' : 'changes'} will send when you reconnect`
      : 'Offline — showing your last saved record'
    : "Can't reach Priority — these numbers are your last saved record";

  return (
    <View style={s.bar}>
      <View style={s.dot} />
      <Text style={s.text}>{label}</Text>
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
