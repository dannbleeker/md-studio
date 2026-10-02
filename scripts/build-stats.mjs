#!/usr/bin/env node
// scripts/build-stats.mjs
// -----------------------------------------------------------------------------
// Writes public/stats.json (a snapshot) and appends to public/stats-history.json
// (one row per day) — lines of code by category, test counts, coverage, eager
// bundle size, book progress and the git story. Same idea as the sibling
// studios' stats pipeline, sized for md-studio. The Stats workflow regenerates
// both files after each push to main; they deploy with the site, so a future
// dashboard page can read them.
//
// Dependency-free: Node built-ins + the `git` CLI. Reads, when present:
//   coverage/coverage-summary.json  (vitest --coverage, json-summary reporter)
//   .tmp/vitest-report.json         (vitest --reporter=json)
//   dist/assets/*.js                (vite build)
// Missing inputs become nulls rather than failing the run.
// -----------------------------------------------------------------------------

import { execSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const ROOT = process.cwd();
const sh = (cmd) => execSync(cmd, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 }).trim();
const readJson = (path) => {
  try {
    return JSON.parse(readFileSync(join(ROOT, path), 'utf8'));
  } catch {
    return null;
  }
};

// --- lines of code by category (tracked files only) ---------------------------
const tracked = sh('git ls-files').split('\n').filter(Boolean);
const countLines = (f) => {
  try {
    const s = readFileSync(join(ROOT, f), 'utf8');
    return s === '' ? 0 : s.split('\n').length - (s.endsWith('\n') ? 1 : 0);
  } catch {
    return 0;
  }
};
const isTs = (f) => /\.(ts|tsx)$/.test(f) && !f.endsWith('.d.ts');
const isTest = (f) => /\.test\.tsx?$/.test(f) || (f.startsWith('test/') && isTs(f));
const CATEGORIES = [
  ['App code', (f) => f.startsWith('src/') && isTs(f) && !isTest(f)],
  ['Unit tests', (f) => isTest(f)],
  ['E2E tests', (f) => f.startsWith('e2e/') && isTs(f)],
  ['Scripts', (f) => f.startsWith('scripts/') && /\.(mjs|cjs|js)$/.test(f)],
  ['Styles', (f) => f.endsWith('.css')],
  ['Book', (f) => f.startsWith('docs/guide/') && f.endsWith('.md')],
];
const code = CATEGORIES.map(([category]) => ({ category, files: 0, lines: 0 }));
for (const f of tracked) {
  const i = CATEGORIES.findIndex(([, match]) => match(f));
  if (i >= 0) {
    code[i].files++;
    code[i].lines += countLines(f);
  }
}

// --- tests + coverage ----------------------------------------------------------
const report = readJson('.tmp/vitest-report.json');
const tests = report
  ? {
      files: report.testResults?.length ?? null,
      total: report.numTotalTests ?? null,
      passed: report.numPassedTests ?? null,
      failed: report.numFailedTests ?? null,
    }
  : null;
const e2eSpecs = tracked.filter((f) => /^e2e\/.*\.spec\.ts$/.test(f)).length;

const cov = readJson('coverage/coverage-summary.json')?.total;
const coverage = cov
  ? {
      lines: cov.lines.pct,
      statements: cov.statements.pct,
      functions: cov.functions.pct,
      branches: cov.branches.pct,
    }
  : null;

// --- bundle (gzip, per chunk family) ------------------------------------------
let bundle = null;
const assets = join(ROOT, 'dist', 'assets');
if (existsSync(assets)) {
  // Start-up = what index.html loads (entry script + modulepreloads); every
  // other chunk (export, find bar, outline…) loads on first use.
  const html = readFileSync(join(ROOT, 'dist', 'index.html'), 'utf8');
  const loaded = new Set([...html.matchAll(/assets\/([^"]+\.js)"/g)].map((m) => m[1]));
  const chunks = {};
  const eager = [];
  let eagerBytes = 0;
  let lazy = 0;
  for (const f of readdirSync(assets).filter((n) => n.endsWith('.js'))) {
    const gz = gzipSync(readFileSync(join(assets, f))).length;
    if (f.startsWith('lang-')) {
      lazy += gz;
      continue;
    }
    const name = f.replace(/-[\w-]{8}\.js$/, '');
    chunks[name] = gz;
    if (loaded.has(f)) {
      eager.push(name);
      eagerBytes += gz;
    }
  }
  bundle = {
    eagerGzipBytes: eagerBytes,
    eager,
    chunks,
    lazyLanguageGzipBytes: lazy,
  };
}

// --- book progress -------------------------------------------------------------
const chapters = tracked.filter((f) => /^docs\/guide\/(\d\d|appendix)-.*\.md$/.test(f));
const outlines = chapters.filter((f) =>
  readFileSync(join(ROOT, f), 'utf8').includes('**Draft outline.**')
);
const book = {
  chapters: chapters.length,
  written: chapters.length - outlines.length,
  words: chapters.reduce(
    (n, f) => n + readFileSync(join(ROOT, f), 'utf8').split(/\s+/).filter(Boolean).length,
    0
  ),
};

// --- git story -------------------------------------------------------------------
const git = (() => {
  try {
    const dates = sh('git log --format=%cs').split('\n').filter(Boolean);
    return {
      commits: dates.length,
      firstCommit: dates.at(-1) ?? null,
      lastCommit: dates[0] ?? null,
      activeDays: new Set(dates).size,
    };
  } catch {
    return null;
  }
})();

const pkg = readJson('package.json');
const today = new Date().toISOString().slice(0, 10);
const stats = {
  generatedAt: today,
  version: pkg?.version ?? null,
  code,
  tests: tests && { ...tests, e2eSpecs },
  coverage,
  bundle,
  book,
  git,
};

// History: one row per day (a later run the same day replaces that day's row).
const historyPath = 'public/stats-history.json';
const history = (readJson(historyPath) ?? []).filter((row) => row.date !== today);
history.push({
  date: today,
  appLines: code[0].lines,
  testLines: code[1].lines,
  tests: tests?.total ?? null,
  coverageLines: coverage?.lines ?? null,
  eagerGzipBytes: bundle?.eagerGzipBytes ?? null,
  bookWords: book.words,
});

writeFileSync(join(ROOT, 'public/stats.json'), `${JSON.stringify(stats, null, 2)}\n`);
writeFileSync(join(ROOT, historyPath), `${JSON.stringify(history, null, 2)}\n`);
console.log(`Wrote public/stats.json and ${historyPath} (${history.length} rows).`);
