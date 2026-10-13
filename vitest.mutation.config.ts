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
 *
 * Tests tagged `stress` feed hundreds of thousands of repetitions to a scanner
 * to prove it stays linear. They cannot kill a mutant that a normal test
 * misses, and instrumented code runs them so slowly that their time ceilings
 * fail Stryker's dry run (which aborts the whole job) and every mutant would
 * rerun them, so they stay out of this run.
 */
export default defineConfig({
  resolve: { alias: { '@': path.join(here, 'src') } },
  test: {
    environment: 'node',
    globals: false,
    include: ['src/domain/**/*.test.ts'],
    tags: [{ name: 'stress', description: 'Huge inputs that guard against quadratic scans.' }],
    tagsFilter: ['!stress'],
  },
});
