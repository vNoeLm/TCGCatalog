import { defineConfig } from 'vitest/config';

// Unit tests for the plain-TypeScript logic in src/lib (no browser, no database).
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
