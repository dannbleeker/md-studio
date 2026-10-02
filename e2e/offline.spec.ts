import { expect, test } from '@playwright/test';
import { visualPane } from './helpers';

// The installed app must work without a network, including its help: the
// user guide (a precached chunk) and the book (precached PDF and EPUB).
test('offline, the app, the user guide and the book are served by the service worker', async ({
  page,
  context,
}) => {
  await page.goto('/');
  // The first visit installs the worker (and its precache); the next load
  // is the first one it controls.
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

  await context.setOffline(true);
  await page.reload();
  // Nothing was opened, so the reload shows the start screen.
  await page
    .getByRole('navigation', { name: 'About MD Studio' })
    .getByRole('button', { name: 'User guide' })
    .click();
  await expect(visualPane(page).locator('h1')).toHaveText('MD Studio quick reference');

  const book = await page.evaluate(async () => {
    const sizes: Record<string, number> = {};
    for (const file of [
      '/Writing-in-Plain-Text.pdf',
      '/Writing-in-Plain-Text.epub',
      '/User-Guide.pdf',
    ]) {
      const response = await fetch(file);
      sizes[file] = response.ok ? (await response.arrayBuffer()).byteLength : -response.status;
    }
    return sizes;
  });
  expect(book['/Writing-in-Plain-Text.pdf']).toBeGreaterThan(10_000);
  expect(book['/Writing-in-Plain-Text.epub']).toBeGreaterThan(10_000);
  expect(book['/User-Guide.pdf']).toBeGreaterThan(10_000);
  await context.setOffline(false);
});
