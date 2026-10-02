import { existsSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';
import { newDocument, setText, visualPane } from './helpers';

/**
 * Visual regression: screenshots of the main surfaces compared against
 * committed baselines in `e2e/visual.spec.ts-snapshots/`.
 *
 * Baselines must come from the CI runner (Linux Chromium and its fonts);
 * screenshots taken on Windows or macOS never match. Refresh them with the
 * "Update visual snapshots" workflow, which opens a PR with the new PNGs.
 * A test without a committed baseline is skipped (not failed), so the suite
 * stays green until that workflow has produced the first baselines.
 */

const SAMPLE = `# Project notes

A **bold** idea, some _emphasis_ and \`inline code\`.

> A quoted thought.

- First point
- Second point

| Column | Value |
| --- | --- |
| Alpha | 1 |

\`\`\`ts
const answer = 42;
\`\`\`
`;

test.use({ viewport: { width: 1280, height: 720 }, serviceWorkers: 'block' });

/** Compares against the baseline, or skips when there is none yet. */
async function matchesBaseline(page: Page, name: string) {
  const refreshing = process.env.REFRESH_VISUAL_SNAPSHOTS === '1';
  test.skip(
    !refreshing && !existsSync(test.info().snapshotPath(name)),
    `No baseline for ${name} yet: run the "Update visual snapshots" workflow.`
  );
  await expect(page).toHaveScreenshot(name);
}

/** Toasts (e.g. "ready to work offline") appear on their own schedule. */
async function hideTransientUi(page: Page) {
  await page.addStyleTag({ content: '.toasts { display: none !important; }' });
}

async function openSample(page: Page) {
  await newDocument(page);
  await setText(page, SAMPLE);
  await expect(visualPane(page).locator('table')).toBeVisible();
  await page.locator('body').click({ position: { x: 5, y: 5 } }); // move focus off the editors
  await hideTransientUi(page);
}

test('start screen', async ({ page }) => {
  await page.goto('/');
  await hideTransientUi(page);
  await matchesBaseline(page, 'start.png');
});

test('editor, split view, light', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await openSample(page);
  await matchesBaseline(page, 'editor-split-light.png');
});

test('editor, split view, dark', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await openSample(page);
  await matchesBaseline(page, 'editor-split-dark.png');
});

test('settings dialog', async ({ page }) => {
  await openSample(page);
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible();
  await matchesBaseline(page, 'settings.png');
});

test('command palette', async ({ page }) => {
  await openSample(page);
  await page.keyboard.press('ControlOrMeta+K');
  await expect(page.getByRole('combobox', { name: 'Commands' })).toBeFocused();
  await matchesBaseline(page, 'command-palette.png');
});
