import { defineConfig } from 'vitest/config';

// Vitest runs only the pure TypeScript core (mobile/CLAUDE.md): no React Native in Node.
export default defineConfig({
  test: {
    include: ['src/core/**/*.test.ts', 'scripts/**/*.test.mjs'],
    environment: 'node',
  },
});
