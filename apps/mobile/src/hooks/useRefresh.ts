/**
 * Pull down to make the screen tell the truth again.
 *
 * Most tabs read four or five queries at once, so refreshing one of them by
 * hand leaves the rest of the screen a mixture of ages. This refetches
 * everything the screen is currently showing.
 *
 * It matters more here than in most apps: with `networkMode: 'offlineFirst'`
 * and a cache that survives restarts, a screen can sit on stored data
 * indefinitely and look completely normal. Without a gesture to force the
 * question, the only cure for a stale tab was killing the app.
 */
import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

export function useRefresh() {
  const qc = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await qc.refetchQueries({ type: 'active' });
    } finally {
      setRefreshing(false);
    }
  }, [qc]);

  return { refreshing, onRefresh };
}
