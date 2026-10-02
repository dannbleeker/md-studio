#!/usr/bin/env node
/**
 * Perf-trace regression check, modelled on tp-studio's.
 *
 * Reads every perf-trace-output/<scenario>[.<n>].json the perf spec wrote
 * (one per workflow iteration), takes the BEST (lowest) p95 per scenario and
 * compares it with perf-baseline.json. CI noise is one-sided (contention, GC
 * and JIT warm-up only add time), so the fastest iteration is the most
 * honest estimate and one noisy run can't trip the gate.
 *
 * Exit codes: 0 ok · 1 regression · 2 missing or malformed input.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const OUT_DIR = join(ROOT, 'perf-trace-output');
const baseline = JSON.parse(readFileSync(join(ROOT, 'perf-baseline.json'), 'utf8'));
const threshold = baseline.regressionThresholdPct;

let files = [];
try {
  files = readdirSync(OUT_DIR).filter((f) => f.endsWith('.json'));
} catch {
  console.error(`No ${OUT_DIR}; run the perf spec first (PERF_TRACE=1).`);
  process.exit(2);
}

let failed = false;
console.log(`Perf regression check (fails above +${threshold}% of baseline p95)\n`);
for (const [scenario, base] of Object.entries(baseline.scenarios)) {
  const samples = files
    .filter((f) => f === `${scenario}.json` || f.startsWith(`${scenario}.`))
    .map((f) => JSON.parse(readFileSync(join(OUT_DIR, f), 'utf8')).p95_ms)
    .filter((n) => typeof n === 'number');
  if (samples.length === 0) {
    console.error(`✘ ${scenario}: no results in ${OUT_DIR}`);
    process.exit(2);
  }
  const best = Math.min(...samples);
  const limit = base.thresholdPct ?? threshold;
  const delta = ((best - base.p95_ms) / base.p95_ms) * 100;
  const status = delta > limit ? 'FAIL' : delta > limit / 2 ? 'WARN' : 'OK';
  if (status === 'FAIL') failed = true;
  const mark = { OK: '✓', WARN: '~', FAIL: '✘' }[status];
  console.log(
    `${mark} ${scenario.padEnd(16)} best p95 ${best.toFixed(1)} ms vs ${base.p95_ms} ms (${delta >= 0 ? '+' : ''}${delta.toFixed(1)}%)  samples: ${samples.map((n) => n.toFixed(1)).join(', ')}`
  );
}

if (failed) {
  console.log('\nIf the slowdown is intentional, update perf-baseline.json in the same commit.');
  process.exit(1);
}
console.log('\nNo scenario regressed beyond its threshold.');
