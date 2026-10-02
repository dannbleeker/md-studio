import { expect, test } from '@playwright/test';
import { textContent, textPane, visualPane } from './helpers';

test('the sample document opens, renders and is navigable from the palette', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Try the sample document' }).click();
  await expect(visualPane(page).locator('h1')).toHaveText('Welcome to MD Studio');
  await expect(visualPane(page).locator('table')).toBeVisible();
  await expect(visualPane(page).locator('pre')).toBeVisible();
  // Unsaved but not dirty: nothing to lose until the user edits it.
  await expect(page.getByRole('img', { name: 'Unsaved changes' })).toHaveCount(0);
  expect(await textContent(page)).toContain('# Welcome to MD Studio');

  await page.keyboard.press('ControlOrMeta+K');
  await page.keyboard.type('#your files');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(
    visualPane(page).locator('h2', { hasText: 'Your files stay yours' })
  ).toBeInViewport();
  expect(errors).toEqual([]);
});

test('text size, wrapping and line numbers follow the settings', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'New document' }).click();
  await textPane(page).waitFor();
  const gutter = page.getByTestId('text-editor').locator('.cm-gutters');
  await expect(gutter).toBeVisible();
  const fontSize = () =>
    textPane(page).evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize));
  const before = await fontSize();

  await page.keyboard.press('ControlOrMeta+,');
  const dialog = page.getByRole('dialog', { name: 'Settings' });
  await dialog.getByRole('radio', { name: 'Large' }).check();
  await dialog.getByRole('checkbox', { name: /line numbers/ }).uncheck();
  await dialog.getByRole('checkbox', { name: /Wrap long lines/ }).uncheck();
  await dialog.getByRole('button', { name: 'Done' }).click();

  await expect(gutter).toBeHidden();
  expect(await fontSize()).toBeGreaterThan(before);
  await expect(page.getByTestId('text-editor').locator('.cm-lineWrapping')).toHaveCount(0);

  await page.reload();
  await expect(page.getByTestId('text-editor').locator('.cm-gutters')).toBeHidden();
});

test('the user guide and the book are reachable from the start screen, settings and palette', async ({
  page,
}) => {
  await page.goto('/');
  const links = page.getByRole('navigation', { name: 'About MD Studio' });
  await expect(links.getByRole('link', { name: 'Read the book (PDF)' })).toHaveAttribute(
    'href',
    '/Writing-in-Plain-Text.pdf'
  );
  await expect(links.getByRole('link', { name: 'User guide (PDF)' })).toHaveAttribute(
    'href',
    '/User-Guide.pdf'
  );
  await links.getByRole('button', { name: 'User guide' }).click();
  await expect(visualPane(page).locator('h1')).toHaveText('MD Studio quick reference');
  await page.getByRole('button', { name: 'New', exact: true }).click();

  await page.keyboard.press('ControlOrMeta+,');
  const help = page.getByRole('dialog', { name: 'Settings' }).getByRole('navigation');
  await expect(help.getByRole('link', { name: 'Download the book (EPUB)' })).toHaveAttribute(
    'href',
    '/Writing-in-Plain-Text.epub'
  );
  await help.getByRole('button', { name: 'User guide' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  // Already open: the guide's tab is shown again, not a second copy.
  await expect(page.getByRole('tab')).toHaveCount(2);
  await expect(page.getByRole('tab', { name: /User-Guide/ })).toHaveAttribute(
    'aria-selected',
    'true'
  );

  await page.keyboard.press('ControlOrMeta+K');
  await page.keyboard.type('user guide');
  await expect(
    page.getByRole('option', { name: 'Open the user guide', exact: true })
  ).toBeVisible();
  await expect(page.getByRole('option', { name: 'Open the user guide (PDF)' })).toBeVisible();

  for (const file of [
    '/Writing-in-Plain-Text.pdf',
    '/Writing-in-Plain-Text.epub',
    '/User-Guide.pdf',
  ]) {
    const response = await page.request.get(file);
    expect(response.ok()).toBe(true);
  }
});
