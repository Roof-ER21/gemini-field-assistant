/**
 * Auth tests — the session layer and Susan's outward-action gate.
 * No server, no database: the session module and the tool dispatcher both take
 * their pool by injection, so a stub is enough.
 * Run with: npm run test:auth
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/auth/**/*.test.ts'],
    testTimeout: 5000,
  },
});
