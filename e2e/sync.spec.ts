import { expect, type Page, test } from '@playwright/test';
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

test('a text edit among repeated blocks lands on the right block', async ({ page }) => {
  await newDocument(page);
  let md = '';
  for (let i = 0; i < 5; i++) md += `# A${i}\npara${i}\n\n`;
  for (let i = 0; i < 10; i++) md += 'x\n\n';
  await setText(page, md);
  await expect(visualPane(page).locator('p')).toHaveCount(15);
  // Line 21 is the fourth "x" paragraph.
  await textPane(page).locator('.cm-line').nth(21).click();
  await page.keyboard.press('End');
  await page.keyboard.type('y');
  // Check after the 150 ms update but well before the 2.5 s full-parse
  // reconcile, which would hide a wrongly placed incremental update.
  await page.waitForTimeout(500);
  const texts = await visualPane(page).locator('p').allTextContents();
  expect(texts.filter((t) => /^xy?$/.test(t))).toEqual([
    'x',
    'x',
    'x',
    'xy',
    'x',
    'x',
    'x',
    'x',
    'x',
    'x',
  ]);
});

test('a reference definition typed far from its use links it, and survives a visual edit', async ({
  page,
}) => {
  await newDocument(page);
  let md = 'see [foo] here\n\n';
  for (let i = 0; i < 6; i++) md += `filler ${i}\n\n`;
  md += 'last\n';
  await setText(page, md);
  await expect(visualPane(page).locator('p')).toHaveCount(8);
  await textPane(page).locator('.cm-line').nth(14).click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.insertText('[foo]: http://x.y');
  await expect(visualPane(page).locator('a')).toHaveCount(1);
  await visualPane(page).locator('p').nth(1).click();
  await page.keyboard.press('End');
  await page.keyboard.type('Z');
  await expect.poll(() => textContent(page)).toContain('filler 0Z');
  await page.waitForTimeout(800);
  expect(await textContent(page)).toContain('[foo]: http://x.y');
});

test('visual undo still works next to a block the text pane changed', async ({ page }) => {
  await newDocument(page);
  await setText(page, '# T\n\nfirst para\n\nsecond para\n\nthird para\n');
  const paras = visualPane(page).locator('p');
  await expect(paras).toHaveCount(3);
  await paras.nth(0).click();
  await page.keyboard.press('End');
  await page.keyboard.type('HELLO');
  await expect.poll(() => textContent(page)).toContain('first paraHELLO');
  await textPane(page).locator('.cm-line').nth(4).click();
  await page.keyboard.press('End');
  await page.keyboard.type(' WORLD');
  await expect(paras.nth(1)).toHaveText('second para WORLD');
  await paras.nth(2).click();
  await page.keyboard.press('ControlOrMeta+z');
  await expect(paras.nth(0)).toHaveText('first para');
  await expect.poll(() => textContent(page)).toContain('first para\n');
});

test('Ctrl+Z in the Markdown pane undoes only what was typed there', async ({ page }) => {
  await newDocument(page);
  await setText(page, 'hello world');
  await expect(visualPane(page).locator('p')).toHaveText('hello world');
  await page.waitForTimeout(600); // close the text pane's undo group
  await visualPane(page).locator('p').click();
  await page.keyboard.press('End');
  await page.keyboard.type(' VIS');
  await expect.poll(() => textContent(page)).toContain('hello world VIS');

  await textPane(page).click();
  await page.keyboard.press('ControlOrMeta+Z');
  await page.waitForTimeout(300);
  // The visual edit stays; the text pane's own typing is what gets undone.
  expect(await textContent(page)).toContain('VIS');
});

test('blank lines typed in the visual pane never become <br /> in the Markdown', async ({
  page,
}) => {
  await newDocument(page);
  await setText(page, 'a\n\n- one\n- two\n\nb\n');
  await expect(visualPane(page).locator('li')).toHaveCount(2);
  await visualPane(page).locator('p', { hasText: /^a$/ }).click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.type('X');
  await expect.poll(() => textContent(page)).toContain('X');
  // An empty list item, made by Enter at the end of the last item.
  await visualPane(page).locator('li p', { hasText: 'two' }).click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('three');
  await expect.poll(() => textContent(page)).toContain('three');
  expect(await textContent(page)).not.toContain('<br');
});

test('front matter shows as one metadata block and edits as plain text', async ({ page }) => {
  const source = '---\ntitle: Post\ndate: 2024-01-01\n---\n\n# Title\n\nBody\n';
  await newDocument(page);
  await setText(page, source);
  const visual = visualPane(page);
  const block = visual.locator('pre.front-matter');
  await expect(block).toHaveText('title: Post\ndate: 2024-01-01');
  // Not a rule and a heading any more, and not in the outline.
  await expect(visual.locator('hr')).toHaveCount(0);
  await expect(visual.locator('h1, h2')).toHaveText(['Title']);

  // The cursor at the end of the block (End doesn't move within a <pre> line).
  await block.click();
  await block.locator('code').evaluate((code) => {
    const range = document.createRange();
    range.selectNodeContents(code);
    range.collapse(false);
    getSelection()?.removeAllRanges();
    getSelection()?.addRange(range);
  });
  // ProseMirror adopts the DOM selection on the async `selectionchange`.
  await page.waitForTimeout(50);
  await page.keyboard.press('Enter');
  await page.keyboard.type('tags: [a]');
  await expect
    .poll(() => textContent(page))
    .toBe('---\ntitle: Post\ndate: 2024-01-01\ntags: [a]\n---\n\n# Title\n\nBody\n');
  await expect(visual.locator('pre.front-matter')).toHaveCount(1);
});

test('a visual edit keeps headings, tables and front matter it didn’t touch exactly as written', async ({
  page,
}) => {
  const source =
    '---\ntitle: Post\ndate: 2024-01-01\ntags: [a, b]\n---\n\n# Title\nIntro\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\nEdit me\n\nSetext\n===\n\n## End\nLast para\n';
  await newDocument(page);
  await setText(page, source);
  await expect(visualPane(page).locator('table')).toBeVisible();
  await visualPane(page).locator('p', { hasText: 'Edit me' }).click();
  await page.keyboard.press('End');
  await page.keyboard.type('Z');
  await expect.poll(() => textContent(page)).toContain('Edit meZ');
  expect(await textContent(page)).toBe(source.replace('Edit me', 'Edit meZ'));
});

test('keys pressed before the browser reports a click act where the user clicked', async ({
  page,
}) => {
  await newDocument(page);
  await setText(page, '# Title\n\nAlpha para\n\nDelta para\n');
  const visual = visualPane(page);
  await expect(visual.locator('p')).toHaveCount(2);
  // The Markdown pane has focus, so the click below lets the browser place
  // the cursor, and ProseMirror adopts it on selectionchange. Hold that
  // event back, as a busy main thread does (Chromium runs input first).
  await page.evaluate(() =>
    window.addEventListener('selectionchange', (e) => e.stopImmediatePropagation(), true)
  );
  await visual.locator('p', { hasText: 'Alpha' }).click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Z');
  await expect.poll(() => textContent(page)).toContain('Z');
  expect(await textContent(page)).toBe('# Title\n\nAlpha para\n\nZ\n\nDelta para\n');
});

/** The visual pane's top-level blocks as `TAG:text`, to see where an edit landed. */
const visualBlocks = (page: Page) =>
  visualPane(page).evaluate((pm) =>
    Array.from(pm.children).map((el) => `${el.tagName}:${el.textContent ?? ''}`)
  );

/**
 * Locates a format toolbar button now and returns a press that needs no
 * actionability waits, so it can follow a keystroke within milliseconds.
 */
async function formatButton(page: Page, name: RegExp): Promise<() => Promise<void>> {
  const box = await page
    .getByRole('toolbar', { name: 'Formatting' })
    .getByRole('button', { name })
    .boundingBox();
  if (!box) throw new Error('format button not visible');
  return async () => {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.up();
  };
}

/**
 * Puts `hello world / second / filler…` in both panes, with the visual
 * pane last focused in "second". The filler keeps an edit to the first
 * line small enough for an incremental update.
 */
async function typedAfterVisualFocus(page: Page): Promise<void> {
  await newDocument(page);
  let md = 'hello world\n\nsecond';
  for (let i = 0; i < 8; i++) md += `\n\nfiller paragraph number ${i}`;
  await setText(page, md);
  const visual = visualPane(page);
  await expect(visual.locator('p')).toHaveCount(10);
  await visual.locator('p', { hasText: 'second' }).click();
  await page.waitForTimeout(3000);
}

async function typeXyzOnFirstLine(page: Page): Promise<void> {
  await textPane(page).click();
  await page.keyboard.press('ControlOrMeta+Home');
  await page.keyboard.press('End');
  await page.keyboard.type('XYZ');
}

async function expectRuleAndXyzInBothPanes(page: Page): Promise<void> {
  await expect(visualPane(page).locator('hr')).toHaveCount(1);
  await page.waitForTimeout(600);
  const text = await textContent(page);
  expect(text).toContain('hello worldXYZ');
  expect(text).toMatch(/\n(\*\*\*|---)/);
  expect(await visualBlocks(page)).toEqual(
    expect.arrayContaining(['P:hello worldXYZ', 'P:second', 'HR:'])
  );
}

test('a format button right after a text edit keeps that edit', async ({ page }) => {
  await typedAfterVisualFocus(page);
  const rule = await formatButton(page, /^Horizontal rule/);
  await typeXyzOnFirstLine(page);
  // Before the 150 ms text-to-visual update has run.
  await rule();
  await expectRuleAndXyzInBothPanes(page);
});

test('a format button while a full re-parse is due keeps the text edit', async ({ page }) => {
  await typedAfterVisualFocus(page);
  const rule = await formatButton(page, /^Horizontal rule/);
  await typeXyzOnFirstLine(page);
  // After the incremental update, before the 2.5 s reconcile.
  await page.waitForTimeout(500);
  await rule();
  await expectRuleAndXyzInBothPanes(page);
});

test('a text edit after a list continuation paragraph lands on the right block', async ({
  page,
}) => {
  await newDocument(page);
  await setText(page, 'b\n\nc\n\n- a\n\n  b\n\nc');
  await expect(visualPane(page).locator('li')).toHaveCount(1);
  await page.waitForTimeout(3000);
  await textPane(page).click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type('x');
  // Before the 2.5 s reconcile, which would hide a misplaced update.
  await page.waitForTimeout(400);
  expect(await visualBlocks(page)).toEqual(['P:b', 'P:c', 'UL:ab', 'P:cx']);
});

test('a visual edit leaves an indented code block with a blank line alone', async ({ page }) => {
  await newDocument(page);
  const source = 'intro\n\n    code a\n\n    code b\n\nTitle\n=====\n\n+ plus\n\nmore\n';
  await setText(page, source);
  const visual = visualPane(page);
  await expect(visual.locator('li')).toHaveCount(1);
  await visual.locator('p', { hasText: 'more' }).click();
  await page.keyboard.press('End');
  await page.keyboard.type('Z');
  await expect.poll(() => textContent(page)).toContain('moreZ');
  expect(await textContent(page)).toBe(source.replace('more', 'moreZ'));
});
