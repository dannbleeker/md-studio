import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { stubObjectUrls } from '../../../test/fakeFs';
import type { DocContext } from '../attachments';
import { readAttachmentBytes, resolveAttachment } from '../attachments';
import { loadExportImages } from './exportImages';

vi.mock('../attachments', () => ({
  readAttachmentBytes: vi.fn(),
  resolveAttachment: vi.fn(),
}));

const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const PNG_BYTES = Uint8Array.from(atob(PNG.split(',')[1] ?? ''), (c) => c.charCodeAt(0));
const WEBP_BYTES = new TextEncoder().encode('RIFF....WEBPVP8 ');
const ctx: DocContext = { fileHandle: null, handleId: 'doc' };
/** The vault paths the expander resolved; only these may be read through an `attachment:` link. */
const attachments: ReadonlySet<string> = new Set([
  'img/a b%.png',
  'gone.png',
  'a.webp',
  'a.svg',
  'a.avif',
  'a.bmp',
  'a.png',
]);

const read = vi.mocked(readAttachmentBytes);
const resolve = vi.mocked(resolveAttachment);

beforeEach(() => {
  read.mockReset();
  resolve.mockReset();
  resolve.mockResolvedValue({ state: 'unavailable', reason: 'no-folder' });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('loadExportImages', () => {
  it('loads pasted images wherever they appear, and never web images', async () => {
    const md = `Intro ![a](${PNG})\n\n- item ![b](${PNG})\n\n| x |\n| - |\n| ![c](${PNG}) |\n\n![web](https://example.com/x.png)`;
    const images = await loadExportImages(md, ctx);
    expect([...images.keys()]).toEqual([PNG]);
    expect(images.get(PNG)).toMatchObject({ type: 'png', width: 1, height: 1 });
  });

  it('skips relative images when the document has no folder access', async () => {
    expect((await loadExportImages('![x](images/x.png)', ctx)).size).toBe(0);
  });

  it('never fetches or resolves web images, protocol-relative ones included', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const md = '![a](https://x.dk/a.png)\n\n![b](//cdn.x.dk/b.png)\n\n![c](HTTP://x.dk/c.png)';
    expect((await loadExportImages(md, ctx)).size).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(resolve).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
  });

  it('reads attachment links from the vault by decoded path and keeps the display size', async () => {
    read.mockResolvedValue({ bytes: PNG_BYTES, type: 'image/png' });
    const href = 'attachment:img/a%20b%25.png#size=300x200';
    const images = await loadExportImages(
      `![a](${href})\n\n![b](attachment:img/a%20b%25.png#size=50)`,
      ctx,
      { attachments }
    );
    expect(read).toHaveBeenCalledWith(ctx, 'img/a b%.png');
    expect(images.get(href)).toMatchObject({ type: 'png', displayWidth: 300, displayHeight: 200 });
    const half = images.get('attachment:img/a%20b%25.png#size=50');
    expect(half).toMatchObject({ displayWidth: 50 });
    expect(half).not.toHaveProperty('displayHeight');
  });

  it('reads only attachment links the expander produced, never a hand-typed path', async () => {
    read.mockResolvedValue({ bytes: new TextEncoder().encode('BM my secret diary'), type: '' });
    const forged = '![x](attachment:private/BM-diary.md)\n\n![y](attachment:.obsidian/notes.md)';
    for (const options of [{}, { attachments }, { attachments, keepPastedRasters: true }]) {
      expect((await loadExportImages(forged, ctx, options)).size).toBe(0);
    }
    expect(read).not.toHaveBeenCalled();
  });

  it('skips an attachment the vault cannot give', async () => {
    read.mockResolvedValue(null);
    expect((await loadExportImages('![a](attachment:gone.png)', ctx, { attachments })).size).toBe(
      0
    );
  });

  it('reads a relative image through the vault resolver', async () => {
    resolve.mockResolvedValue({
      state: 'ok',
      path: 'images/x.png',
      name: 'x.png',
      kind: 'image',
      url: 'blob:fake/1',
      ambiguous: false,
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        blob: async () => ({ type: 'image/png', arrayBuffer: async () => PNG_BYTES.buffer }),
      }))
    );
    const images = await loadExportImages('![x](images/my%20x.png)', ctx);
    expect(resolve).toHaveBeenCalledWith(ctx, 'images/my x.png', {
      markdown: true,
      alternates: ['images/my%20x.png'],
    });
    expect(images.get('images/my%20x.png')).toMatchObject({ type: 'png' });
  });

  describe('formats the converters cannot embed', () => {
    function stubCanvas(draw = vi.fn()) {
      const sizes: [number, number][] = [];
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
        drawImage: draw,
      } as unknown as CanvasRenderingContext2D);
      vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (
        this: HTMLCanvasElement,
        callback
      ) {
        sizes.push([this.width, this.height]);
        callback(new Blob([PNG_BYTES as BlobPart], { type: 'image/png' }));
      });
      return { sizes, draw };
    }

    it('redraws webp as PNG, at most 2000 px on the long side', async () => {
      read.mockResolvedValue({ bytes: WEBP_BYTES, type: 'image/webp' });
      const close = vi.fn();
      vi.stubGlobal(
        'createImageBitmap',
        vi.fn(async () => ({ width: 4000, height: 1000, close }))
      );
      const { sizes, draw } = stubCanvas();
      const images = await loadExportImages('![w](attachment:a.webp#size=100)', ctx, {
        attachments,
      });
      expect(sizes).toEqual([[2000, 500]]);
      expect(draw).toHaveBeenCalled();
      expect(close).toHaveBeenCalled();
      const image = images.get('attachment:a.webp#size=100');
      expect(image).toMatchObject({ type: 'png', displayWidth: 100 });
      expect(image?.bytes).toEqual(PNG_BYTES);
    });

    it('redraws an SVG through an image element, 800 px wide when it has no size', async () => {
      stubObjectUrls();
      const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
      read.mockResolvedValue({ bytes: svg, type: 'image/svg+xml' });
      class FakeImage {
        naturalWidth = 0;
        naturalHeight = 0;
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        set src(_url: string) {
          queueMicrotask(() => this.onload?.());
        }
      }
      vi.stubGlobal('Image', FakeImage);
      const { sizes } = stubCanvas();
      const images = await loadExportImages('![s](attachment:a.svg)', ctx, { attachments });
      expect(sizes).toEqual([[800, 600]]);
      expect(images.get('attachment:a.svg')).toMatchObject({ type: 'png' });
      expect(URL.revokeObjectURL).toHaveBeenCalled();
    });

    it('skips the image when the browser cannot decode or draw it', async () => {
      read.mockResolvedValue({ bytes: WEBP_BYTES, type: 'image/webp' });
      vi.stubGlobal(
        'createImageBitmap',
        vi.fn(async () => Promise.reject(new Error('bad')))
      );
      expect((await loadExportImages('![w](attachment:a.webp)', ctx, { attachments })).size).toBe(
        0
      );

      vi.stubGlobal(
        'createImageBitmap',
        vi.fn(async () => ({ width: 2, height: 2 }))
      );
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
      expect((await loadExportImages('![w](attachment:a.webp)', ctx, { attachments })).size).toBe(
        0
      );
    });

    it('leaves pasted rasters as pasted when asked (HTML), and redraws them otherwise', async () => {
      const webp = 'data:image/webp;base64,UklGRi4AAABXRUJQVlA4IA==';
      const bitmap = vi.fn(async () => ({ width: 1, height: 1 }));
      vi.stubGlobal('createImageBitmap', bitmap);
      stubCanvas();
      const keep = await loadExportImages(`![w](${webp}) ![p](${PNG})`, ctx, {
        keepPastedRasters: true,
      });
      expect(keep.size).toBe(0);
      expect(bitmap).not.toHaveBeenCalled();
      // PDF and Word cannot embed webp, so they still get the PNG.
      const all = await loadExportImages(`![w](${webp})`, ctx);
      expect(all.get(webp)).toMatchObject({ type: 'png' });
    });

    it('keeps a vault webp, avif, bmp or svg as it is for HTML, without redrawing', async () => {
      const bitmap = vi.fn();
      vi.stubGlobal('createImageBitmap', bitmap);
      const bytes = (head: string, at = 0) =>
        Uint8Array.from([...new Array(at).fill(0), ...new TextEncoder().encode(head)]);
      /** A 1x1 24-bit bitmap header: size field, reserved zeros, pixel offset, 40-byte DIB header. */
      const bmp = () => {
        const out = new Uint8Array(58);
        const view = new DataView(out.buffer);
        out.set([0x42, 0x4d]);
        view.setUint32(2, out.length, true);
        view.setUint32(10, 54, true);
        view.setUint32(14, 40, true);
        view.setInt32(18, 1, true);
        view.setInt32(22, 1, true);
        return out;
      };
      const cases: [Uint8Array, string, string][] = [
        [WEBP_BYTES, 'image/webp', 'a.webp'],
        [bytes('ftypavif', 4), 'image/avif', 'a.avif'],
        [bmp(), 'image/bmp', 'a.bmp'],
        [bytes('<svg xmlns="http://www.w3.org/2000/svg"></svg>'), 'image/svg+xml', 'a.svg'],
        [
          bytes('\uFEFF<?xml version="1.0"?><!-- c --><!DOCTYPE svg><!-- d -->\n<svg></svg>'),
          'image/svg+xml',
          'a.svg',
        ],
      ];
      for (const [data, mime, name] of cases) {
        read.mockResolvedValue({ bytes: data, type: '' });
        const images = await loadExportImages(`![x](attachment:${name})`, ctx, {
          keepPastedRasters: true,
          attachments,
        });
        expect(images.get(`attachment:${name}`)).toMatchObject({ mime, bytes: data });
      }
      expect(bitmap).not.toHaveBeenCalled();
    });

    it('never inlines a text file that merely starts like a bitmap or mentions <svg', async () => {
      const bitmap = vi.fn(async () => {
        throw new Error('not an image');
      });
      vi.stubGlobal('createImageBitmap', bitmap);
      stubObjectUrls();
      // What a browser does with text it was told is an SVG: the load fails.
      class BrokenImage {
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        set src(_url: string) {
          queueMicrotask(() => this.onerror?.());
        }
      }
      vi.stubGlobal('Image', BrokenImage);
      const text = (value: string) => new TextEncoder().encode(value);
      for (const [data, name] of [
        [text('BM25 ranking notes. PASSWORD=hunter2'), 'a.bmp'],
        [text('# secret <svg> notes PASSWORD=hunter2'), 'a.svg'],
        [text('<svg>PASSWORD=hunter2'), 'a.svg'],
      ] as const) {
        // Even a vault that labels the file with an image type must not make it an image.
        read.mockResolvedValue({ bytes: data, type: name.endsWith('svg') ? 'image/svg+xml' : '' });
        const images = await loadExportImages(`![x](attachment:${name})`, ctx, {
          keepPastedRasters: true,
          attachments,
        });
        expect(images.size).toBe(0);
      }
    });

    it('rejects a run of adjacent comments that is not an svg without backtracking', {
      tags: ['stress'],
    }, async () => {
      vi.stubGlobal('createImageBitmap', vi.fn());
      read.mockResolvedValue({
        bytes: new TextEncoder().encode(`${'<!---->'.repeat(140)}x`),
        type: '',
      });
      const started = performance.now();
      const images = await loadExportImages('![x](attachment:a.png)', ctx, {
        keepPastedRasters: true,
        attachments,
      });
      expect(performance.now() - started).toBeLessThan(500);
      expect(images.get('attachment:a.png')?.mime).not.toBe('image/svg+xml');
    });

    it('reads only image files for a plain relative link, and not oversized ones', async () => {
      const fetchMock = vi.fn(async () => ({
        blob: async () => ({
          type: 'text/plain',
          size: 10,
          arrayBuffer: async () => text('BM25 PASSWORD=hunter2').buffer,
        }),
      }));
      const text = (value: string) => new TextEncoder().encode(value);
      vi.stubGlobal('fetch', fetchMock);
      resolve.mockResolvedValue({
        state: 'ok',
        path: 'Private/bm.txt',
        name: 'bm.txt',
        kind: 'other',
        url: 'blob:fake/2',
        ambiguous: false,
      });
      const options = { keepPastedRasters: true };
      expect((await loadExportImages('![x](Private/bm.txt)', ctx, options)).size).toBe(0);
      expect(fetchMock).not.toHaveBeenCalled();

      resolve.mockResolvedValue({
        state: 'ok',
        path: 'big.png',
        name: 'big.png',
        kind: 'image',
        url: 'blob:fake/3',
        ambiguous: false,
      });
      const arrayBuffer = vi.fn(async () => PNG_BYTES.buffer);
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => ({ blob: async () => ({ type: 'image/png', size: 1e9, arrayBuffer }) }))
      );
      expect((await loadExportImages('![x](big.png)', ctx)).size).toBe(0);
      expect(arrayBuffer).not.toHaveBeenCalled();
    });

    it('leaves png, jpg and gif bytes untouched', async () => {
      read.mockResolvedValue({ bytes: PNG_BYTES, type: 'image/png' });
      const bitmap = vi.fn();
      vi.stubGlobal('createImageBitmap', bitmap);
      const images = await loadExportImages('![p](attachment:a.png)', ctx, { attachments });
      expect(bitmap).not.toHaveBeenCalled();
      expect(images.get('attachment:a.png')?.bytes).toBe(PNG_BYTES);
    });
  });
});
