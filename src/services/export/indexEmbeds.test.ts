import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildVaultIndex } from '@/domain/vaultIndex';
import { resetStoreForTest, useStore } from '@/store';
import { exportDocument } from './index';

const saved = vi.hoisted(() => ({ blob: null as Blob | null, toasts: [] as string[] }));
vi.mock('../fileSystem', () => ({
  saveBlobAs: vi.fn(async (blob: Blob, name: string) => {
    saved.blob = blob;
    return { kind: 'written', name };
  }),
}));
vi.mock('@/store/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/store/ui')>()),
  showToast: (message: string) => {
    saved.toasts.push(message);
  },
}));
// The PDF writer is slow and not what is under test: it only needs to produce bytes.
vi.mock('./markdownPdf.mjs', () => ({
  markdownToPdf: vi.fn(async () => new Uint8Array([37, 80, 68, 70])),
}));

const vault = vi.hoisted(() => ({
  files: {} as Record<string, string>,
  bytes: {} as Record<string, Uint8Array>,
  getVault: vi.fn(),
}));
vi.mock('../attachments', () => ({
  getVault: (...args: unknown[]) => vault.getVault(...args),
  readNoteText: vi.fn(async (_ctx: unknown, path: string) =>
    path in vault.files ? { state: 'ok', text: vault.files[path] } : { state: 'missing' }
  ),
  readAttachmentBytes: vi.fn(async (_ctx: unknown, path: string) => {
    const bytes = vault.bytes[path];
    return bytes ? { bytes, type: '' } : null;
  }),
  resolveAttachment: vi.fn(async () => ({ state: 'unavailable', reason: 'no-folder' })),
}));

const PNG_HEAD = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
  ),
  (c) => c.charCodeAt(0)
);
const WEBP = new Uint8Array([
  ...new TextEncoder().encode('RIFF'),
  4,
  0,
  0,
  0,
  ...new TextEncoder().encode('WEBPVP8 '),
]);

function setVault(paths: string[]) {
  vault.getVault.mockResolvedValue({
    index: buildVaultIndex(paths),
    config: null,
    notePath: 'n.md',
    truncated: false,
    complete: true,
  });
}

async function exported(format: 'html' | 'txt' | 'pdf', md: string): Promise<string> {
  useStore.getState().setMarkdown(md, 'text');
  await exportDocument(format, { htmlTheme: 'auto', frontMatter: true });
  return (await saved.blob?.text()) ?? '';
}

beforeEach(() => {
  resetStoreForTest();
  saved.blob = null;
  saved.toasts = [];
  vault.files = {};
  vault.bytes = {};
  vault.getVault.mockReset();
  setVault(['n.md']);
});

describe('exportDocument with embeds', () => {
  it('keeps a citation link whose label is [[1]]', async () => {
    const html = await exported('html', 'Fact [[1]](https://example.com/a).\n');
    expect(html).toContain('<a href="https://example.com/a">[1]</a>');
    expect(await exported('txt', 'Fact [[1]](https://example.com/a).\n')).toContain(
      '[1] (https://example.com/a)'
    );
  });

  it('does not wait for the vault to print the text of a plain wikilink', async () => {
    const html = await exported('html', 'See [[Note|the note]].\n');
    expect(html).toContain('See the note.');
    expect(vault.getVault).not.toHaveBeenCalled();
  });

  it('gates quickly on a line of unclosed image brackets', { tags: ['stress'] }, async () => {
    const start = performance.now();
    await exported('txt', '!['.repeat(40000));
    expect(performance.now() - start).toBeLessThan(1000);
    expect(vault.getVault).not.toHaveBeenCalled();
  });

  it('still reads the vault for an embed', async () => {
    setVault(['n.md', 'Other.md']);
    vault.files['Other.md'] = 'from other';
    expect(await exported('txt', '![[Other]]\n')).toContain('from other');
    expect(vault.getVault).toHaveBeenCalled();
  });

  it('embeds only vault pictures an embed named, not a hand-typed attachment: link', async () => {
    setVault(['n.md', 'pic.webp', 'private/BM-diary.md']);
    vault.bytes['pic.webp'] = WEBP;
    vault.bytes['private/BM-diary.md'] = new TextEncoder().encode('BM my secret diary');
    const html = await exported(
      'html',
      '![[pic.webp]]\n\n![x](attachment:private/BM-diary.md)\n\n![y](attachment:.obsidian/notes.md)\n'
    );
    expect(html).toContain('data:image/webp;base64,');
    expect(html).not.toContain('data:image/bmp');
    expect(html).not.toContain(btoa('BM my secret diary'));
  });

  it('says a missing note is a missing note', async () => {
    expect(await exported('txt', '![[Meeting notes]]\n')).toContain(
      'Note not found: Meeting notes'
    );
  });

  it('shows a web embed as an image the page can load, when web images are on', async () => {
    const md = '![[https://example.com/a.png]]\n';
    const html = async (webImages: boolean) => {
      useStore.getState().setMarkdown(md, 'text');
      await exportDocument('html', { htmlTheme: 'auto', frontMatter: true, webImages });
      return (await saved.blob?.text()) ?? '';
    };
    expect(await html(true)).toContain('<img src="https://example.com/a.png"');
    const off = await html(false);
    expect(off).not.toContain('<img');
    expect(off).not.toContain('not found');
  });

  it('warns about characters a PDF cannot show that come from an embedded note', async () => {
    setVault(['n.md', 'Other.md']);
    vault.files['Other.md'] = 'Greek αβγ and 日本語';
    await exported('pdf', '![[Other]]\n');
    expect(saved.toasts.some((m) => m.includes('can’t be shown in a PDF'))).toBe(true);
  });

  it('does not warn for the name of an image that resolves', async () => {
    setVault(['n.md', '日本語.png']);
    vault.bytes['日本語.png'] = PNG_HEAD;
    await exported('pdf', '![[日本語.png]]\n');
    expect(saved.toasts.some((m) => m.includes('can’t be shown in a PDF'))).toBe(false);
  });

  it('embeds a vault webp as it is in the HTML export', async () => {
    setVault(['n.md', 'photo.webp']);
    vault.bytes['photo.webp'] = WEBP;
    const html = await exported('html', '![[photo.webp]]\n');
    expect(html.match(/<img src="data:image\/webp;base64,/g)).toHaveLength(1);
  });

  it('says so when a picture is too large to embed in the page', async () => {
    setVault(['n.md', 'photo.png']);
    const big = new Uint8Array(6 * 1024 * 1024);
    big.set(PNG_HEAD);
    vault.bytes['photo.png'] = big;
    const html = await exported('html', '![[photo.png]]\n');
    expect(html).not.toContain('<img');
    expect(saved.toasts.some((m) => m.includes('5 MB'))).toBe(true);
  });
});
