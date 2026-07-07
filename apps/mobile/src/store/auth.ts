import { create } from 'zustand';
import { storage } from '../services/storage';

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
    set({ accessToken: null });
  },
}));
