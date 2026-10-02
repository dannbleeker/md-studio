/**
 * Format and pixel size of a raster image from its first bytes, so the
 * exporters can embed it at the right proportions without decoding it.
 * PNG, JPEG and GIF only: what Word embeds natively (PDF takes the first
 * two). Anything else returns null and the exporter falls back to alt text.
 */
export type ImageInfo = { type: 'png' | 'jpg' | 'gif'; width: number; height: number };

export function imageInfo(bytes: Uint8Array): ImageInfo | null {
  const at = (i: number) => bytes[i] ?? 0;
  const u16be = (i: number) => (at(i) << 8) | at(i + 1);
  const u32be = (i: number) =>
    ((at(i) << 24) | (at(i + 1) << 16) | (at(i + 2) << 8) | at(i + 3)) >>> 0;

  // PNG: signature, then the IHDR chunk holds width and height.
  if (at(0) === 0x89 && at(1) === 0x50 && at(2) === 0x4e && at(3) === 0x47) {
    const width = u32be(16);
    const height = u32be(20);
    return width && height ? { type: 'png', width, height } : null;
  }
  // GIF: "GIF8", then little-endian logical screen size.
  if (at(0) === 0x47 && at(1) === 0x49 && at(2) === 0x46 && at(3) === 0x38) {
    const width = at(6) | (at(7) << 8);
    const height = at(8) | (at(9) << 8);
    return width && height ? { type: 'gif', width, height } : null;
  }
  // JPEG: walk the segments to the first start-of-frame marker.
  if (at(0) === 0xff && at(1) === 0xd8) {
    let i = 2;
    while (i + 9 < bytes.length) {
      if (at(i) !== 0xff) return null;
      const marker = at(i + 1);
      if (marker === 0xd9 || marker === 0xda) return null;
      const isFrame = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
      if (isFrame) {
        const height = u16be(i + 5);
        const width = u16be(i + 7);
        return width && height ? { type: 'jpg', width, height } : null;
      }
      i += 2 + u16be(i + 2);
    }
  }
  return null;
}

/** Bytes of a base64 `data:image/...` URL, or null for anything else. */
export function dataUrlBytes(src: string): Uint8Array | null {
  const m = /^data:image\/[\w.+-]+;base64,([A-Za-z0-9+/=\s]+)$/i.exec(src);
  if (!m?.[1]) return null;
  try {
    const bin = atob(m[1].replace(/\s+/g, ''));
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}
