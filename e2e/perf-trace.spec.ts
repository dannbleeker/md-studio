import { mkdir, writeFile } from 'node:fs/promises';
import { expect, type Page, test } from '@playwright/test';
import { newDocument, setText, textPane, visualPane } from './helpers';

/**
 * Editor responsiveness on a large document, measured in the production
 * build. Three scenarios, each recording per-sample latency in the page:
 *
 *   typing          keydown in the text pane → the next frame rendered.
 *                   What a writer feels while typing.
 *   text-to-visual  an edit in the text pane → the visual pane showing it.
 *                   Includes the deliberate 150 ms sync debounce.
 *   visual-to-text  an edit in the visual pane → the text pane showing it.
 *                   Includes Milkdown's 200 ms listener debounce.
 *   visual-sync     CPU time of each visual-pane update during the
 *                   text-to-visual run (no debounce, no scheduling noise):
 *                   the steadiest signal for the incremental re-parse.
 *
 * Each writes perf-trace-output/<scenario>[.<iteration>].json; the Perf trace
 * workflow runs the spec several times and scripts/check-perf-regression.mjs
 * compares the best p95 against perf-baseline.json.
 *
 * Skipped unless PERF_TRACE=1, so it never slows the normal e2e run:
 *   PERF_TRACE=1 pnpm exec playwright test e2e/perf-trace.spec.ts
 */

const ENABLED = process.env.PERF_TRACE === '1';
const ITERATION = process.env.PERF_ITERATION;

/** ~3,000 lines: 150 sections with prose, a list, a table and a code block. */
const LARGE_DOC = Array.from(
  { length: 150 },
  (_, i) => `## Section ${i + 1}

${'Plain prose with **bold**, _emphasis_ and a [link](https://example.com). '.repeat(4)}

- first point
- second point

| a | b |
| - | - |
| ${i} | ${i * 2} |

\`\`\`ts
const value${i} = ${i};
\`\`\`
`
).join('\n');

type Summary = {
  scenario: string;
  samples: number;
  p50_ms: number;
  p95_ms: number;
  max_ms: number;
};

function summarize(scenario: string, durations: number[]): Summary {
  const sorted = [...durations].sort((a, b) => a - b);
  const at = (p: number) =>
    sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)] ?? 0;
  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    scenario,
    samples: sorted.length,
    p50_ms: round(at(0.5)),
    p95_ms: round(at(0.95)),
    max_ms: round(sorted.at(-1) ?? 0),
  };
}

async function record(summary: Summary) {
  await mkdir('perf-trace-output', { recursive: true });
  const suffix = ITERATION ? `.${ITERATION}` : '';
  await writeFile(
    `perf-trace-output/${summary.scenario}${suffix}.json`,
    `${JSON.stringify(summary, null, 2)}\n`
  );
  console.log(`perf ${summary.scenario}: ${JSON.stringify(summary)}`);
}

async function loadLargeDocument(page: Page) {
  await page.addInitScript(() => {
    (window as { __MD_STUDIO_PERF__?: boolean }).__MD_STUDIO_PERF__ = true;
  });
  await newDocument(page);
  await setText(page, LARGE_DOC);
  await expect(visualPane(page).locator('h2')).toHaveCount(150, { timeout: 15_000 });
}

/**
 * Inserts a unique token at the end of one pane via execCommand (both
 * CodeMirror and ProseMirror observe it like real typing) and times how long
 * until the other pane shows it. Timed entirely inside the page.
 */
async function timeEdits(page: Page, target: 'text' | 'visual', count: number): Promise<number[]> {
  return page.evaluate(
    async ({ target, count }) => {
      const textEl = document.querySelector<HTMLElement>(
        '[data-testid="text-editor"] .cm-content'
      )!;
      const visualEl = document.querySelector<HTMLElement>(
        '[data-testid="visual-editor"] .ProseMirror'
      )!;
      const [source, sink] = target === 'text' ? [textEl, visualEl] : [visualEl, textEl];
      // CodeMirror only renders lines near its viewport; keep the end of the
      // document (where the edits land) on screen so the text pane can be
      // observed as a sink.
      const textScroller = textEl.closest<HTMLElement>('.cm-scroller')!;
      const durations: number[] = [];
      for (let i = 0; i < count; i++) {
        const token = `zq${target}${i}x`;
        source.focus();
        const sel = getSelection()!;
        sel.selectAllChildren(source);
        sel.collapseToEnd();
        const seen = new Promise<void>((resolve) => {
          const check = () => (sink.textContent ?? '').includes(token);
          const obs = new MutationObserver(() => {
            if (check()) {
              obs.disconnect();
              resolve();
            }
          });
          obs.observe(sink, { childList: true, subtree: true, characterData: true });
        });
        textScroller.scrollTop = textScroller.scrollHeight;
        const t0 = performance.now();
        document.execCommand('insertText', false, ` ${token}`);
        await seen;
        durations.push(performance.now() - t0);
        // Let both debounces settle so samples don't overlap.
        await new Promise((r) => setTimeout(r, 300));
      }
      return durations;
    },
    { target, count }
  );
}

test.describe('perf trace', () => {
  test.skip(!ENABLED, 'Set PERF_TRACE=1 to run the perf scenarios.');
  test.setTimeout(180_000);

  test('typing', async ({ page }) => {
    await loadLargeDocument(page);
    await textPane(page).click();
    await page.keyboard.press('ControlOrMeta+End');
    await page.evaluate(() => {
      const w = window as unknown as { __keyLatency: number[] };
      w.__keyLatency = [];
      window.addEventListener(
        'keydown',
        () => {
          const t0 = performance.now();
          // rAF fires before the next paint; the timeout lands just after it.
          requestAnimationFrame(() =>
            setTimeout(() => w.__keyLatency.push(performance.now() - t0), 0)
          );
        },
        { capture: true }
      );
    });
    for (let i = 0; i < 200; i++) await page.keyboard.press(i % 12 === 11 ? 'Space' : 'KeyA');
    await page.waitForTimeout(300);
    const durations = await page.evaluate(
      () => (window as unknown as { __keyLatency: number[] }).__keyLatency
    );
    expect(durations.length).toBeGreaterThan(150);
    await record(summarize('typing', durations));
  });

  test('text-to-visual', async ({ page }) => {
    await loadLargeDocument(page);
    // Let the load's own full parse and reconcile finish first.
    await page.waitForTimeout(3000);
    await page.evaluate(() => performance.clearMeasures());
    await record(summarize('text-to-visual', await timeEdits(page, 'text', 25)));
    const syncs = await page.evaluate(() =>
      performance
        .getEntriesByType('measure')
        .filter((e) => e.name.startsWith('visual-sync:') && e.name !== 'visual-sync:reconcile')
        .map((e) => e.duration)
    );
    expect(syncs.length).toBeGreaterThan(20);
    await record(summarize('visual-sync', syncs));
  });

  test('visual-to-text', async ({ page }) => {
    await loadLargeDocument(page);
    await record(summarize('visual-to-text', await timeEdits(page, 'visual', 25)));
  });
});
