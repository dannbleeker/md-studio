// Mutation testing of the pure domain layer (src/domain): the document
// model, heading detection, scroll-anchor mapping, minimal text diff and
// fuzzy matching that both editors and linked scroll rely on.
//
// Stryker plants small bugs (mutants) in that code and checks the domain
// tests catch each one. Surviving mutants point at missing assertions even
// where line coverage is high. Used by .github/workflows/mutation.yml
// (weekly) and `pnpm mutation`; writes reports/mutation/mutation.json for
// scripts/mutation-score.mjs and an HTML report for reading survivors.
//
// Config shape follows tp-studio's stryker.mutation.config.mjs.

export default {
  // pnpm's non-hoisted layout hides peer plugins from auto-discovery.
  plugins: ['@stryker-mutator/vitest-runner'],
  mutate: ['src/domain/**/*.ts', '!src/domain/**/*.test.ts', '!src/domain/**/*.d.ts'],
  testRunner: 'vitest',
  // `related: false`: the `@/` alias breaks Vitest's related-file lookup.
  vitest: { configFile: 'vitest.mutation.config.ts', related: false },
  disableTypeChecks: 'src/**/*.{ts,tsx}',
  reporters: ['json', 'html', 'clear-text', 'progress'],
  jsonReporter: { fileName: 'reports/mutation/mutation.json' },
  htmlReporter: { fileName: 'reports/mutation/index.html' },
  tempDirName: 'node_modules/.stryker-tmp',
  ignoreStatic: true,
  checkers: [],
  concurrency: 4,
  // Reported, not gated: the score is a trend to watch, not a CI blocker.
  thresholds: { high: 80, low: 60, break: null },
};
