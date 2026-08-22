import { defineConfig } from 'vitest/config';

// ponytail: pure logic tests — node env, no DOM, no setup files
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
