import { marked, type Token } from 'marked';
import { ATTACHMENT_SCHEME, parseSizeFragment } from '@/domain/embedExport';
import { splitLinkTarget } from '@/domain/embeds';
import { dataUrlBytes, type ImageInfo, imageInfo } from '@/domain/imageInfo';
import { isRasterDataUrl, isRelativeUrl, isWebImage } from '@/domain/imagePaths';
import { type DocContext, readAttachmentBytes, resolveAttachment } from '../attachments';

export type ExportImage = ImageInfo & {
  bytes: Uint8Array;
  /** Pixel size the Markdown asked for (Obsidian's ![[a.png|300]]). */
  displayWidth?: number;
  displayHeight?: number;
};
export type ExportImages = ReadonlyMap<string, ExportImage>;

/** Longest side of a rasterised image, so a huge SVG or photo can't blow up a PDF. */
const MAX_SIDE = 2000;
/** Width given to an SVG that declares no size of its own. */
const SVG_WIDTH = 800;

function imageSources(tokens: Token[], out: Set<string>): Set<string> {
  for (const t of tokens) {
    if (t.type === 'image') out.add(t.href);
    if ('tokens' in t && t.tokens) imageSources(t.tokens, out);
    if (t.type === 'list') for (const item of t.items) imageSources(item.tokens, out);
    if (t.type === 'table') {
      for (const cell of [...t.header, ...t.rows.flat()]) imageSources(cell.tokens, out);
    }
  }
  return out;
}

/** The vault path inside an `attachment:` link, percent-decoded per segment. */
function attachmentPath(href: string): string {
  return href
    .slice(ATTACHMENT_SCHEME.length)
    .split('/')
    .map((segment) => {
      try {
        return decodeURIComponent(segment);
      } catch {
        return segment;
      }
    })
    .join('/');
}

function looksLikeSvg(bytes: Uint8Array, type: string): boolean {
  if (/svg/i.test(type)) return true;
  const head = new TextDecoder().decode(bytes.subarray(0, 512));
  return /<svg[\s>]/i.test(head);
}

function canvasToPng(canvas: HTMLCanvasElement): Promise<Uint8Array | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      if (!blob) return resolve(null);
      blob.arrayBuffer().then(
        (buffer) => resolve(new Uint8Array(buffer)),
        () => resolve(null)
      );
    }, 'image/png');
  });
}

function drawToPng(
  source: CanvasImageSource,
  width: number,
  height: number
): Promise<Uint8Array | null> {
  const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext('2d');
  if (!context) return Promise.resolve(null);
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvasToPng(canvas);
}

/**
 * PNG bytes for an image the converters can't embed (webp, avif, bmp, svg),
 * drawn on a canvas. Null when the browser can't (no canvas, a format it
 * can't decode): the image then falls back to its alt text.
 */
async function rasterise(bytes: Uint8Array, type: string): Promise<Uint8Array | null> {
  try {
    if (typeof document === 'undefined') return null;
    if (looksLikeSvg(bytes, type)) {
      const url = URL.createObjectURL(
        new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'image/svg+xml' })
      );
      try {
        const img = new Image();
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error('svg'));
          img.src = url;
        });
        const width = img.naturalWidth || SVG_WIDTH;
        const height = img.naturalHeight || Math.round(width * 0.75);
        return await drawToPng(img, width, height);
      } finally {
        URL.revokeObjectURL(url);
      }
    }
    const bitmap = await createImageBitmap(new Blob([bytes as Uint8Array<ArrayBuffer>], { type }));
    try {
      return await drawToPng(bitmap, bitmap.width, bitmap.height);
    } finally {
      bitmap.close?.();
    }
  } catch {
    return null;
  }
}

async function readSource(
  src: string,
  ctx: DocContext
): Promise<{ bytes: Uint8Array; type: string } | null> {
  const pasted = dataUrlBytes(src);
  if (pasted) return { bytes: pasted, type: /^data:([^;,]+)/i.exec(src)?.[1] ?? '' };
  if (src.startsWith(ATTACHMENT_SCHEME)) {
    return readAttachmentBytes(ctx, attachmentPath(parseSizeFragment(src).href));
  }
  // Web images are never fetched: exporting must not contact another server.
  if (isWebImage(src) || !isRelativeUrl(src)) return null;
  const { path, literal } = splitLinkTarget(src);
  const found = await resolveAttachment(ctx, path, {
    markdown: true,
    ...(literal === path ? {} : { alternates: [literal] }),
  });
  if (found.state !== 'ok') return null;
  try {
    const blob = await (await fetch(found.url)).blob();
    return { bytes: new Uint8Array(await blob.arrayBuffer()), type: blob.type };
  } catch {
    return null;
  }
}

/**
 * The document's images, ready to embed in a PDF or Word file: images
 * pasted into the document (data: URLs), vault files named by `attachment:`
 * links (see domain/embedExport.ts) and relative paths read from the vault
 * or the document's folder like the visual pane does. Web images are not
 * fetched, so exporting never contacts another server; those, and formats
 * no converter can embed, fall back to their alt text. `keepPastedRasters`
 * (HTML) leaves pasted png, jpg, gif and webp data: URLs out, so they stay as pasted.
 */
export async function loadExportImages(
  markdown: string,
  ctx: DocContext,
  options: { keepPastedRasters?: boolean } = {}
): Promise<ExportImages> {
  const images = new Map<string, ExportImage>();
  for (const src of imageSources(marked.lexer(markdown), new Set())) {
    // HTML shows a pasted raster image as it is; redrawing a webp as PNG would
    // only make the page larger.
    if (options.keepPastedRasters && isRasterDataUrl(src)) continue;
    const loaded = await readSource(src, ctx);
    if (!loaded) continue;
    let bytes = loaded.bytes;
    let info = imageInfo(bytes);
    if (!info) {
      // webp, avif, bmp and svg are redrawn as PNG; png, jpg and gif stay untouched.
      const png = await rasterise(bytes, loaded.type);
      info = png && imageInfo(png);
      if (png) bytes = png;
    }
    if (!info) continue;
    const { displayWidth, displayHeight } = src.startsWith(ATTACHMENT_SCHEME)
      ? parseSizeFragment(src)
      : ({} as { displayWidth?: number; displayHeight?: number });
    images.set(src, {
      ...info,
      bytes,
      ...(displayWidth === undefined ? {} : { displayWidth }),
      ...(displayHeight === undefined ? {} : { displayHeight }),
    });
  }
  return images;
}
