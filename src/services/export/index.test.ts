import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetStoreForTest, useStore } from '@/store';
import { exportDocument, printedText } from './index';

const saved = vi.hoisted(() => ({ blob: null as Blob | null }));
vi.mock('../fileSystem', () => ({
  saveBlobAs: vi.fn(async (blob: Blob, name: string) => {
    saved.blob = blob;
    return { kind: 'written', name };
  }),
}));

const WEBP = 'data:image/webp;base64,UklGRi4AAABXRUJQVlA4IA==';

beforeEach(() => {
  resetStoreForTest();
  saved.blob = null;
});

describe('exportDocument', () => {
  it('keeps a pasted webp image as pasted in the HTML export', async () => {
    // A redraw would need these; the HTML export must not reach for them.
    const bitmap = vi.fn();
    vi.stubGlobal('createImageBitmap', bitmap);
    useStore.getState().setMarkdown(`# T\n\n![p](${WEBP})\n`, 'text');
    await exportDocument('html', { htmlTheme: 'auto', frontMatter: true });
    const html = await saved.blob?.text();
    expect(html).toContain(`<img src="${WEBP}"`);
    expect(html).not.toContain('data:image/png');
    expect(bitmap).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe('printedText', () => {
  it('drops the attachment pictures an embed turned into', () => {
    expect(printedText('a ![x.png](attachment:img/x.png#size=20) b')).toBe('a  b');
    expect(printedText('plain text')).toBe('plain text');
  });

  it('stays quick on a long line of unclosed attachment starts', { tags: ['stress'] }, () => {
    const md = `${'![a](attachment:'.repeat(12_500)}x`;
    const start = performance.now();
    expect(printedText(md)).toBe(md);
    expect(performance.now() - start).toBeLessThan(500);
  });
});
