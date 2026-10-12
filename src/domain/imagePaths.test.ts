import { describe, expect, it } from 'vitest';
import {
  imageExtension,
  imageFileName,
  isRasterDataUrl,
  isRelativeUrl,
  isWebImage,
  relativeImagePath,
} from './imagePaths';

describe('imagePaths', () => {
  it('picks an extension from the MIME type', () => {
    expect(imageExtension('image/jpeg')).toBe('jpg');
    expect(imageExtension('image/svg+xml')).toBe('svg');
    expect(imageExtension('application/octet-stream')).toBe('png');
  });

  it('names images by timestamp and avoids collisions', () => {
    const when = new Date(2026, 9, 2, 17, 5, 9);
    const taken = new Set(['image-20261002-170509.png', 'image-20261002-170509-2.png']);
    expect(imageFileName(when, 'png', () => false)).toBe('image-20261002-170509.png');
    expect(imageFileName(when, 'png', (n) => taken.has(n))).toBe('image-20261002-170509-3.png');
  });

  it('computes relative paths from the document to the image', () => {
    expect(relativeImagePath(['notes.md'], ['images', 'a.png'])).toBe('images/a.png');
    expect(relativeImagePath(['docs', 'notes.md'], ['docs', 'images', 'a.png'])).toBe(
      'images/a.png'
    );
    expect(relativeImagePath(['docs', 'sub', 'n.md'], ['images', 'a b.png'])).toBe(
      '../../images/a%20b.png'
    );
  });

  it('recognises relative URLs', () => {
    expect(isRelativeUrl('images/a.png')).toBe(true);
    expect(isRelativeUrl('../a.png')).toBe(true);
    expect(isRelativeUrl('https://x.dk/a.png')).toBe(false);
    expect(isRelativeUrl('data:image/png;base64,xx')).toBe(false);
    expect(isRelativeUrl('/abs.png')).toBe(false);
    expect(isRelativeUrl('')).toBe(false);
  });

  it('rejects targets a browser would read as another server', () => {
    for (const src of [
      'ht\ttps://evil.example/a.png',
      'ht\ntps://evil.example/a.png',
      '\\\\evil.example/a.png',
      '\\evil.example/a.png',
      '/\\evil.example/a.png',
      ' //evil.example/a.png',
      'images/a\tb.png',
    ])
      expect(isRelativeUrl(src), JSON.stringify(src)).toBe(false);
  });
});

describe('isWebImage', () => {
  it('is true for images on another server', () => {
    for (const src of [
      'https://example.com/a.png',
      'http://example.com/a.png',
      'HTTPS://example.com/a.png',
      '//example.com/a.png',
      ' https://example.com/a.png',
      'ht\ttps://evil.example/a.png',
      'https:/\t/evil.example/a.png',
      'ht\ntps://evil.example/a.png',
      '\\\\evil.example/a.png',
      '/\\evil.example/a.png',
      '\\/evil.example/a.png',
      '\u0001https://evil.example/a.png',
      // Browsers read these as http(s)://evil.example/a.png.
      'http:/evil.example/a.png',
      'http:evil.example/a.png',
      'HTTP:evil.example/a.png',
      'https:/evil.example/a.png',
      'ht\ttp:evil.example/a.png',
    ])
      expect(isWebImage(src), src).toBe(true);
  });

  it('is false for pasted, local and relative images', () => {
    for (const src of [
      'data:image/png;base64,AAAA',
      'blob:x',
      'images/a.png',
      '/a.png',
      'a.png',
      '',
    ])
      expect(isWebImage(src), src).toBe(false);
  });
});

describe('isRasterDataUrl', () => {
  it('accepts pasted raster images, webp included', () => {
    for (const type of ['png', 'jpeg', 'gif', 'webp']) {
      expect(isRasterDataUrl(`data:image/${type};base64,QUJD`), type).toBe(true);
    }
  });

  it('rejects SVG, other schemes and data that is not base64', () => {
    expect(isRasterDataUrl('data:image/svg+xml;base64,QUJD')).toBe(false);
    expect(isRasterDataUrl('data:image/png,QUJD')).toBe(false);
    expect(isRasterDataUrl('data:text/html;base64,QUJD')).toBe(false);
    expect(isRasterDataUrl('https://x.dk/a.png')).toBe(false);
  });
});

describe('large data: and blob: URLs', () => {
  // The scans must not read a multi-megabyte pasted image to say "not a web
  // image". Bounds are generous (the full scans took 5-30 ms per call here).
  const big = `data:image/png;base64,${'A'.repeat(5_000_000)}`;

  it('answers without reading the whole string', () => {
    const started = performance.now();
    for (let i = 0; i < 50; i += 1) {
      expect(isWebImage(big)).toBe(false);
      expect(isRelativeUrl(big)).toBe(false);
    }
    expect(performance.now() - started).toBeLessThan(100);
  });

  it('keeps the browser reading of the scheme prefix', () => {
    for (const src of [
      '  data:image/png;base64,AAAA',
      'da\tta:image/png;base64,AAAA',
      '\u0001DATA:image/png;base64,AAAA',
      'blob:https://x.dk/uuid',
      'BLOB:null/uuid',
    ]) {
      expect(isWebImage(src), src).toBe(false);
      expect(isRelativeUrl(src), src).toBe(false);
    }
  });

  it('still treats a data: or blob: scheme followed by // as a web image', () => {
    expect(isWebImage('data://evil.example/a.png')).toBe(true);
    expect(isWebImage('blob:\\\\evil.example/a.png')).toBe(true);
  });
});
