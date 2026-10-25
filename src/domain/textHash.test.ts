import { describe, expect, it } from 'vitest';
import { textHash } from './textHash';

describe('textHash', () => {
  it('is stable for the same text and differs for nearby ones', () => {
    expect(textHash('graph TD; A-->B')).toBe(textHash('graph TD; A-->B'));
    const texts = ['', 'a', 'b', 'ab', 'ba', 'title: x', 'title: y', 'a'.repeat(1000)];
    expect(new Set(texts.map(textHash)).size).toBe(texts.length);
  });

  it('keeps the length apart from the hash', () => {
    expect(textHash('abc')).toMatch(/^3\.[0-9a-z]+$/);
    expect(textHash('')).toBe('0.45h');
  });
});
