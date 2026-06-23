import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./src/test/setupEnv.ts'],
    // These are integration tests against a real Supabase test project
    // (no DB mocks) — generous timeouts for network latency, and no
    // file-level parallelism so concurrent test files don't hammer
    // Supabase's admin user-creation endpoint at once.
    testTimeout: 20000,
    hookTimeout: 20000,
    fileParallelism: false,
  },
});
