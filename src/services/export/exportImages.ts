import { marked, type Token } from 'marked';
import { ATTACHMENT_SCHEME, parseSizeFragment } from '@/domain/embedExport';
import { splitLinkTarget } from '@/domain/embeds';
import { dataUrlBytes, type ImageInfo, imageInfo } from '@/domain/imageInfo';
import { isRasterDataUrl, isRelativeUrl, isWebImage } from '@/domain/imagePaths';
import { type DocContext, readAttachmentBytes, resolveAttachment } from '../attachments';
import { canvasToPng } from './canvasPng';

export type ExportImage = ImageInfo & {
  bytes: Uint8Array;
  /**
   * Set when the bytes are kept in a format the converters cannot read but a
   * browser shows (HTML only); width and height are then 0 and unused.
   */
  mime?: string;
  /**
   * Markup a web page shows in place of the picture (a typeset formula, as
   * MathML). HTML only; the bytes are then empty.
   */
  html?: string;
  /** Pixel size the Markdown asked for (Obsidian's ![[a.png|300]]). */
  displayWidth?: number;
  displayHeight?: number;
};
export type ExportImages = ReadonlyMap<string, ExportImage>;

/** Longest side of a rasterised image, so a huge SVG or photo can't blow up a PDF. */
const MAX_SIDE = 2000;
/** Width given to an SVG that declares no size of its own. */
const SVG_WIDTH = 800;
/** Largest vault image read for an export; a bigger file is left out before it is loaded. */
const MAX_SOURCE_BYTES = 32 * 1024 * 1024;

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

/** DIB header sizes a BMP file may declare (core, info, v2 to v5). */
const DIB_SIZES: ReadonlySet<number> = new Set([12, 40, 52, 56, 64, 108, 124]);

/**
 * Whether the bytes are a bitmap file and not text that begins with "BM": the size field
 * matches, the reserved bytes are zero and a known DIB header follows the file header.
 */
function isBitmap(bytes: Uint8Array): boolean {
  if (bytes.length < 26 || bytes[0] !== 0x42 || bytes[1] !== 0x4d) return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return (
    view.getUint32(2, true) === bytes.length &&
    view.getUint32(6, true) === 0 &&
    view.getUint32(10, true) < bytes.length &&
    DIB_SIZES.has(view.getUint32(14, true))
  );
}

// Each comment stops at its first `-->`: a lazy body could end at any later one, and
// a run of adjacent comments then tiles in 2^n ways when the root element never comes.
const COMMENTS = String.raw`(?:<!--(?:(?!-->)[\s\S]){0,500}-->\s*)*`;
const SVG_ROOT = new RegExp(
  String.raw`^\uFEFF?\s*(?:<\?xml[^>]{0,200}\?>\s*)?${COMMENTS}(?:<!DOCTYPE[^>]{0,300}>\s*)?${COMMENTS}<svg[\s>]`,
  'i'
);
const SVG_CLOSE = /<\/svg\s*>\s*$/i;

/** An SVG document: its root element comes first and it is closed, so a text file with `<svg>` in it is not one. */
function isSvgDocument(bytes: Uint8Array): boolean {
  const head = new TextDecoder().decode(bytes.subarray(0, 1024));
  if (!SVG_ROOT.test(head)) return false;
  return SVG_CLOSE.test(new TextDecoder().decode(bytes.subarray(Math.max(0, bytes.length - 64))));
}

/** The type of a picture a browser shows as it is, from its first bytes; null for anything else. */
function browserImageType(bytes: Uint8Array): string | null {
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  if (ascii(4, 8) === 'ftyp' && /^avi[fs]$/.test(ascii(8, 12))) return 'image/avif';
  if (isBitmap(bytes)) return 'image/bmp';
  return isSvgDocument(bytes) ? 'image/svg+xml' : null;
}

function sizeOf(src: string): { displayWidth?: number; displayHeight?: number } {
  if (!src.startsWith(ATTACHMENT_SCHEME)) return {};
  const { displayWidth, displayHeight } = parseSizeFragment(src);
  return {
    ...(displayWidth === undefined ? {} : { displayWidth }),
    ...(displayHeight === undefined ? {} : { displayHeight }),
  };
}

async function readSource(
  src: string,
  ctx: DocContext,
  attachments: ReadonlySet<string> | undefined
): Promise<{ bytes: Uint8Array; type: string } | null> {
  const pasted = dataUrlBytes(src);
  if (pasted) return { bytes: pasted, type: /^data:([^;,]+)/i.exec(src)?.[1] ?? '' };
  if (src.startsWith(ATTACHMENT_SCHEME)) {
    // The scheme is not reserved: a note can type `![x](attachment:any/path)` itself. Only
    // paths the embed expander resolved against the vault index may be read.
    const path = attachmentPath(parseSizeFragment(src).href);
    return attachments?.has(path) ? readAttachmentBytes(ctx, path) : null;
  }
  // Web images are never fetched: exporting must not contact another server.
  if (isWebImage(src) || !isRelativeUrl(src)) return null;
  const { path, literal } = splitLinkTarget(src);
  const found = await resolveAttachment(ctx, path, {
    markdown: true,
    ...(literal === path ? {} : { alternates: [literal] }),
  });
  // Only a file the vault classes as an image: a plain link to a note or any other file must
  // not be read, let alone published inside an exported page.
  if (found.state !== 'ok' || found.kind !== 'image') return null;
  try {
    const blob = await (await fetch(found.url)).blob();
    if (blob.size > MAX_SOURCE_BYTES) return null;
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
 * (HTML) leaves pasted png, jpg, gif and webp data: URLs out, so they stay as pasted,
 * and keeps vault webp, avif, bmp and svg files as they are instead of redrawing them.
 * `attachments` lists the vault paths the embed expander resolved; an `attachment:`
 * link to any other path is ignored.
 */
export async function loadExportImages(
  markdown: string,
  ctx: DocContext,
  options: { keepPastedRasters?: boolean; attachments?: ReadonlySet<string> } = {}
): Promise<ExportImages> {
  const images = new Map<string, ExportImage>();
  for (const src of imageSources(marked.lexer(markdown), new Set())) {
    // HTML shows a pasted raster image as it is; redrawing a webp as PNG would
    // only make the page larger.
    if (options.keepPastedRasters && isRasterDataUrl(src)) continue;
    const loaded = await readSource(src, ctx, options.attachments);
    if (!loaded) continue;
    let bytes = loaded.bytes;
    let info = imageInfo(bytes);
    const raw = !info && options.keepPastedRasters ? browserImageType(bytes) : null;
    if (raw) {
      // A redraw would only make the page larger, and the browser shows these as they are.
      images.set(src, { type: 'png', width: 0, height: 0, bytes, mime: raw, ...sizeOf(src) });
      continue;
    }
    if (!info) {
      // webp, avif, bmp and svg are redrawn as PNG; png, jpg and gif stay untouched.
      const png = await rasterise(bytes, loaded.type);
      info = png && imageInfo(png);
      if (png) bytes = png;
    }
    if (!info) continue;
    images.set(src, { ...info, bytes, ...sizeOf(src) });
  }
  return images;
}
