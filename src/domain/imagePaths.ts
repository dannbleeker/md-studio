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

/** Types browsers name differently from the extension files of that type usually carry. */
const EXT_ALIASES: Record<string, string> = {
  apng: 'png',
  'x-png': 'png',
  pjpeg: 'jpg',
  jpg: 'jpg',
  'x-icon': 'ico',
  'vnd.microsoft.icon': 'ico',
};

/**
 * File extension for an image MIME type, or null when it names none that is
 * safe to use in a file name. Unlike imageExtension this does not pretend an
 * unknown type is a PNG: HEIC, TIFF and the like get their own extension.
 */
export function mimeExtension(mimeType: string): string | null {
  const type = mimeType.toLowerCase();
  const known = EXT_BY_TYPE[type];
  if (known !== undefined) return known;
  const m = /^image\/([a-z0-9][a-z0-9.+-]*)$/.exec(type);
  const sub = m?.[1];
  if (sub === undefined) return null;
  const alias = EXT_ALIASES[sub];
  if (alias !== undefined) return alias;
  const ext = (sub.split('+')[0] ?? '').replace(/^x-/, '');
  return /^[a-z0-9]{1,8}$/.test(ext) ? ext : null;
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

const INERT_SCHEME = /^(?:data|blob):/i;
const PREFIX = 64;

/**
 * Pasted images are `data:` URLs of megabytes, and the checks below run on
 * every view update. Those never need the whole string: a `data:` or `blob:`
 * scheme loads nothing from a server unless `//` follows it right away. So the
 * answer comes from a short prefix, read the way a browser does. Returns
 * null when the prefix cannot settle it (another scheme, or too much leading
 * junk to see past), and the caller does the full read.
 */
function inertSchemeIsWeb(src: string): boolean | null {
  const head = asBrowserReads(src.slice(0, PREFIX));
  if (!INERT_SCHEME.test(head) || head.length < 7) return null;
  return head.startsWith('//', 5);
}

/**
 * True for an image on another server (`https://…`, `//host/…`): loading
 * it tells that server the document was opened. Pasted (`data:`) and local
 * images are not web images. `http:/host/a.png` and `http:host/a.png` count
 * too: a browser reads both as `http://host/a.png`.
 */
export function isWebImage(src: string): boolean {
  const inert = inertSchemeIsWeb(src);
  if (inert !== null) return inert;
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
  // data: and blob: are schemes, whatever else the string holds.
  if (inertSchemeIsWeb(src) !== null) return false;
  return (
    src !== '' &&
    !hasControlCharacter(src) &&
    !/^(?:[a-z][a-z0-9+.-]*:|\/|#)/i.test(asBrowserReads(src))
  );
}
