import { expect, type Page, test } from '@playwright/test';
import { textContent, textPane, visualPane } from './helpers';

/*
 * Obsidian embeds resolved from a real folder. The vaults live in the
 * browser's origin private file system (OPFS), which gives real
 * FileSystemDirectoryHandles that need no picker; window.showOpenFilePicker
 * and window.showDirectoryPicker are replaced with stubs that hand them out,
 * so the app takes its normal File System Access paths.
 *
 * Not covered here, on purpose:
 * - The permission prompt (needs-permission): OPFS handles are always
 *   granted. Unit tests drive that state with a fake vault.
 * - Whether Chromium's PDF viewer renders inside the page's CSP. Headless
 *   Chromium has no viewer, so this only asserts that the iframe and the
 *   Open link exist.
 */

type VaultWindow = Window & {
  __open: FileSystemFileHandle[];
  __dirs: FileSystemDirectoryHandle[];
  __vaults: Record<string, FileSystemDirectoryHandle>;
};

/** Builds `name` in OPFS with a small set of files. `sizes` are the PNG sizes by path. */
async function buildVault(
  page: Page,
  name: string,
  files: Record<string, string>,
  pngs: Record<string, [number, number]>
) {
  await page.evaluate(
    async ([vaultName, texts, images]) => {
      const w = window as unknown as VaultWindow;
      w.__open ??= [];
      w.__dirs ??= [];
      w.__vaults ??= {};
      const opfs = await navigator.storage.getDirectory();
      await opfs.removeEntry(vaultName, { recursive: true }).catch(() => {});
      const root = await opfs.getDirectoryHandle(vaultName, { create: true });
      const put = async (path: string, data: Blob | string) => {
        const parts = path.split('/');
        const file = parts.pop()!;
        let dir = root;
        for (const part of parts) dir = await dir.getDirectoryHandle(part, { create: true });
        const writable = await (await dir.getFileHandle(file, { create: true })).createWritable();
        await writable.write(data);
        await writable.close();
      };
      for (const [path, text] of Object.entries(texts)) await put(path, text);
      for (const [path, [width, height]] of Object.entries(images)) {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#3d5170';
        ctx.fillRect(0, 0, width, height);
        await put(path, await new Promise<Blob>((r) => canvas.toBlob((b) => r(b!), 'image/png')));
      }
      // A tiny PDF and a tiny WAV (100 samples of silence): content is not rendered in headless runs.
      await put(
        'Attachments/doc.pdf',
        '%PDF-1.1\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 100 100]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n'
      );
      const wav = new Uint8Array(44 + 100).fill(128);
      const view = new DataView(wav.buffer);
      const tag = (at: number, s: string) =>
        [...s].forEach((c, i) => {
          wav[at + i] = c.charCodeAt(0);
        });
      tag(0, 'RIFF');
      view.setUint32(4, 36 + 100, true);
      tag(8, 'WAVEfmt ');
      view.setUint32(16, 16, true);
      view.setUint16(20, 1, true);
      view.setUint16(22, 1, true);
      view.setUint32(24, 8000, true);
      view.setUint32(28, 8000, true);
      view.setUint16(32, 1, true);
      view.setUint16(34, 8, true);
      tag(36, 'data');
      view.setUint32(40, 100, true);
      await put('Attachments/sound.wav', new Blob([wav], { type: 'audio/wav' }));
      w.__vaults[vaultName] = root;
    },
    [name, files, pngs] as const
  );
}

/** Queues the vault's note for the next Open and its root for the next folder pick. */
async function queueVault(page: Page, name: string, notePath: string) {
  await page.evaluate(
    async ([vaultName, path]) => {
      const w = window as unknown as VaultWindow;
      const root = w.__vaults[vaultName]!;
      const parts = path.split('/');
      const file = parts.pop()!;
      let dir = root;
      for (const part of parts) dir = await dir.getDirectoryHandle(part);
      w.__open.push(await dir.getFileHandle(file));
      w.__dirs.push(root);
    },
    [name, notePath] as const
  );
}

async function installPickers(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as VaultWindow & Record<string, unknown>;
    w.__open = [];
    w.__dirs = [];
    w.showOpenFilePicker = async () => [w.__open.shift()!];
    w.showDirectoryPicker = async () => w.__dirs.shift()!;
  });
}

const NOTE = [
  '# Daily',
  '',
  'Picture: ![[a.png|300]]',
  '',
  'Twice: ![[dup.png]]',
  '',
  '![[doc.pdf#page=1&height=300]]',
  '',
  '![[sound.wav]]',
  '',
  '## Transcluded',
  '',
  '![[Second#Part]]',
  '',
].join('\n');

const SECOND = '# Second\n\nIntro\n\n## Part\n\nPart text here.\n\n## Other\n\nOther text\n';

const naturalWidth = (img: ReturnType<Page['locator']>) =>
  img.evaluate((el) => (el as HTMLImageElement).naturalWidth);

/** Scrolls an embed into the observer's range, since heavy kinds load only when near the view. */
async function reveal(page: Page, selector: string) {
  await visualPane(page).locator(selector).first().scrollIntoViewIfNeeded();
}

test('a vault note shows its images, pdf, audio and transcluded section', async ({ page }) => {
  await page.goto('/');
  await installPickers(page);
  await buildVault(
    page,
    'vault-a',
    {
      '.obsidian/app.json': JSON.stringify({ attachmentFolderPath: 'Attachments' }),
      'Notes/Daily/n.md': NOTE,
      'Notes/Second.md': SECOND,
    },
    {
      'Attachments/a.png': [60, 30],
      // Two files share this name: the one beside the note must win.
      'Notes/Daily/dup.png': [30, 15],
      'Other/dup.png': [50, 25],
    }
  );
  await queueVault(page, 'vault-a', 'Notes/Daily/n.md');

  await page.getByRole('button', { name: 'Open file…' }).click();
  await expect(visualPane(page).locator('h1')).toHaveText('Daily');

  // No folder yet: the notice, with its button, and labelled placeholders.
  const banner = page.locator('.attachment-banner');
  await expect(banner).toContainText('Choose the vault or attachment folder');
  await expect(visualPane(page).locator('.md-embed-unavailable').first()).toBeVisible();
  await banner.getByRole('button', { name: 'Choose attachment folder' }).click();
  await expect(banner).toHaveCount(0);

  // Sized image: width 300 as written, from the folder app.json names.
  const picture = visualPane(page).locator('img.md-embed-image').first();
  await expect(picture).toHaveAttribute('width', '300');
  await expect(picture).toHaveAttribute('src', /^blob:/);
  await expect.poll(() => naturalWidth(picture)).toBe(60);

  // Ambiguous name: the nearest file, with the tooltip saying which.
  await reveal(page, 'img[title*="dup.png"]');
  const dup = visualPane(page).locator('img.md-embed-image[title*="Notes/Daily/dup.png"]');
  await expect(dup).toHaveCount(1);
  await expect.poll(() => naturalWidth(dup)).toBe(30);

  // PDF: an iframe plus the Open link that always sits beside it.
  await reveal(page, '.md-embed-pdf');
  await expect(visualPane(page).locator('.md-embed-pdf iframe')).toHaveCount(1);
  await expect(visualPane(page).locator('.md-embed-pdf a.md-embed-open')).toHaveText('Open');

  // Audio: a player, loaded only once it is near the view.
  await reveal(page, '.md-embed-media');
  await expect(visualPane(page).locator('audio.md-embed-audio')).toHaveCount(1);

  // Transclusion: the section's text and not the sibling section's.
  await reveal(page, '.md-transclusion');
  const block = visualPane(page).locator('.md-transclusion');
  await expect(block).toContainText('Part text here.');
  await expect(block).not.toContainText('Other text');
  await expect(block.locator('.md-transclusion-header')).toContainText('Second');

  // The source still holds exactly what was written.
  expect(await textContent(page)).toBe(NOTE);

  // The outline lists the host note's headings only, never the embedded ones.
  await page.getByRole('button', { name: 'Outline' }).click();
  const outline = page.getByRole('navigation', { name: 'Outline' });
  await expect(outline.getByRole('button')).toHaveCount(2);
  await expect(outline.getByRole('button', { name: 'Daily', exact: true })).toBeVisible();
  await expect(outline.getByRole('button', { name: 'Transcluded', exact: true })).toBeVisible();
  await expect(outline.getByRole('button', { name: 'Part', exact: true })).toHaveCount(0);
});

test('pasting a PNG saves Pasted image <14 digits>.png where app.json says and links it', async ({
  page,
}) => {
  await page.goto('/');
  await installPickers(page);
  await buildVault(
    page,
    'vault-p',
    {
      '.obsidian/app.json': JSON.stringify({ attachmentFolderPath: 'Attachments' }),
      'Notes/Daily/n.md': '# Paste here\n\n',
    },
    { 'Attachments/seed.png': [10, 10] }
  );
  await queueVault(page, 'vault-p', 'Notes/Daily/n.md');
  await page.getByRole('button', { name: 'Open file…' }).click();
  await expect(visualPane(page).locator('h1')).toHaveText('Paste here');

  // The folder is chosen through the palette command, as without a banner.
  await page.keyboard.press('ControlOrMeta+K');
  await page.getByRole('option', { name: 'Choose attachment folder…' }).click();
  // A grant is invisible; the next paste is the proof.
  await textPane(page).click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 24;
    canvas.height = 12;
    canvas.getContext('2d')!.fillRect(0, 0, 24, 12);
    const blob = await new Promise<Blob>((r) => canvas.toBlob((b) => r(b!), 'image/png'));
    const data = new DataTransfer();
    data.items.add(new File([blob], 'image.png', { type: 'image/png' }));
    document
      .querySelector('[data-testid="text-editor"] .cm-content')!
      .dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true })
      );
  });

  await expect.poll(() => textContent(page)).toMatch(/!\[\[Pasted image \d{14}\.png\]\]/);
  const name = /!\[\[(Pasted image \d{14}\.png)\]\]/.exec(await textContent(page))![1]!;

  const saved = await page.evaluate(
    async ([fileName]) => {
      const root = await (await navigator.storage.getDirectory()).getDirectoryHandle('vault-p');
      const dir = await root.getDirectoryHandle('Attachments');
      const names: string[] = [];
      for await (const [entry] of dir.entries()) names.push(entry);
      const file = await (await dir.getFileHandle(fileName!)).getFile();
      return { names, size: file.size };
    },
    [name] as const
  );
  expect(saved.names).toContain(name);
  expect(saved.size).toBeGreaterThan(0);
  // And the visual pane shows the saved file, not a data URL.
  await expect(visualPane(page).locator('img.md-embed-image').first()).toHaveAttribute(
    'src',
    /^blob:/
  );
});

test('two tabs with the same embed in different vaults show different images', async ({ page }) => {
  await page.goto('/');
  await installPickers(page);
  const note = '# Same\n\n![[a.png]]\n';
  await buildVault(
    page,
    'vault-one',
    { 'Notes/n.md': note, '.obsidian/app.json': '{}' },
    { 'a.png': [60, 30] }
  );
  await buildVault(
    page,
    'vault-two',
    { 'Notes/n.md': note, '.obsidian/app.json': '{}' },
    { 'a.png': [80, 40] }
  );

  const image = () => visualPane(page).locator('img.md-embed-image').first();
  const banner = page.locator('.attachment-banner');

  await queueVault(page, 'vault-one', 'Notes/n.md');
  await page.getByRole('button', { name: 'Open file…' }).click();
  await banner.getByRole('button', { name: 'Choose attachment folder' }).click();
  await expect.poll(() => naturalWidth(image())).toBe(60);

  await queueVault(page, 'vault-two', 'Notes/n.md');
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  const tabs = page.getByRole('tablist', { name: 'Open documents' });
  await expect(tabs.getByRole('tab')).toHaveCount(2);
  await banner.getByRole('button', { name: 'Choose attachment folder' }).click();
  await expect.poll(() => naturalWidth(image())).toBe(80);

  // Back to the first tab: the same token must resolve in its own vault again.
  await tabs.getByRole('tab').first().click();
  await expect.poll(() => naturalWidth(image())).toBe(60);
  await tabs.getByRole('tab').nth(1).click();
  await expect.poll(() => naturalWidth(image())).toBe(80);
});
