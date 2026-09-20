import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

// Load .env before the handler modules initialise — api/_lib/auth.ts reads
// SUPABASE_JWKS_URL at module scope.
try {
  for (const line of readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n')) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (match?.[1] && process.env[match[1]] === undefined) process.env[match[1]] = match[2];
  }
} catch {
  // No .env — tests will fail loudly on the missing values, which is clearer
  // than silently running against the wrong target.
}

export default defineConfig({
  test: {
    environment: 'node',
    include: ['__tests__/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
