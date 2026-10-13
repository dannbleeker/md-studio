import { expect, type Page, test } from '@playwright/test';
import { newDocument, setText, textContent, textPane, visualPane } from './helpers';

/*
 * Obsidian embeds without any folder access: a new, unsaved document. What
 * this covers is the part that must never lose text: the syntax survives
 * edits made in the visual pane, code is never read as an embed, and the
 * notice about missing attachments appears only when it should. Resolving
 * files from a vault is in embeds-vault.spec.ts.
 */

const SAMPLE = [
  'Intro text ![[a.png|300]] and more.',
  '',
  '| Name | Picture |',
  '| --- | --- |',
  '| row | ![[b.png\\|200]] |',
  '',
  '```',
  '![[in-fence.png]]',
  '```',
  '',
  'Inline `![[in-code.png]]` stays code.',
  '',
].join('\n');

const banner = (page: Page) => page.locator('.attachment-banner');
const hosts = (page: Page) => visualPane(page).locator('.md-embed-host');

test('only the real embeds become chips in the visual pane, and the table pipe survives', async ({
  page,
}) => {
  await newDocument(page);
  await setText(page, SAMPLE);
  await expect(hosts(page)).toHaveCount(2);
  // Without a vault they are labelled placeholders that keep the source token.
  await expect(hosts(page).first().locator('.md-embed-raw')).toHaveText('![[a.png|300]]');
  await expect(hosts(page).nth(1).locator('.md-embed-raw')).toHaveText('![[b.png\\|200]]');
  await expect(visualPane(page).locator('td .md-embed-host')).toHaveCount(1);
  // The fence and the code span are still code.
  await expect(visualPane(page).locator('pre')).toContainText('![[in-fence.png]]');
  await expect(visualPane(page).locator('p > code')).toHaveText('![[in-code.png]]');
});

test('editing next to an embed in the visual pane leaves the token byte for byte', async ({
  page,
}) => {
  await newDocument(page);
  await setText(page, SAMPLE);
  await expect(hosts(page)).toHaveCount(2);

  const paragraph = visualPane(page).locator('p').first();
  // Put the caret after "more." by selection, which is steadier than a click next to a chip.
  await paragraph.click();
  await paragraph.evaluate((p) => {
    const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
    let last: Text | null = null;
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (n.textContent?.includes('and more.')) last = n as Text;
    }
    const range = document.createRange();
    range.setStart(last!, last!.length);
    range.collapse(true);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
  });
  await page.keyboard.type(' Edited');
  await expect.poll(() => textContent(page)).toContain('and more. Edited');

  const text = await textContent(page);
  expect(text).toContain('Intro text ![[a.png|300]] and more. Edited');
  expect(text).toContain('| row | ![[b.png\\|200]] |');
  expect(text).toContain('```\n![[in-fence.png]]\n```');
  expect(text).toContain('`![[in-code.png]]`');
  // The old defect: brackets written back with backslashes.
  expect(text).not.toContain('\\[\\[');
  expect(text).not.toContain('!\\[');
});

test('editing inside the table cell with the escaped pipe keeps the table intact', async ({
  page,
}) => {
  await newDocument(page);
  await setText(page, SAMPLE);
  await expect(hosts(page)).toHaveCount(2);

  await visualPane(page).locator('td', { hasText: 'row' }).click();
  await page.keyboard.type('X');
  await expect.poll(() => textContent(page)).toMatch(/\| [^|\n]*row[^|\n]* \|/);
  const text = await textContent(page);
  expect(text).toContain('![[b.png\\|200]]');
  expect(text).not.toContain('\\[\\[');
});

test('pasting an image keeps the data-URL embed when there is no folder', async ({ page }) => {
  await newDocument(page);
  await setText(page, 'Before\n\n');
  await textPane(page).click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 40;
    canvas.height = 20;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#3d5170';
    ctx.fillRect(0, 0, 40, 20);
    const blob = await new Promise<Blob>((r) => canvas.toBlob((b) => r(b!), 'image/png'));
    const data = new DataTransfer();
    data.items.add(new File([blob], 'diagram.png', { type: 'image/png' }));
    document
      .querySelector('[data-testid="text-editor"] .cm-content')!
      .dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true })
      );
  });
  await expect.poll(() => textContent(page)).toMatch(/!\[diagram\]\(data:image\/png;base64,/);
  expect(await textContent(page)).not.toContain('![[');
  await expect(visualPane(page).locator('img:not(.ProseMirror-separator)')).toHaveAttribute(
    'src',
    /^data:image\/png/
  );
});

test('a document with embeds and no file shows the notice, and dismissing hides it', async ({
  page,
}) => {
  await newDocument(page);
  await setText(page, 'An embed: ![[a.png]]\n');
  await expect(banner(page)).toBeVisible();
  await expect(banner(page)).toContainText('Save this document to disk to show its attachments.');
  await banner(page).getByRole('button', { name: 'Dismiss this notice' }).click();
  await expect(banner(page)).toHaveCount(0);
});

test('an embed that only appears inside a fence raises no notice', async ({ page }) => {
  await newDocument(page);
  await setText(page, 'Syntax:\n\n```\n![[a.png]]\n```\n\nand `![[b.png]]` inline.\n');
  await expect(visualPane(page).locator('pre')).toContainText('![[a.png]]');
  // Past the banner's counting delay, so "nothing yet" cannot pass by being early.
  await page.waitForTimeout(1000);
  await expect(banner(page)).toHaveCount(0);
  // The same check does raise it for a real embed.
  await setText(page, 'Syntax:\n\n```\n![[a.png]]\n```\n\nand ![[c.png]] for real.\n');
  await expect(banner(page)).toBeVisible();
});
