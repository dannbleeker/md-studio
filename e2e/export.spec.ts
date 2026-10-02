import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { newDocument, setText } from './helpers';

test.beforeEach(async ({ page }) => {
  // Use the download fallback so the browser's save dialog doesn't block the test.
  await page.addInitScript(() => {
    // biome-ignore lint/suspicious/noExplicitAny: deleting a browser global for the test.
    delete (window as any).showSaveFilePicker;
  });
});

for (const [label, fileName] of [
  ['Web page (HTML)', 'Untitled.html'],
  ['PDF', 'Untitled.pdf'],
  ['Word document (DOCX)', 'Untitled.docx'],
  ['Plain text', 'Untitled.txt'],
] as const) {
  test(`exports ${label}`, async ({ page }) => {
    await newDocument(page);
    await setText(page, '# Report\n\nSome **bold** text.\n\n| a | b |\n| - | - |\n| 1 | 2 |\n');
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Export' });
    await dialog
      .getByRole('radio', { name: new RegExp(`^${label.replace(/[()]/g, '\\$&')}`) })
      .check();
    const download = page.waitForEvent('download');
    await dialog.getByRole('button', { name: 'Export' }).click();
    const file = await download;
    expect(file.suggestedFilename()).toBe(fileName);
    // The plain-text export of this sample is ~40 bytes; binaries are KBs.
    expect((await readFile(await file.path())).length).toBeGreaterThan(30);
  });
}

test('export leaves the document and its save state alone', async ({ page }) => {
  await newDocument(page);
  await setText(page, '# Keep me');
  await expect(page.getByRole('img', { name: 'Unsaved changes' })).toBeVisible();
  await page.keyboard.press('ControlOrMeta+K');
  await page.getByRole('combobox', { name: 'Commands' }).fill('export as plain');
  const download = page.waitForEvent('download');
  await page.keyboard.press('Enter');
  expect((await download).suggestedFilename()).toBe('Untitled.txt');
  // Still unsaved: an export is a copy, not a save.
  await expect(page.getByRole('img', { name: 'Unsaved changes' })).toBeVisible();
  await expect(page.locator('.file-name')).toHaveAttribute('title', 'Untitled.md');
});
