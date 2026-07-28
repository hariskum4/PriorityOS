import { create } from 'zustand';
import { storage } from '../services/storage';
import { clearPersistedCache } from '../services/cache';

interface AuthState {
  accessToken: string | null;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setTokens: (t: { accessToken: string; refreshToken: string }) => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuth = create<AuthState>((set) => ({
  accessToken: null,
  hydrated: false,
  hydrate: async () => {
    const accessToken = await storage.getItem('accessToken');
    set({ accessToken, hydrated: true });
  },
  setTokens: async ({ accessToken, refreshToken }) => {
    await storage.setItem('accessToken', accessToken);
    await storage.setItem('refreshToken', refreshToken);
    set({ accessToken });
  },
  logout: async () => {
    await storage.deleteItem('accessToken');
    await storage.deleteItem('refreshToken');
    // The offline cache holds a readable copy of this person's life. Signing
    // out has to take it with them, or the next person to open the app on this
    // device reads it.
    await clearPersistedCache();
    set({ accessToken: null });
  },
}));
