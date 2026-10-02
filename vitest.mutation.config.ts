import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * Vitest config used only by `stryker.mutation.config.mjs`.
 *
 * Stryker runs with `related: false` (the `@/` alias breaks Vitest's
 * `--related` module graph), so every mutant runs the whole configured test
 * set. Narrowing it to the pure domain tests — the ones that kill
 * `src/domain` mutants — keeps each mutant to well under a second.
 */
export default defineConfig({
  resolve: { alias: { '@': path.join(here, 'src') } },
  test: {
    environment: 'node',
    globals: false,
    include: ['src/domain/**/*.test.ts'],
  },
});
