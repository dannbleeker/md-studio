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

describe('fuzzyScore scoring', () => {
  // 1 per matched character, +2 when it directly follows the previous
  // match, +3 at a word start (string start, or after space : / -).
  it('scores a match at the start of the string', () => {
    expect(fuzzyScore('a', 'abc')).toBe(1 + 3);
  });

  it('adds a bonus for consecutive characters', () => {
    expect(fuzzyScore('ab', 'abc')).toBe(1 + 3 + (1 + 2));
  });

  it('gives no bonus to a lone match mid-word', () => {
    expect(fuzzyScore('d', 'abcd')).toBe(1);
  });

  it('treats space, colon, slash and hyphen as word starts', () => {
    for (const target of ['a b', 'a:b', 'a/b', 'a-b']) expect(fuzzyScore('b', target)).toBe(1 + 3);
    expect(fuzzyScore('b', 'a.b')).toBe(1);
  });

  it('matches spaces in the query without scoring them', () => {
    // a (1+3), space skipped, b (1 + 2 consecutive + 3 word start)
    expect(fuzzyScore('a b', 'a b')).toBe(4 + 6);
  });

  it('ignores surrounding whitespace in the query', () => {
    expect(fuzzyScore('  ', 'anything')).toBe(0);
    expect(fuzzyScore(' a ', 'a')).toBe(fuzzyScore('a', 'a'));
  });
});

describe('fuzzyFilter', () => {
  const id = (s: string) => s;

  it('drops items that do not match', () => {
    expect(fuzzyFilter(['alpha', 'beta', 'gamma'], 'ph', id)).toEqual(['alpha']);
  });

  it('moves a better match ahead of an earlier, weaker one', () => {
    // "save" matches "Discard changes, leave" loosely and "Save" at word start.
    expect(fuzzyFilter(['Discard changes and leave', 'Save'], 'sa', id)).toEqual([
      'Save',
      'Discard changes and leave',
    ]);
  });
});
