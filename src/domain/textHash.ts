/**
 * A small, fast, stable hash of a text (djb2, with the length so texts of
 * different sizes rarely meet), for keying views and caches on content.
 * Not for anything that must resist a crafted collision.
 */
export function textHash(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return `${text.length.toString(36)}.${(h >>> 0).toString(36)}`;
}
