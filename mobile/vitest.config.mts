import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

// Vitest runs only the pure TypeScript core (mobile/CLAUDE.md): no React Native in Node.
// Aliases mirror tsconfig.json "paths".
export default defineConfig({
  resolve: {
    alias: {
      '@content': fileURLToPath(new URL('../content', import.meta.url)),
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    include: ['src/core/**/*.test.ts', 'src/db/**/*.test.ts', 'scripts/**/*.test.mjs'],
    environment: 'node',
  },
});
