import { describe, expect, it } from 'vitest';
import {
  imageExtension,
  imageFileName,
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
});

describe('isWebImage', () => {
  it('is true for images on another server', () => {
    for (const src of [
      'https://example.com/a.png',
      'http://example.com/a.png',
      'HTTPS://example.com/a.png',
      '//example.com/a.png',
      ' https://example.com/a.png',
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
