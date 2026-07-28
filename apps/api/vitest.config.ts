import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // The integration suite talks to Postgres and truncates between tests, so
    // files must not run concurrently against the same database.
    fileParallelism: false,
    testTimeout: 30_000,
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
  },
});
