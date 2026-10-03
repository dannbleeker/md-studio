import { readFile } from 'node:fs/promises';
import { inflateRawSync, inflateSync } from 'node:zlib';
import { expect, test } from '@playwright/test';
import { newDocument, setText } from './helpers';

test.beforeEach(async ({ page }) => {
  // Use the download fallback so the browser's save dialog doesn't block the test.
  await page.addInitScript(() => {
    // biome-ignore lint/suspicious/noExplicitAny: deleting a browser global for the test.
    delete (window as any).showSaveFilePicker;
  });
});

for (const [label, fileName] of [
  ['Web page (HTML)', 'Untitled.html'],
  ['PDF', 'Untitled.pdf'],
  ['Word document (DOCX)', 'Untitled.docx'],
  ['Plain text', 'Untitled.txt'],
] as const) {
  test(`exports ${label}`, async ({ page }) => {
    await newDocument(page);
    await setText(page, '# Report\n\nSome **bold** text.\n\n| a | b |\n| - | - |\n| 1 | 2 |\n');
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Export' });
    await dialog
      .getByRole('radio', { name: new RegExp(`^${label.replace(/[()]/g, '\\$&')}`) })
      .check();
    const download = page.waitForEvent('download');
    await dialog.getByRole('button', { name: 'Export' }).click();
    const file = await download;
    expect(file.suggestedFilename()).toBe(fileName);
    // The plain-text export of this sample is ~40 bytes; binaries are KBs.
    expect((await readFile(await file.path())).length).toBeGreaterThan(30);
  });
}

test('export leaves the document and its save state alone', async ({ page }) => {
  await newDocument(page);
  await setText(page, '# Keep me');
  await expect(page.getByRole('img', { name: 'Unsaved changes' })).toBeVisible();
  await page.keyboard.press('ControlOrMeta+K');
  await page.getByRole('combobox', { name: 'Commands' }).fill('export as plain');
  const download = page.waitForEvent('download');
  await page.keyboard.press('Enter');
  expect((await download).suggestedFilename()).toBe('Untitled.txt');
  // Still unsaved: an export is a copy, not a save.
  await expect(page.getByRole('img', { name: 'Unsaved changes' })).toBeVisible();
  await expect(page.locator('.file-name')).toHaveAttribute('title', 'Untitled.md');
});

test('front matter is left out of exports unless the setting includes it', async ({ page }) => {
  await newDocument(page);
  await setText(page, '---\ntitle: Post\n---\n\n# Report\n\nBody text.\n');
  const exportText = async (include: boolean) => {
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Export' });
    await dialog.getByRole('radio', { name: /^Plain text/ }).check();
    await dialog.getByRole('checkbox', { name: /front matter/ }).setChecked(include);
    const download = page.waitForEvent('download');
    await dialog.getByRole('button', { name: 'Export' }).click();
    return readFile(await (await download).path(), 'utf8');
  };
  const without = await exportText(false);
  expect(without).toContain('Report');
  expect(without).not.toContain('title: Post');
  expect(without).not.toContain('---');
  expect(await exportText(true)).toContain('title: Post');
});

/** One file from a zip archive (a .docx), via its central directory. */
function zipEntry(zip: Buffer, name: string): string {
  const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  let at = zip.readUInt32LE(end + 16);
  for (let i = 0; i < zip.readUInt16LE(end + 10); i++) {
    const method = zip.readUInt16LE(at + 10);
    const size = zip.readUInt32LE(at + 20);
    const nameLength = zip.readUInt16LE(at + 28);
    const local = zip.readUInt32LE(at + 42);
    if (zip.toString('utf8', at + 46, at + 46 + nameLength) === name) {
      const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
      const data = zip.subarray(start, start + size);
      return (method === 8 ? inflateRawSync(data) : data).toString('utf8');
    }
    at += 46 + nameLength + zip.readUInt16LE(at + 30) + zip.readUInt16LE(at + 32);
  }
  throw new Error(`${name} not in archive`);
}

/** The text a PDF draws in a standard font: content streams inflated, hex strings decoded. */
function pdfText(pdf: Buffer): string {
  const text: string[] = [];
  let from = 0;
  for (;;) {
    const start = pdf.indexOf('stream\n', from);
    if (start < 0) break;
    const end = pdf.indexOf('endstream', start);
    let content: string;
    try {
      content = inflateSync(pdf.subarray(start + 7, end)).toString('latin1');
    } catch {
      content = '';
    }
    for (const [, hex] of content.matchAll(/<([0-9A-Fa-f]*)>\s*Tj/g)) {
      text.push(Buffer.from(hex ?? '', 'hex').toString('latin1'));
    }
    from = end;
  }
  return text.join(' ');
}

test('front matter is exported in every format once turned on in Settings', async ({ page }) => {
  await newDocument(page);
  await setText(page, '---\ntitle: Quarterly\nauthor: Dann\n---\n\n# Report\n\nBody text.\n');

  await page.getByRole('button', { name: 'Settings' }).click();
  const settings = page.getByRole('dialog', { name: 'Settings' });
  const box = settings.getByRole('checkbox', { name: /front matter/ });
  await expect(box).not.toBeChecked();
  await box.check();
  await settings.getByRole('button', { name: 'Done' }).click();

  const exported = async (label: RegExp) => {
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Export' });
    await dialog.getByRole('radio', { name: label }).check();
    // The dialog starts from the setting.
    await expect(dialog.getByRole('checkbox', { name: /front matter/ })).toBeChecked();
    const download = page.waitForEvent('download');
    await dialog.getByRole('button', { name: 'Export' }).click();
    return readFile(await (await download).path());
  };

  const expectFrontMatter = (text: string) => {
    expect(text).toContain('author');
    expect(text).toContain('Dann');
    expect(text).toContain('Report');
  };
  expectFrontMatter((await exported(/^Plain text/)).toString('utf8'));
  expectFrontMatter((await exported(/^Web page/)).toString('utf8'));
  expectFrontMatter(zipEntry(await exported(/^Word document/), 'word/document.xml'));
  // Only the code font's text is readable here (the body font is embedded
  // as glyph ids), which is where the front matter is drawn.
  const pdf = pdfText(await exported(/^PDF/));
  expect(pdf).toContain('title: Quarterly');
  expect(pdf).toContain('author: Dann');

  // Commands in the palette export with the same setting.
  await page.keyboard.press('ControlOrMeta+K');
  await page.getByRole('combobox', { name: 'Commands' }).fill('export as plain');
  const download = page.waitForEvent('download');
  await page.keyboard.press('Enter');
  expectFrontMatter(await readFile(await (await download).path(), 'utf8'));
});
