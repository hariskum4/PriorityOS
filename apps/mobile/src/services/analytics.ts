import { api } from './api';

/** Fire-and-forget client funnel events. Never blocks or throws into the UI. */
export function track(name: string, props?: Record<string, unknown>) {
  api('/analytics/event', { method: 'POST', body: { name, props } }).catch(() => {});
}
