import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

export default mergeConfig(
  viteConfig,
  defineConfig({
    cacheDir: 'node_modules/.cache/vitest',
    test: {
      environment: 'jsdom',
      globals: false,
      include: ['src/**/*.test.{ts,tsx}', 'test/**/*.test.{ts,tsx}'],
      setupFiles: ['./test/setup.ts'],
      // Skipped by `pnpm test:coverage` and by vitest.mutation.config.ts
      // (which defines the same tag); `pnpm test:stress` runs only these, one
      // file at a time: run side by side they compete for the CPU and miss
      // their time ceilings (embedNode took 551 ms against 500 on CI).
      tags: [{ name: 'stress', description: 'Huge inputs that guard against quadratic scans.' }],
      coverage: {
        provider: 'v8',
        include: ['src/**/*.{ts,tsx}'],
        exclude: ['src/**/*.test.{ts,tsx}', 'src/**/*.d.ts', 'src/main.tsx'],
        reporter: ['text-summary', 'html'],
        // So CI's coverage-report artifact exists when a test fails too.
        reportOnFailure: true,
        // A ratchet, not a target: each floor is the level reached when it was
        // set, rounded down, so `pnpm verify` fails when coverage drops. Raise
        // them when coverage grows. `pnpm test:coverage` skips the `stress`
        // tests (`pnpm test:stress` runs them without instrumentation, whose
        // slowdown breaks their time ceilings), so measure with it. It also
        // allows each test 30 s instead of 5: the large parity sweeps take
        // about 4.5 s instrumented on a laptop and longer on CI runners.
        thresholds: {
          lines: 79,
          statements: 78,
          functions: 69,
          branches: 75,
          'src/domain/**': { lines: 99, statements: 97, functions: 100, branches: 91 },
          'src/store/**': { lines: 97, statements: 95, functions: 94, branches: 88 },
        },
      },
    },
  })
);
