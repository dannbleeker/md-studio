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
