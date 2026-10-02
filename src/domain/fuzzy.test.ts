import { describe, expect, it } from 'vitest';
import { fuzzyFilter, fuzzyScore } from './fuzzy';

describe('fuzzy', () => {
  it('matches subsequences case-insensitively', () => {
    expect(fuzzyScore('sv', 'Save')).not.toBeNull();
    expect(fuzzyScore('xyz', 'Save')).toBeNull();
    expect(fuzzyScore('', 'anything')).toBe(0);
  });

  it('ranks word-start matches first', () => {
    const items = ['Toggle linked scroll', 'View: text only', 'View: visual only'];
    expect(fuzzyFilter(items, 'vt', (s) => s)[0]).toBe('View: text only');
  });

  it('keeps original order on ties and for empty queries', () => {
    const items = ['b', 'a', 'c'];
    expect(fuzzyFilter(items, '', (s) => s)).toEqual(items);
  });
});
