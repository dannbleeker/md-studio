import { expect, type Page, test } from '@playwright/test';
import { newDocument, setText, textContent, visualPane } from './helpers';

const toolbar = (page: Page) => page.getByRole('toolbar', { name: 'Formatting' });

/** Selects the first occurrence of `word` in the visual pane. */
async function selectWord(page: Page, word: string) {
  await page.evaluate((w) => {
    const root = document.querySelector('[data-testid="visual-editor"] .ProseMirror')!;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const at = n.textContent?.indexOf(w) ?? -1;
      if (at >= 0) {
        (root as HTMLElement).focus();
        const range = document.createRange();
        range.setStart(n, at);
        range.setEnd(n, at + w.length);
        const sel = getSelection()!;
        sel.removeAllRanges();
        sel.addRange(range);
        return;
      }
    }
    throw new Error(`"${w}" not found`);
  }, word);
  // ProseMirror adopts DOM selections on the async selectionchange event.
  await page.waitForTimeout(80);
}

test.beforeEach(async ({ page }) => {
  await newDocument(page);
  await setText(page, 'Make this bold and that italic.\n\nA plain line.\n');
  await expect(visualPane(page).locator('p')).toHaveCount(2);
});

test('inline formats toggle and show as pressed', async ({ page }) => {
  await selectWord(page, 'bold');
  await toolbar(page).getByRole('button', { name: /^Bold/ }).click();
  await expect.poll(() => textContent(page)).toContain('Make this **bold** and');
  await expect(toolbar(page).getByRole('button', { name: /^Bold/ })).toHaveAttribute(
    'aria-pressed',
    'true'
  );

  await selectWord(page, 'italic');
  await toolbar(page)
    .getByRole('button', { name: /^Italic/ })
    .click();
  await toolbar(page).getByRole('button', { name: 'Strikethrough' }).click();
  await expect.poll(() => textContent(page)).toMatch(/~~?\*italic\*~~?|\*~~italic~~\*/);
});

test('block formats: heading, lists, quote', async ({ page }) => {
  await selectWord(page, 'plain');
  await toolbar(page).getByRole('combobox', { name: 'Text style' }).selectOption('2');
  await expect.poll(() => textContent(page)).toContain('## A plain line.');

  await selectWord(page, 'Make');
  await toolbar(page).getByRole('button', { name: 'Bulleted list' }).click();
  await expect.poll(() => textContent(page)).toMatch(/^[-*] Make this/m);
});

test('links via the prompt', async ({ page }) => {
  await selectWord(page, 'that');
  await toolbar(page).getByRole('button', { name: 'Link' }).click();
  const dialog = page.getByRole('dialog', { name: 'Link' });
  await dialog.getByRole('textbox').fill('https://example.com');
  await dialog.getByRole('button', { name: 'Apply' }).click();
  await expect.poll(() => textContent(page)).toContain('[that](https://example.com)');
});

test('inserts a table and a rule', async ({ page }) => {
  await selectWord(page, 'plain');
  await toolbar(page).getByRole('button', { name: 'Insert table' }).click();
  await expect(visualPane(page).locator('table')).toBeVisible();
  await expect.poll(() => textContent(page)).toMatch(/\|.*\|\n\| *:?-+/);
});
