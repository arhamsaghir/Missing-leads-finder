import { defineConfig } from 'vitest/config';

// Integration tests hit a real local Supabase (npx supabase start).
// Node env, no DOM. Serial: the suites share seeded tenants and assert on row
// counts, so parallel files would race each other.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
