/**
 * The writes that must survive the app being killed.
 *
 * `networkMode: 'offlineFirst'` pauses a failed write instead of losing it —
 * but a paused mutation lived only in memory, so recording a memory on a
 * plane and then switching apps long enough for the OS to reclaim the process
 * lost the memory anyway. The capture writes are therefore registered here as
 * *defaults*, keyed by name: the snapshot on disk stores only the key and the
 * variables, and on the next launch hydration finds the function to finish
 * the job under that key.
 *
 * Two rules follow from that:
 *  - every variable a mutation needs must be IN its variables object (a
 *    resumed mutation has no component state to read), and
 *  - this module must be imported before the cache is restored, or hydration
 *    finds no defaults and drops the paused writes.
 *
 * This file imports `api` (which imports the auth store, which imports the
 * query client) — so the query client itself must never import this file.
 * The root layout loads it once, for its side effects.
 */
import { queryClient } from './queryClient';
import { api } from './api';
import { invalidateLifeRecord } from './invalidate';

const afterCapture = (extraKeys: string[][]) => () => {
  for (const queryKey of extraKeys) queryClient.invalidateQueries({ queryKey });
  invalidateLifeRecord(queryClient);
};

queryClient.setMutationDefaults(['journal', 'create'], {
  mutationFn: (body: Record<string, unknown>) =>
    api('/journal', { method: 'POST', body }),
  onSuccess: afterCapture([['journal']]),
});

queryClient.setMutationDefaults(['memory', 'create'], {
  mutationFn: (body: Record<string, unknown>) =>
    api('/memories', { method: 'POST', body }),
  onSuccess: afterCapture([['memories']]),
});

queryClient.setMutationDefaults(['contact', 'log'], {
  mutationFn: ({ id, kind, note }: { id: string; kind: string; note?: string }) =>
    api(`/relationships/${id}/contact`, { method: 'POST', body: { kind, note } }),
  onSuccess: afterCapture([['relationships'], ['person']]),
});
