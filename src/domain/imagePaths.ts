/**
 * File naming and paths for images saved next to a document.
 */

const EXT_BY_TYPE: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'image/avif': 'avif',
};

export function imageExtension(mimeType: string): string {
  return EXT_BY_TYPE[mimeType] ?? 'png';
}

/** "image-20261002-171530.png", with "-2", "-3"… appended when the name is taken. */
export function imageFileName(when: Date, ext: string, taken: (name: string) => boolean): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${when.getFullYear()}${pad(when.getMonth() + 1)}${pad(when.getDate())}-${pad(when.getHours())}${pad(when.getMinutes())}${pad(when.getSeconds())}`;
  let name = `image-${stamp}.${ext}`;
  for (let i = 2; taken(name); i++) name = `image-${stamp}-${i}.${ext}`;
  return name;
}

/**
 * Relative URL from the document to an image, both given as path segments
 * from the same root folder (as FileSystemDirectoryHandle.resolve returns
 * them). Segments are percent-encoded so spaces and the like stay valid
 * Markdown link targets.
 */
export function relativeImagePath(
  docPath: readonly string[],
  imagePath: readonly string[]
): string {
  const docDir = docPath.slice(0, -1);
  let common = 0;
  while (
    common < docDir.length &&
    common < imagePath.length - 1 &&
    docDir[common] === imagePath[common]
  ) {
    common++;
  }
  const up = docDir.slice(common).map(() => '..');
  return [...up, ...imagePath.slice(common)]
    .map((s) => (s === '..' ? s : encodeURIComponent(s)))
    .join('/');
}

/**
 * The URL as a browser reads it: leading control characters and spaces go,
 * tabs and line breaks are removed anywhere, and a backslash counts as a
 * slash. `ht\ttps://host/a.png` and `\\host/a.png` both name another
 * server although the raw text does not look like it.
 */
function asBrowserReads(src: string): string {
  let start = 0;
  while (start < src.length && src.charCodeAt(start) <= 0x20) start++;
  return src
    .slice(start)
    .replace(/[\t\n\r]/g, '')
    .replaceAll('\\', '/');
}

function hasControlCharacter(src: string): boolean {
  for (let i = 0; i < src.length; i++) {
    const code = src.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

/**
 * True for an image on another server (`https://…`, `//host/…`): loading
 * it tells that server the document was opened. Pasted (`data:`) and local
 * images are not web images. `http:/host/a.png` and `http:host/a.png` count
 * too: a browser reads both as `http://host/a.png`.
 */
export function isWebImage(src: string): boolean {
  const read = asBrowserReads(src);
  return /^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(read) || /^https?:/i.test(read);
}

/**
 * A pasted raster image (`data:` + base64) a browser can show as it is. SVG
 * stays out: it can carry script.
 */
export function isRasterDataUrl(src: string): boolean {
  return /^data:image\/(?:png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+$/i.test(src);
}

/**
 * True for a relative link target (no scheme, not absolute, not a fragment).
 * A target a browser would read differently from how it looks (a control
 * character in it, a leading backslash) is not one.
 */
export function isRelativeUrl(src: string): boolean {
  return (
    src !== '' &&
    !hasControlCharacter(src) &&
    !/^(?:[a-z][a-z0-9+.-]*:|\/|#)/i.test(asBrowserReads(src))
  );
}
