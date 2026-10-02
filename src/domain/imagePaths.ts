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
 * True for an image on another server (`https://…`, `//host/…`): loading
 * it tells that server the document was opened. Pasted (`data:`) and local
 * images are not web images.
 */
export function isWebImage(src: string): boolean {
  return /^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(src.trim());
}

/** True for a relative link target (no scheme, not absolute, not a fragment). */
export function isRelativeUrl(src: string): boolean {
  return src !== '' && !/^(?:[a-z][a-z0-9+.-]*:|\/|#)/i.test(src);
}
