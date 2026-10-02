import { expect, test } from '@playwright/test';
import { newDocument, setText, textContent, visualPane } from './helpers';

test('first visit shows the start screen', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'MD Studio' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open file…' })).toBeVisible();
});

test('the open document survives a reload', async ({ page }) => {
  await newDocument(page);
  await setText(page, '# Keep me\n\nafter reload\n');
  await expect(visualPane(page).locator('h1')).toHaveText('Keep me');
  await page.waitForTimeout(400); // past the persistence debounce
  await page.reload();
  await expect(visualPane(page).locator('h1')).toHaveText('Keep me');
  expect(await textContent(page)).toContain('after reload');
});

test('save falls back to a download without the File System Access API', async ({ page }) => {
  await page.addInitScript(() => {
    // Simulate Firefox/Safari/mobile.
    // biome-ignore lint/suspicious/noExplicitAny: deleting a browser global for the test.
    delete (window as any).showSaveFilePicker;
  });
  await newDocument(page);
  await setText(page, '# Download me\n');
  await expect(page.getByRole('img', { name: 'Unsaved changes' })).toBeVisible();

  const downloadPromise = page.waitForEvent('download');
  await page.keyboard.press('ControlOrMeta+S');
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('Untitled.md');
  await expect(page.getByRole('img', { name: 'Unsaved changes' })).toBeHidden();
  await expect(page.getByText('Downloaded Untitled.md')).toBeVisible();
});

test('opening a dropped file replaces the document and lists it as recent', async ({ page }) => {
  await newDocument(page);
  await page.evaluate(() => {
    const data = new DataTransfer();
    data.items.add(new File(['# Dropped\n\nhello'], 'dropped.md', { type: 'text/markdown' }));
    window.dispatchEvent(new DragEvent('drop', { dataTransfer: data, cancelable: true }));
  });
  await expect(visualPane(page).locator('h1')).toHaveText('Dropped');
  await expect(page.getByText('dropped.md', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'MD Studio' }).click();
  await expect(page.locator('.recent-item', { hasText: 'dropped.md' })).toBeVisible();
});

test('documents open in tabs that keep their own content', async ({ page }) => {
  await newDocument(page);
  await setText(page, 'first doc');
  await expect(page.getByRole('tablist')).toHaveCount(0); // one document: no tab bar

  await page.getByRole('button', { name: 'New', exact: true }).click();
  const tabs = page.getByRole('tablist', { name: 'Open documents' });
  await expect(tabs.getByRole('tab')).toHaveCount(2);
  await expect.poll(() => textContent(page)).toBe('');
  await setText(page, 'second doc');

  await tabs.getByRole('tab').first().click();
  await expect.poll(() => textContent(page)).toBe('first doc');
  await expect(visualPane(page)).toContainText('first doc');

  // Both are unsaved: closing asks, Cancel keeps the tab.
  await tabs.getByRole('button', { name: 'Close Untitled.md' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Discard unsaved changes?' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(tabs.getByRole('tab')).toHaveCount(2);

  await page.waitForTimeout(400); // past the persistence debounce
  await page.reload();
  await expect(tabs.getByRole('tab')).toHaveCount(2);
  await expect.poll(() => textContent(page)).toBe('first doc');

  await page.keyboard.press('Alt+PageDown');
  await expect.poll(() => textContent(page)).toBe('second doc');
  await page.keyboard.press('Alt+W');
  await page.getByRole('button', { name: 'Discard' }).click();
  await expect(page.getByRole('tablist')).toHaveCount(0);
  await expect.poll(() => textContent(page)).toBe('first doc');
});

test('switching tabs returns to the same scroll position; tabs can be dragged', async ({
  page,
}) => {
  await newDocument(page);
  const long = Array.from({ length: 200 }, (_, i) => `## Section ${i}\n\nline ${i}`).join('\n\n');
  await setText(page, `# Long\n\n${long}\n`);
  await expect(visualPane(page).locator('h2').last()).toHaveText('Section 199');
  const textScroller = page.getByTestId('text-editor').locator('.cm-scroller');
  const visualScroller = page.locator('.pane-scroll');
  await textScroller.evaluate((el) => {
    el.scrollTop = 2400;
  });
  await page.waitForTimeout(300); // let linked scroll settle the visual pane
  const saved = {
    text: await textScroller.evaluate((el) => el.scrollTop),
    visual: await visualScroller.evaluate((el) => el.scrollTop),
  };
  expect(saved.text).toBeGreaterThan(1000);

  await page.getByRole('button', { name: 'New', exact: true }).click();
  await setText(page, '# Short\n');
  const tabs = page.getByRole('tablist', { name: 'Open documents' });
  await tabs.getByRole('tab').first().click();
  await expect(visualPane(page).locator('h1')).toHaveText('Long');
  await expect
    .poll(() => textScroller.evaluate((el) => el.scrollTop))
    .toBeGreaterThan(saved.text - 5);
  expect(await textScroller.evaluate((el) => el.scrollTop)).toBeLessThan(saved.text + 5);
  expect(
    Math.abs((await visualScroller.evaluate((el) => el.scrollTop)) - saved.visual)
  ).toBeLessThan(5);

  // Drag the second tab in front of the first.
  const second = tabs.locator('.tab').nth(1);
  await second.dragTo(tabs.locator('.tab').first(), { targetPosition: { x: 4, y: 10 } });
  // Same file names, so each tab shows its first heading.
  await expect(tabs.getByRole('tab').first()).toContainText('Untitled.md · Short');
  await expect(tabs.getByRole('tab').nth(1)).toContainText('Untitled.md · Long');
  await expect(tabs.getByRole('tab').nth(1)).toHaveAttribute('aria-selected', 'true');
});

test('a .md file dropped on the Markdown pane opens in a tab without pasting its text', async ({
  page,
}) => {
  await newDocument(page);
  await setText(page, 'keep me as I am');
  await page
    .getByTestId('text-editor')
    .locator('.cm-content')
    .evaluate((el) => {
      const data = new DataTransfer();
      data.items.add(new File(['# Dropped\n\nfrom disk'], 'dropped.md', { type: 'text/markdown' }));
      const box = el.getBoundingClientRect();
      el.dispatchEvent(
        new DragEvent('drop', {
          dataTransfer: data,
          bubbles: true,
          cancelable: true,
          clientX: box.left + 5,
          clientY: box.top + 5,
        })
      );
    });
  const tabs = page.getByRole('tablist', { name: 'Open documents' });
  await expect(tabs.getByRole('tab')).toHaveCount(2);
  await expect.poll(() => textContent(page)).toBe('# Dropped\n\nfrom disk');
  await tabs.getByRole('tab').first().click();
  await expect.poll(() => textContent(page)).toBe('keep me as I am');
});

test('app shortcuts stay quiet while a dialog is open', async ({ page }) => {
  await newDocument(page);
  await setText(page, 'first');
  await page.getByRole('button', { name: 'New', exact: true }).click();
  const tabs = page.getByRole('tablist', { name: 'Open documents' });
  await expect(tabs.getByRole('tab')).toHaveCount(2);
  await page.keyboard.press('ControlOrMeta+,');
  await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible();
  await page.keyboard.press('Alt+W');
  await page.keyboard.press('Alt+N');
  await page.keyboard.press('Escape');
  await expect(tabs.getByRole('tab')).toHaveCount(2);
});
