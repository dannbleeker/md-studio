import { expect, test } from '@playwright/test';
import { newDocument, setText, textContent, textPane, visualPane } from './helpers';

const DOC = '# Notes\n\nThe cat sat. A cat ran.\n\n## Cats\n\nCatalog of cats.\n';

test('find in the text pane: counts, steps through, replaces all', async ({ page }) => {
  await newDocument(page);
  await setText(page, DOC);
  await textPane(page).click();
  await page.keyboard.press('ControlOrMeta+F');
  const find = page.getByRole('searchbox', { name: 'Find' });
  await expect(find).toBeFocused();
  await find.fill('cat');
  // "cat", "cat", "Cats", "Catalog", "cats" — case-insensitive by default.
  await find.press('Enter');
  await expect(page.getByRole('status').filter({ hasText: 'of 5' })).toBeVisible();

  await page.getByRole('button', { name: 'Match case' }).click();
  await page.getByRole('button', { name: 'Whole word' }).click();
  await find.press('Enter');
  await expect(page.getByRole('status').filter({ hasText: 'of 2' })).toBeVisible();

  await page.keyboard.press('ControlOrMeta+H');
  await page.getByRole('textbox', { name: 'Replace with' }).fill('dog');
  await page.getByRole('button', { name: 'Replace all' }).click();
  await expect.poll(() => textContent(page)).toContain('The dog sat. A dog ran.');
  // Replacements in the text pane reach the visual pane.
  await expect(visualPane(page).locator('p').first()).toHaveText('The dog sat. A dog ran.');
});

test('find in the visual pane highlights matches and replaces', async ({ page }) => {
  await newDocument(page);
  await setText(page, DOC);
  await page.getByRole('button', { name: 'Visual', exact: true }).click();
  await page.keyboard.press('ControlOrMeta+F');
  await page.getByRole('searchbox', { name: 'Find' }).fill('cat');
  await expect(visualPane(page).locator('.ProseMirror-search-match')).toHaveCount(5);

  await page.getByRole('button', { name: 'Show or hide replace' }).click();
  await page.getByRole('textbox', { name: 'Replace with' }).fill('fox');
  await page.getByRole('button', { name: 'Replace all' }).click();
  await expect(visualPane(page)).toContainText('The fox sat. A fox ran.');
  // …and the Markdown source follows.
  await expect.poll(() => textContent(page)).toContain('The fox sat. A fox ran.');

  await page.keyboard.press('Escape');
  await expect(page.getByRole('searchbox', { name: 'Find' })).toBeHidden();
  await expect(visualPane(page).locator('.ProseMirror-search-match')).toHaveCount(0);
});

test('an invalid regular expression is reported, not thrown', async ({ page }) => {
  await newDocument(page);
  await setText(page, DOC);
  await page.keyboard.press('ControlOrMeta+F');
  await page.getByRole('button', { name: 'Regular expression' }).click();
  await page.getByRole('searchbox', { name: 'Find' }).fill('(unclosed');
  await expect(page.getByText('Invalid pattern')).toBeVisible();
});

test('the outline lists headings and jumps both panes to a section', async ({ page }) => {
  await newDocument(page);
  const doc = Array.from(
    { length: 30 },
    (_, i) => `## Section ${i + 1}\n\n${'Paragraph text that wraps. '.repeat(10)}`
  ).join('\n\n');
  await setText(page, doc);
  await expect(visualPane(page).locator('h2')).toHaveCount(30);
  await page.getByRole('button', { name: 'Outline' }).click();
  const outline = page.getByRole('navigation', { name: 'Outline' });
  await expect(outline.getByRole('button')).toHaveCount(30);

  await outline.getByRole('button', { name: 'Section 20', exact: true }).click();
  await expect(outline.getByRole('button', { name: 'Section 20', exact: true })).toHaveAttribute(
    'aria-current',
    'location'
  );
  // The heading sits near the top of both panes.
  const nearTop = async (heading: ReturnType<typeof page.locator>, pane: string) => {
    const [h, p] = await Promise.all([
      heading.evaluate((el) => el.getBoundingClientRect().top),
      // The scrolling area: the visual pane also has the format toolbar above it.
      page
        .locator(pane === 'visual' ? '[data-pane="visual"] .pane-scroll' : '[data-pane="text"]')
        .evaluate((el) => el.getBoundingClientRect().top),
    ]);
    return h - p;
  };
  await expect
    .poll(() => nearTop(visualPane(page).locator('h2', { hasText: /^Section 20$/ }), 'visual'))
    .toBeLessThan(40);
  await expect
    .poll(() => nearTop(page.locator('.cm-line', { hasText: /^## Section 20$/ }), 'text'))
    .toBeLessThan(40);
});

test('the outline follows the visual pane in visual-only view', async ({ page }) => {
  await newDocument(page);
  const doc = Array.from(
    { length: 30 },
    (_, i) => `## Section ${i + 1}\n\n${'Paragraph text that wraps. '.repeat(10)}`
  ).join('\n\n');
  await setText(page, doc);
  await expect(visualPane(page).locator('h2')).toHaveCount(30);
  await page.getByRole('button', { name: 'Visual', exact: true }).click();
  await page.getByRole('button', { name: 'Outline' }).click();
  const outline = page.getByRole('navigation', { name: 'Outline' });
  await expect(outline.getByRole('button')).toHaveCount(30);

  // Scrolled by hand, not through the outline, so only the scroll listener can mark it.
  await visualPane(page)
    .locator('h2', { hasText: /^Section 20$/ })
    .evaluate((el) => {
      const scroller = el.closest<HTMLElement>('.pane-scroll');
      if (scroller)
        scroller.scrollTop +=
          el.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 2;
    });
  await expect(outline.getByRole('button', { name: 'Section 20', exact: true })).toHaveAttribute(
    'aria-current',
    'location'
  );
});

test('Ctrl+H again from the other pane refocuses and retargets the find bar', async ({ page }) => {
  await newDocument(page);
  await setText(page, '# Title\n\napple pie\n');
  await expect(visualPane(page).locator('p')).toHaveText('apple pie');
  await textPane(page).click();
  await page.keyboard.press('ControlOrMeta+H');
  const search = page.getByRole('searchbox', { name: 'Find' });
  await expect(search).toBeFocused();
  await visualPane(page).locator('p').click();
  await page.keyboard.press('ControlOrMeta+H');
  await expect(search).toBeFocused();
  await page.keyboard.type('apple');
  // The term went into the find bar, not into the document.
  await expect(visualPane(page).locator('p')).toHaveText('apple pie');
});

test('replacing in the visual pane keeps inline code and other marks', async ({ page }) => {
  await newDocument(page);
  await setText(page, 'x `foo` y and **foo** z\n');
  await page.getByRole('button', { name: 'Visual', exact: true }).click();
  await page.keyboard.press('ControlOrMeta+H');
  await page.getByRole('searchbox', { name: 'Find' }).fill('foo');
  await page.getByRole('textbox', { name: 'Replace with' }).fill('bar');
  await page.getByRole('button', { name: 'Replace all' }).click();
  await expect.poll(() => textContent(page)).toContain('x `bar` y and **bar** z');
});
