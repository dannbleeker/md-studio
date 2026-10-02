import { expect, test } from '@playwright/test';
import { newDocument, setText, textContent, textPane, visualPane } from './helpers';

test('text pane edits render in the visual pane', async ({ page }) => {
  await newDocument(page);
  await setText(page, '# Hello\n\nSome **bold** and a list:\n\n- one\n- two\n');

  const visual = visualPane(page);
  await expect(visual.locator('h1')).toHaveText('Hello');
  await expect(visual.locator('strong')).toHaveText('bold');
  await expect(visual.locator('li')).toHaveCount(2);
});

test('visual pane edits flow back into the Markdown source', async ({ page }) => {
  await newDocument(page);
  await setText(page, 'make me bold\n');
  const visual = visualPane(page);
  await expect(visual.locator('p')).toHaveText('make me bold');

  // Select the last word in the visual pane and bold it.
  await visual.locator('p').dblclick({ position: { x: 5, y: 5 } });
  // ProseMirror adopts the DOM selection on the async `selectionchange`
  // event; a keystroke dispatched before that lands on a collapsed cursor.
  await page.waitForFunction(() => getSelection()?.toString() === 'make');
  await page.waitForTimeout(50);
  await page.keyboard.press('ControlOrMeta+B');
  await expect(visual.locator('strong')).toHaveCount(1);
  await expect.poll(() => textContent(page)).toMatch(/\*\*make\*\* me bold/);

  // Typing a new block in the visual pane also syncs.
  await visual.locator('p').click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('## Added');
  await expect.poll(() => textContent(page)).toContain('## Added');
});

test('edits in one pane do not echo back and reformat the other', async ({ page }) => {
  await newDocument(page);
  // `*` bullets and `__` emphasis are styles the visual serializer would
  // normalise; text-pane edits must reach the visual pane without the
  // source being rewritten.
  const source = '* star bullet\n* another\n\n__underscored__ text\n';
  await setText(page, source);
  await expect(visualPane(page).locator('li')).toHaveCount(2);
  await page.waitForTimeout(500);
  expect(await textContent(page)).toBe(source);
});

test('view modes hide and show panes', async ({ page }) => {
  await newDocument(page);
  const textSection = page.locator('[data-pane="text"]');
  const visualSection = page.locator('[data-pane="visual"]');

  await page.getByRole('button', { name: 'Text', exact: true }).click();
  await expect(textSection).toBeVisible();
  await expect(visualSection).toBeHidden();

  await page.getByRole('button', { name: 'Visual', exact: true }).click();
  await expect(textSection).toBeHidden();
  await expect(visualSection).toBeVisible();

  await page.getByRole('button', { name: 'Split', exact: true }).click();
  await expect(textSection).toBeVisible();
  await expect(visualSection).toBeVisible();
});

test('command palette runs commands', async ({ page }) => {
  await newDocument(page);
  await page.keyboard.press('ControlOrMeta+K');
  const input = page.getByRole('combobox');
  await expect(input).toBeFocused();
  await input.fill('text only');
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-pane="visual"]')).toBeHidden();
});

test('linked scroll follows headings, not pixel ratios', async ({ page }) => {
  await newDocument(page);
  const sections = Array.from(
    { length: 30 },
    (_, i) => `## Section ${i + 1}\n\n${'Paragraph text that wraps. '.repeat(12)}\n`
  );
  await setText(page, sections.join('\n'));
  const target = visualPane(page).locator('h2', { hasText: /^Section 20$/ });
  await expect(target).toBeVisible();

  // Scroll the text pane so "Section 20" sits at its top.
  await page.getByTestId('text-editor').hover();
  // CodeMirror only renders lines near the viewport, so step down until the
  // heading's line exists, then align it exactly.
  await page.getByTestId('text-editor').evaluate(async (el) => {
    const scroller = el.querySelector<HTMLElement>('.cm-scroller')!;
    const find = () =>
      Array.from(el.querySelectorAll<HTMLElement>('.cm-line')).find(
        (l) => l.textContent === '## Section 20'
      );
    const frame = () => new Promise((r) => requestAnimationFrame(r));
    scroller.scrollTop = 0;
    await frame();
    while (!find() && scroller.scrollTop + scroller.clientHeight < scroller.scrollHeight) {
      scroller.scrollTop += scroller.clientHeight / 2;
      await frame();
    }
    for (let i = 0; i < 3; i++) {
      scroller.scrollTop +=
        find()!.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
      await frame();
    }
  });

  const scroller = page.getByTestId('visual-editor').locator('..');
  await expect
    .poll(async () => {
      const [headingTop, paneTop] = await Promise.all([
        target.evaluate((el) => el.getBoundingClientRect().top),
        scroller.evaluate((el) => el.getBoundingClientRect().top),
      ]);
      return Math.abs(headingTop - paneTop);
    })
    .toBeLessThan(30);

  // Turning linked scroll off stops the visual pane following.
  await page.getByRole('checkbox', { name: 'Linked scroll' }).uncheck();
  const before = await scroller.evaluate((el) => el.scrollTop);
  await page.getByTestId('text-editor').hover();
  await textPane(page).evaluate((el) => {
    el.closest<HTMLElement>('.cm-scroller')!.scrollTop = 0;
  });
  await page.waitForTimeout(200);
  expect(await scroller.evaluate((el) => el.scrollTop)).toBe(before);
});

test('a visual edit leaves the source style of untouched blocks alone', async ({ page }) => {
  await newDocument(page);
  const source =
    'Title\n=====\n\n* star bullet\n* another\n\n__strong__ and *em*\n\nLast paragraph here.\n';
  await setText(page, source);
  const visual = visualPane(page);
  await expect(visual.locator('li')).toHaveCount(2);

  // Type at the end of the last paragraph in the visual pane.
  await visual.locator('p', { hasText: 'Last paragraph here.' }).click();
  await page.keyboard.press('End');
  await page.keyboard.type(' Edited');

  await expect
    .poll(() => textContent(page))
    .toBe(
      'Title\n=====\n\n* star bullet\n* another\n\n__strong__ and *em*\n\nLast paragraph here. Edited\n'
    );
});
