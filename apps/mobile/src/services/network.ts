/**
 * Whether the app can reach anything.
 *
 * React Query assumes a browser and watches `navigator.onLine`, which on a
 * phone is wrong in both directions: React Native has no such property, and a
 * device can hold a full-strength bar of a network that routes nowhere. NetInfo
 * knows the difference between attached and actually reachable, so we tell the
 * query client ourselves.
 *
 * `isInternetReachable` is deliberately preferred over `isConnected` — a hotel
 * wifi captive portal is connected and useless, and treating it as online means
 * every write fails instead of waiting.
 */
import { Platform } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { onlineManager } from '@tanstack/react-query';

let subscribed = false;

export function watchNetwork() {
  if (subscribed) return;
  subscribed = true;

  if (Platform.OS === 'web') {
    onlineManager.setEventListener((setOnline) => {
      const on = () => setOnline(true);
      const off = () => setOnline(false);
      window.addEventListener('online', on);
      window.addEventListener('offline', off);
      setOnline(window.navigator.onLine);
      return () => {
        window.removeEventListener('online', on);
        window.removeEventListener('offline', off);
      };
    });
    return;
  }

  onlineManager.setEventListener((setOnline) => NetInfo.addEventListener((state) => {
    setOnline(state.isInternetReachable ?? state.isConnected ?? false);
  }));
}

export function isOnline(): boolean {
  return onlineManager.isOnline();
}
