import { describe, expect, it } from 'vitest';
import { minimalChange } from './textDiff';

const apply = (s: string, c: ReturnType<typeof minimalChange>) =>
  c ? s.slice(0, c.from) + c.insert + s.slice(c.to) : s;

describe('minimalChange', () => {
  it('returns null for identical strings', () => {
    expect(minimalChange('abc', 'abc')).toBeNull();
  });

  it('isolates a word wrapped in bold', () => {
    const before = 'one two three';
    const after = 'one **two** three';
    const change = minimalChange(before, after);
    expect(apply(before, change)).toBe(after);
    expect(change!.to - change!.from).toBeLessThanOrEqual(3);
  });

  it('handles pure insertion, deletion and replacement', () => {
    for (const [a, b] of [
      ['', 'x'],
      ['x', ''],
      ['hello world', 'hello there world'],
      ['aaa', 'aa'],
      ['- a\n- b\n', '- a\n- c\n- b\n'],
    ] as const) {
      expect(apply(a, minimalChange(a, b))).toBe(b);
    }
  });
});
