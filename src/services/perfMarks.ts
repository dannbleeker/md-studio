/**
 * Timings for the perf trace (e2e/perf-trace.spec.ts). Recorded only when a
 * test sets `window.__MD_STUDIO_PERF__`: user-timing entries are kept until
 * cleared, so recording them in normal use would grow without bound.
 */
export function perfMeasure(name: string, start: number): void {
  if ((globalThis as { __MD_STUDIO_PERF__?: boolean }).__MD_STUDIO_PERF__) {
    performance.measure(name, { start });
  }
}
