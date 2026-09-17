/**
 * MCP endpoint tests — server/mcp/* over a real Express server with the real
 * session middleware on a stub pool and fake route handlers. No database, no
 * Gemini. Run with: npm run test:mcp
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/mcp/**/*.test.ts'],
    testTimeout: 10000,
  },
});
