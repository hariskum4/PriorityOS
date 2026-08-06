import { defineConfig } from 'vitest/config';
import path from 'node:path';

/**
 * A test runner for the parts of this app that are plain TypeScript.
 *
 * There was none, which is how the session-expiry bug shipped: `doRefresh`
 * treated an authoritative 401 from /auth/refresh exactly like being offline,
 * and nothing anywhere could have caught it. Components still need a native
 * runtime and are out of scope here; services, stores and hooks are ordinary
 * modules and are not.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    globals: false,
    /* `api.ts` resolves its base URL once at import time. Set here so the
       module under test can be imported statically — a dynamic import inside
       the test trips TS1323 against Expo's shared `module` setting. */
    env: { EXPO_PUBLIC_API_URL: 'http://api.test' },
  },
  define: {
    /* Expo injects this; a bare Node run has to supply it or module-level
       code that branches on it throws on import. */
    __DEV__: 'false',
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
});
