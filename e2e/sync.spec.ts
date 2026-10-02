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
  const input = page.getByRole('combobox', { name: 'Commands' });
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
    // Bounded, so a layout problem fails fast instead of hanging the test.
    for (
      let step = 0;
      step < 200 && !find() && scroller.scrollTop + scroller.clientHeight < scroller.scrollHeight;
      step++
    ) {
      scroller.scrollTop += scroller.clientHeight / 2;
      await frame();
    }
    if (!find()) throw new Error('"## Section 20" never rendered in the text pane');
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

test('incremental visual updates match a full re-parse', async ({ page }) => {
  await page.addInitScript(() => {
    (window as { __MD_STUDIO_PERF__?: boolean }).__MD_STUDIO_PERF__ = true;
  });
  await newDocument(page);
  const blocks = Array.from(
    { length: 40 },
    (_, i) =>
      [
        `## Part ${i}`,
        `Text with **bold** and [a link](https://example.com/${i}).`,
        '- tight\n- list',
        '1. loose\n\n2. list',
        '> quote',
        '| a | b |\n| - | - |\n| 1 | 2 |',
        '```js\nlet x = 1;\n\nlet y = 2;\n```',
      ][i % 7]
  );
  await setText(page, blocks.join('\n\n'));
  await expect(visualPane(page).locator('h2')).toHaveCount(6);

  // Edit in several places: inside a paragraph, a list, a code block, and
  // add a new heading — each followed by a pause so the visual pane syncs.
  const edits: Array<[string, string]> = [
    ['Text with **bold** and [a link](https://example.com/8).', 'Text with **BOLD** edit.'],
    ['- tight\n- list', '- tight\n- list\n- more'],
    ['let y = 2;', 'let y = 3;'],
    ['> quote', '> quote\n\n## Inserted'],
  ];
  for (const [from, to] of edits) {
    await page.evaluate(
      ([a, b]) => {
        const el = document.querySelector<HTMLElement>('[data-testid="text-editor"] .cm-content')!;
        // What EditorView.findFromDOM does: CodeMirror tags its content node.
        // biome-ignore lint/suspicious/noExplicitAny: internal CodeMirror field.
        const view = (el as any).cmTile?.root?.view;
        const text: string = view.state.doc.toString();
        const at = text.indexOf(a!);
        view.dispatch({ changes: { from: at, to: at + a!.length, insert: b } });
      },
      [from, to]
    );
    await page.waitForTimeout(400);
  }
  const incremental = await visualPane(page).innerHTML();
  // The edits above took the incremental path (not the full-parse fallback).
  const incrementalSyncs = await page.evaluate(
    () => performance.getEntriesByName('visual-sync:incremental').length
  );
  expect(incrementalSyncs).toBeGreaterThanOrEqual(3);

  // A reload restores the same Markdown and renders it with one full parse.
  await page.waitForTimeout(400);
  await page.reload();
  await expect(visualPane(page).locator('h2')).toHaveCount(7);
  expect(await visualPane(page).innerHTML()).toBe(incremental);
});

test('the hidden visual pane catches up when shown again', async ({ page }) => {
  await newDocument(page);
  await setText(page, '# Before\n');
  await expect(visualPane(page).locator('h1')).toHaveText('Before');
  await page.getByRole('button', { name: 'Text', exact: true }).click();
  await setText(page, '# After\n\nwritten while hidden\n');
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: 'Split', exact: true }).click();
  await expect(visualPane(page).locator('h1')).toHaveText('After');
  await expect(visualPane(page).locator('p')).toHaveText('written while hidden');
});

test('images without a title render, and survive a visual edit', async ({ page }) => {
  await newDocument(page);
  await setText(page, 'Before\n\n![a chart](https://example.com/chart.png)\n\nAfter\n');
  const img = visualPane(page).locator('img:not(.ProseMirror-separator)');
  await expect(img).toHaveAttribute('alt', 'a chart');

  // An edit elsewhere in the visual pane must not drop the image from the source.
  await visualPane(page).locator('p', { hasText: 'After' }).click();
  await page.keyboard.press('End');
  await page.keyboard.type(' edited');
  await expect.poll(() => textContent(page)).toContain('After edited');
  expect(await textContent(page)).toContain('![a chart](https://example.com/chart.png)');
});

test('a text edit right after a visual edit is not reverted', async ({ page }) => {
  await newDocument(page);
  await setText(page, '# Alpha\n\nalpha text\n\nsecond para\n');
  const para = visualPane(page).locator('p').first();
  await expect(para).toHaveText('alpha text');
  await para.click();
  await page.keyboard.press('End');
  await page.keyboard.type('X');
  // Straight into the text pane, inside the visual pane's 200 ms window.
  await textPane(page).locator('.cm-line').nth(4).click();
  await page.keyboard.press('End');
  await page.keyboard.type('Y');
  await expect
    .poll(() => textContent(page), { timeout: 5000 })
    .toBe('# Alpha\n\nalpha textX\n\nsecond paraY\n');
  await page.waitForTimeout(800);
  expect(await textContent(page)).toBe('# Alpha\n\nalpha textX\n\nsecond paraY\n');
  await expect(visualPane(page).locator('p').nth(1)).toHaveText('second paraY');
});

test('switching tabs right after a visual edit keeps the edit in its own tab', async ({ page }) => {
  await newDocument(page);
  await setText(page, '# Alpha\n\nalpha text\n');
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await setText(page, '# Beta\n\nbeta text\n');
  const tabs = page.getByRole('tablist', { name: 'Open documents' });
  await tabs.getByRole('tab').first().click();
  const para = visualPane(page).locator('p').first();
  await expect(para).toHaveText('alpha text');
  await para.click();
  await page.keyboard.press('End');
  await page.keyboard.type('X');
  await page.keyboard.press('Alt+PageDown');
  await expect(visualPane(page).locator('h1')).toHaveText('Beta');
  await page.waitForTimeout(800);
  expect(await textContent(page)).toBe('# Beta\n\nbeta text\n');
  await tabs.getByRole('tab').first().click();
  await expect.poll(() => textContent(page)).toBe('# Alpha\n\nalpha textX\n');
});
