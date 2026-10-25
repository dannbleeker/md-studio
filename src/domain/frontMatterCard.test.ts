import { describe, expect, it } from 'vitest';
import { parseFrontMatterCard } from './frontMatterCard';

describe('parseFrontMatterCard', () => {
  it('reads a title, plain fields and both list forms of tags', () => {
    const card = parseFrontMatterCard(
      ['title: "My: note"', 'date: 2026-10-21', 'tags: [a, "b c", #d]', 'author: Dann # me'].join(
        '\n'
      )
    );
    expect(card).toEqual({
      title: 'My: note',
      tags: ['a', 'b c', 'd'],
      fields: [
        { key: 'date', value: '2026-10-21' },
        { key: 'author', value: 'Dann' },
      ],
    });
  });

  it('reads block lists and comma-separated tags', () => {
    expect(parseFrontMatterCard('tags:\n  - one\n  - two\nkeywords: x, y')?.tags).toEqual([
      'one',
      'two',
      'x',
      'y',
    ]);
  });

  it('leaves out block scalars, maps and empty values', () => {
    expect(parseFrontMatterCard('summary: |\n  long\nmeta: {a: 1}\nempty:\n')).toBeNull();
  });

  it('keeps the first title and caps long values and many fields', () => {
    const many = Array.from({ length: 30 }, (_, i) => `k${i}: v`).join('\n');
    const card = parseFrontMatterCard(`title: A\ntitle: B\nlong: ${'x'.repeat(500)}\n${many}`);
    expect(card?.title).toBe('A');
    expect(card?.fields).toHaveLength(12);
    expect(card?.fields[0]?.value).toHaveLength(200);
  });

  it('returns null for text with nothing in it', () => {
    expect(parseFrontMatterCard('')).toBeNull();
    expect(parseFrontMatterCard('just words')).toBeNull();
  });

  it('stays linear on a huge block', { tags: ['stress'] }, () => {
    const time = (n: number) => {
      const yaml = Array.from({ length: n }, () => `a: ${'x'.repeat(100)}`).join('\n');
      const start = performance.now();
      parseFrontMatterCard(yaml);
      return performance.now() - start;
    };
    time(1000);
    const small = Math.max(time(20_000), 1);
    const large = time(40_000);
    expect(large).toBeLessThan(small * 6);
  });
});
