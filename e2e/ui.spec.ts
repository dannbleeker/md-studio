import { expect, type Page, test } from '@playwright/test';
import { newDocument, setText, textContent, visualPane } from './helpers';

test('the toolbar fits a 360 px phone without sideways scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await newDocument(page);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await expect(page.getByRole('button', { name: 'Settings' })).toBeInViewport();
});

test('the palette keeps the keyboard selection in view', async ({ page }) => {
  await newDocument(page);
  await setText(page, Array.from({ length: 40 }, (_, i) => `## Heading ${i}\n\ntext`).join('\n\n'));
  await page.keyboard.press('ControlOrMeta+K');
  await page.keyboard.type('#');
  for (let i = 0; i < 30; i++) await page.keyboard.press('ArrowDown');
  const selected = page.locator('#palette-list').getByRole('option', { selected: true });
  await expect(selected).toHaveText(/Heading 30/);
  await expect(selected).toBeInViewport();
});

test('confirm dialogs focus Cancel, and the danger button is readable in dark mode', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await newDocument(page);
  await setText(page, 'unsaved');
  await page.keyboard.press('Alt+W');
  const dialog = page.getByRole('dialog', { name: 'Discard unsaved changes?' });
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
  const [fg, bg] = await dialog.getByRole('button', { name: 'Discard' }).evaluate((el) => {
    const s = getComputedStyle(el);
    return [s.color, s.backgroundColor];
  });
  const lum = (rgb: string) => {
    const [r, g, b] = (rgb.match(/\d+/g) ?? []).slice(0, 3).map((v) => {
      const c = Number(v) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
  };
  const [hi, lo] = [lum(fg), lum(bg)].sort((a, b) => b - a) as [number, number];
  expect((hi + 0.05) / (lo + 0.05)).toBeGreaterThanOrEqual(4.5);
  await dialog.getByRole('button', { name: 'Cancel' }).click();
});

test('a dialog taller than the window keeps its buttons in view', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 560 });
  await newDocument(page);
  await page.keyboard.press('ControlOrMeta+,');
  const done = page.getByRole('dialog', { name: 'Settings' }).getByRole('button', { name: 'Done' });
  await expect(done).toBeInViewport({ ratio: 1 });
  await done.click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('printing shows only the document, none of the app around it', async ({ page }) => {
  await newDocument(page);
  await setText(page, '# Heading\n\nText');
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await page.getByRole('tab').first().click();
  await page.keyboard.press('ControlOrMeta+Shift+O');
  await page.keyboard.press('ControlOrMeta+F');
  await page.emulateMedia({ media: 'print' });
  for (const selector of ['.toolbar', '.tab-bar', '.format-toolbar', '.outline', '.findbar']) {
    await expect(page.locator(selector).first(), selector).toBeHidden();
  }
  await expect(page.getByTestId('visual-editor').locator('h1')).toBeVisible();
});

test('a dialog opened from the palette hands focus back to what opened the palette', async ({
  page,
}) => {
  await newDocument(page);
  const commands = page.getByRole('button', { name: 'Commands' });
  await commands.click();
  await page.keyboard.type('export…');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: /Export/ })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(commands).toBeFocused();
});

test('a dialog with a radio group starts on the checked option, so Space keeps it', async ({
  page,
}) => {
  await newDocument(page);
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Export' });
  const pdf = dialog.getByRole('radio', { name: /^PDF/ });
  await expect(pdf).toBeChecked();
  await expect(pdf).toBeFocused();
  await page.keyboard.press('Space');
  await expect(pdf).toBeChecked();
});

test('the tab bar has no scrollbar of its own with a few tabs open', async ({ page }) => {
  await newDocument(page);
  await setText(page, 'Text');
  await page.getByRole('button', { name: 'New', exact: true }).click();
  const bar = page.locator('.tab-bar');
  await expect(bar).toBeVisible();
  const overflow = await bar.evaluate((el) => ({
    y: el.scrollHeight - el.clientHeight,
    x: el.scrollWidth - el.clientWidth,
  }));
  expect(overflow).toEqual({ y: 0, x: 0 });
});

test('Read view is not editable and links in it open', async ({ page }) => {
  await newDocument(page);
  await setText(page, '[site](https://example.com/x)');
  await page.getByRole('button', { name: 'Read', exact: true }).click();
  const pane = visualPane(page);
  await expect(pane).toHaveAttribute('contenteditable', 'false');
  await expect(page.getByTestId('text-editor')).toBeHidden();
  const popup = page.waitForEvent('popup');
  await pane.getByRole('link', { name: 'site' }).click();
  expect((await popup).url()).toBe('https://example.com/x');
  await page.getByRole('button', { name: 'Visual', exact: true }).click();
  await expect(pane).toHaveAttribute('contenteditable', 'true');
});

test('Read view cannot change the document', async ({ page }) => {
  await newDocument(page);
  const source = '# Title\n\n- [ ] task\n\nSome words';
  await setText(page, source);
  await page.getByRole('button', { name: 'Read', exact: true }).click();
  const pane = visualPane(page);

  // Keys, the task checkbox and the replace bar all leave the Markdown alone.
  await pane.getByText('Some words').click();
  await page.keyboard.press('End');
  await page.keyboard.type('XYZ');
  await pane.locator('li[data-item-type="task"]').click({ position: { x: 5, y: 8 } });
  await page.keyboard.press('ControlOrMeta+H');
  await expect(page.getByRole('search')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Replace all' })).toHaveCount(0);
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'Text', exact: true }).click();
  expect(await textContent(page)).toBe(source);
});

const PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

async function readView(page: Page, markdown: string) {
  await newDocument(page);
  await setText(page, markdown);
  await page.getByRole('button', { name: 'Read', exact: true }).click();
  return visualPane(page);
}

test('Read view offers Edit instead of Save, back to the layout last used', async ({ page }) => {
  await newDocument(page);
  await setText(page, 'Hello');
  await page.getByRole('button', { name: 'Visual', exact: true }).click();
  await page.getByRole('button', { name: 'Read', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Visual', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true'
  );
});

test('a file opens in Read view, and a new document for editing', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try the sample document' }).click();
  await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Read', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeVisible();
});

test('headings fold in Read view, and code blocks get a copy button', async ({ page }) => {
  const pane = await readView(
    page,
    '# A\n\ntext a\n\n## B\n\ntext b\n\n# C\n\ntext c\n\n```\ncode\n```'
  );
  await expect(pane.locator('.read-copy')).toHaveCount(1);
  await pane.locator('.read-fold').first().click();
  await expect(pane.getByText('text a')).toBeHidden();
  await expect(pane.getByText('text b')).toBeHidden();
  await expect(pane.getByText('text c')).toBeVisible();
  await pane.locator('.read-fold').first().click();
  await expect(pane.getByText('text b')).toBeVisible();

  // Folds and copy buttons belong to Read view only.
  await page.getByRole('button', { name: 'Visual', exact: true }).click();
  await expect(pane.locator('.read-fold, .read-copy')).toHaveCount(0);
});

test('an image opens full size in Read view and Escape closes it', async ({ page }) => {
  const pane = await readView(page, `![dot](${PIXEL})`);
  await pane.getByRole('img', { name: 'dot' }).click();
  await expect(page.locator('.lightbox')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.lightbox')).toHaveCount(0);
});

test('a link to another note explains what is needed when no folder is chosen', async ({
  page,
}) => {
  const pane = await readView(page, 'See [[Other note]] and [more](other.md).');
  await pane.getByRole('link', { name: 'more' }).click();
  await expect(page.getByText(/choose the attachments folder first/)).toBeVisible();
  await pane.locator('.md-wikilink').click();
  await expect(page.getByText(/choose the attachments folder first/).first()).toBeVisible();
});

test('Ctrl+Z in Read view undoes nothing', async ({ page }) => {
  await newDocument(page);
  await setText(page, 'Hello');
  await page.getByRole('button', { name: 'Visual', exact: true }).click();
  await visualPane(page).getByText('Hello').click();
  await page.keyboard.press('End');
  await page.keyboard.type('X');
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'Read', exact: true }).click();
  await visualPane(page).getByText('HelloX').click();
  await page.keyboard.press('ControlOrMeta+Z');
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'Text', exact: true }).click();
  expect((await textContent(page)).trim()).toBe('HelloX');
});
