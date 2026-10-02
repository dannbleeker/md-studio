import { marked, type Token } from 'marked';
import { dataUrlBytes, type ImageInfo, imageInfo } from '@/domain/imageInfo';
import { resolveRelativeImage } from '../images';

export type ExportImage = ImageInfo & { bytes: Uint8Array };
export type ExportImages = ReadonlyMap<string, ExportImage>;

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

/**
 * The document's images, ready to embed in a PDF or Word file: images
 * pasted into the document (data: URLs), and relative paths read from the
 * document's folder like the visual pane does. Web images are not fetched,
 * so exporting never contacts another server; those, and formats a
 * converter can't embed, fall back to their alt text.
 */
export async function loadExportImages(markdown: string): Promise<ExportImages> {
  const images = new Map<string, ExportImage>();
  for (const src of imageSources(marked.lexer(markdown), new Set())) {
    let bytes = dataUrlBytes(src);
    if (!bytes && !/^[a-z][a-z0-9+.-]*:/i.test(src)) {
      const url = await resolveRelativeImage(src);
      if (url) {
        try {
          bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
        } catch {
          bytes = null;
        }
      }
    }
    const info = bytes && imageInfo(bytes);
    if (bytes && info) images.set(src, { ...info, bytes });
  }
  return images;
}
