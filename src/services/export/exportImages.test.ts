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
      ctx
    );
    expect(read).toHaveBeenCalledWith(ctx, 'img/a b%.png');
    expect(images.get(href)).toMatchObject({ type: 'png', displayWidth: 300, displayHeight: 200 });
    const half = images.get('attachment:img/a%20b%25.png#size=50');
    expect(half).toMatchObject({ displayWidth: 50 });
    expect(half).not.toHaveProperty('displayHeight');
  });

  it('skips an attachment the vault cannot give', async () => {
    read.mockResolvedValue(null);
    expect((await loadExportImages('![a](attachment:gone.png)', ctx)).size).toBe(0);
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
      const images = await loadExportImages('![w](attachment:a.webp#size=100)', ctx);
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
      const images = await loadExportImages('![s](attachment:a.svg)', ctx);
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
      expect((await loadExportImages('![w](attachment:a.webp)', ctx)).size).toBe(0);

      vi.stubGlobal(
        'createImageBitmap',
        vi.fn(async () => ({ width: 2, height: 2 }))
      );
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
      expect((await loadExportImages('![w](attachment:a.webp)', ctx)).size).toBe(0);
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

    it('leaves png, jpg and gif bytes untouched', async () => {
      read.mockResolvedValue({ bytes: PNG_BYTES, type: 'image/png' });
      const bitmap = vi.fn();
      vi.stubGlobal('createImageBitmap', bitmap);
      const images = await loadExportImages('![p](attachment:a.png)', ctx);
      expect(bitmap).not.toHaveBeenCalled();
      expect(images.get('attachment:a.png')?.bytes).toBe(PNG_BYTES);
    });
  });
});
