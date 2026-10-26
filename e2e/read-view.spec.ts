import { expect, type Page, test } from '@playwright/test';
import { layout, newDocument, setText, visualPane } from './helpers';

async function readView(page: Page, markdown: string) {
  await newDocument(page);
  await setText(page, markdown);
  await page.getByRole('button', { name: 'Read', exact: true }).click();
  return visualPane(page);
}

test('front matter shows as a card in Read view and as YAML elsewhere', async ({ page }) => {
  const pane = await readView(
    page,
    '---\ntitle: My note\ntags: [alpha, beta]\ndate: 2026-10-21\n---\n\nBody text.'
  );
  const card = pane.locator('.read-card');
  await expect(card.locator('.read-card-title')).toHaveText('My note');
  await expect(card.locator('.read-tag')).toHaveText(['#alpha', '#beta']);
  await expect(card.getByText('2026-10-21')).toBeVisible();
  await expect(pane.locator('pre.front-matter')).toBeHidden();
  await layout(page, 'Visual');
  await expect(pane.locator('.read-card')).toHaveCount(0);
  await expect(pane.locator('pre.front-matter')).toBeVisible();
});

test('callouts get a frame, a title and no visible marker', async ({ page }) => {
  const pane = await readView(
    page,
    '> [!warning] Careful now\n> the body\n\n> [!tip]\n> bare marker\n\n> an ordinary quote'
  );
  const callouts = pane.locator('blockquote.callout');
  await expect(callouts).toHaveCount(2);
  await expect(callouts.first()).toContainText('Careful now');
  await expect(callouts.first()).not.toContainText('[!warning]', { useInnerText: true });
  await expect(callouts.nth(1)).not.toContainText('[!tip]', { useInnerText: true });
  await expect(callouts.nth(1)).toHaveAttribute('data-callout-label', 'Tip');
  await expect(pane.locator('blockquote:not(.callout)')).toHaveCount(1);
});

test('a heading offers a link to its section', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const pane = await readView(page, '# Intro\n\ntext\n\n## Part two\n\nmore');
  await pane.getByRole('heading', { name: 'Part two' }).hover();
  await pane.locator('.read-link').nth(1).click();
  await expect(page.getByText('Copied a link to the section')).toBeVisible();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toBe('[Part two](Untitled.md#part-two)');
});

test('a footnote reference shows its text in a card', async ({ page }) => {
  const pane = await readView(page, 'A claim[^1] here.\n\n[^1]: The supporting note.');
  await pane.locator('sup[data-type="footnote_reference"]').hover();
  await expect(page.getByRole('tooltip')).toHaveText('The supporting note.');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('tooltip')).toHaveCount(0);
});

test('the reading controls change the page', async ({ page }) => {
  const pane = await readView(page, '# Title\n\nSome text.');
  const doc = page.locator('.visual-doc');
  const width = async () => (await doc.boundingBox())?.width ?? 0;
  const medium = await width();
  await page.getByRole('button', { name: 'Reading controls' }).click();
  await page.getByRole('radio', { name: 'Narrow' }).check();
  await page.getByRole('radio', { name: 'Serif' }).check();
  await page.getByRole('radio', { name: 'Sepia' }).check();
  await page.getByRole('button', { name: 'Done' }).click();
  expect(await width()).toBeLessThan(medium);
  await expect(page.locator('.split')).toHaveAttribute('data-read-theme', 'sepia');
  await expect(pane).toHaveCSS('font-family', /Georgia/);
});

test('focus mode hides the chrome and Escape brings it back', async ({ page }) => {
  await readView(page, 'Just text.');
  await page.getByRole('button', { name: 'Focus', exact: true }).click();
  await expect(page.locator('.toolbar')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Exit focus' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.toolbar')).toBeVisible();
  // The f key does the same from the page.
  await page.locator('body').click({ position: { x: 5, y: 300 } });
  await page.keyboard.press('f');
  await expect(page.locator('.toolbar')).toBeHidden();
  await page.getByRole('button', { name: 'Exit focus' }).click();
  await expect(page.locator('.toolbar')).toBeVisible();
});

test('reading keys scroll and step between headings', async ({ page }) => {
  const filler = Array.from({ length: 30 }, (_, i) => `paragraph ${i}`).join('\n\n');
  await readView(page, `# One\n\n${filler}\n\n# Two\n\n${filler}\n\n# Three\n\n${filler}`);
  // The pane renders after a short pause: wait for the last heading, or j has nothing to scroll.
  await expect(page.getByRole('heading', { name: 'Three' })).toBeAttached();
  const scroller = page.locator('.pane-visual .pane-scroll');
  const top = () => scroller.evaluate((el) => el.scrollTop);
  await page.locator('body').click({ position: { x: 5, y: 300 } });
  await page.keyboard.press('j');
  await expect.poll(top).toBeGreaterThan(0);
  await page.keyboard.press('g');
  await expect.poll(top).toBe(0);
  await page.keyboard.press(']');
  await expect
    .poll(async () =>
      page
        .getByRole('heading', { name: 'Two' })
        .evaluate((h) =>
          Math.abs(
            h.getBoundingClientRect().top -
              (h.closest('.pane-scroll')?.getBoundingClientRect().top ?? 0)
          )
        )
    )
    .toBeLessThan(40);
  await page.keyboard.press('G');
  await expect.poll(async () => (await top()) > 100).toBe(true);
  // Letters type nowhere in Read view: the source is untouched.
  await layout(page, 'Markdown');
  await expect(page.locator('.cm-content')).not.toContainText('jjj');
});

test('/ opens Find in Read view', async ({ page }) => {
  await readView(page, 'Find me.');
  await page.locator('body').click({ position: { x: 5, y: 300 } });
  await page.keyboard.press('/');
  await expect(page.getByRole('search')).toBeVisible();
  // Typing into the find box is typing, not a reading command.
  await page.keyboard.type('fgj');
  await expect(page.getByRole('searchbox')).toHaveValue('fgj');
  await expect(page.locator('.toolbar')).toBeVisible();
});

test('math is typeset, in every view, and the source is left as written', async ({ page }) => {
  const md = 'Inline $a*b*c$ and $x_1 + y_2$.\n\n$$\n\\int_0^1 f(x)\\,dx\n$$\n\nPrice: $5 and $10.';
  const pane = await readView(page, md);
  await expect(pane.locator('.md-math-ready')).toHaveCount(3);
  await expect(pane.locator('.md-math-display math')).toHaveCount(1);
  // Prices are text, and the formula's own characters never became emphasis.
  await expect(pane.getByText('Price: $5 and $10.')).toBeVisible();
  await expect(pane.locator('em')).toHaveCount(0);
  await layout(page, 'Markdown');
  expect((await page.locator('.cm-content').innerText()).replace(/ /g, ' ')).toContain(
    'Inline $a*b*c$ and $x_1 + y_2$.'
  );
});

test('a mermaid block is drawn as a diagram in Read view only', async ({ page }) => {
  const pane = await readView(page, '```mermaid\ngraph TD\n  A[Start] --> B[End]\n```');
  const diagram = pane.locator('.read-diagram.is-ready img');
  await expect(diagram).toBeVisible({ timeout: 15_000 });
  await expect(pane.locator('pre').first()).toBeHidden();
  expect(await diagram.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(20);
  // A click shows it full size.
  await diagram.click();
  await expect(page.locator('.lightbox')).toBeVisible();
  await page.keyboard.press('Escape');
  await layout(page, 'Visual');
  await expect(pane.locator('.read-diagram')).toHaveCount(0);
  await expect(pane.locator('pre').first()).toBeVisible();
});

test('a diagram that cannot be drawn leaves its source on the page', async ({ page }) => {
  const pane = await readView(page, '```mermaid\nthis is not a diagram (((\n```');
  await expect(pane.locator('.read-diagram.is-error')).toBeVisible({ timeout: 15_000 });
  await expect(pane.locator('pre').first()).toBeVisible();
});

test('jumping to a heading unfolds a fold that hides it', async ({ page }) => {
  const filler = Array.from({ length: 25 }, (_, i) => `line ${i}`).join('\n\n');
  const pane = await readView(
    page,
    `# A\n\n${filler}\n\n## Hidden child\n\nchild text\n\n# B\n\ntail`
  );
  await pane.locator('.read-fold').first().click();
  await expect(pane.getByText('child text')).toBeHidden();
  await page.getByRole('button', { name: 'Outline', exact: true }).click();
  await page
    .getByRole('navigation', { name: 'Outline' })
    .getByRole('button', { name: 'Hidden child' })
    .click();
  await expect(pane.getByText('child text')).toBeVisible();
});

test('? lists the keyboard shortcuts and Escape closes the list', async ({ page }) => {
  await readView(page, 'Just text.');
  await expect(page.getByTestId('visual-editor').getByText('Just text.')).toBeVisible();
  await page.locator('body').click({ position: { x: 5, y: 300 } });
  await page.keyboard.press('?');
  const dialog = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Next heading')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  // The palette lists it too.
  await page.keyboard.press('ControlOrMeta+K');
  await page.getByRole('combobox', { name: 'Commands' }).fill('keyboard shortcuts');
  await page.keyboard.press('Enter');
  await expect(dialog).toBeVisible();
});
