import { describe, expect, it } from 'vitest';
import { type CodeRange, codeRanges, inCode } from './codeRegions';

const covered = (text: string): string =>
  codeRanges(text)
    .map((r) => text.slice(r.start, r.end))
    .join('|');

describe('codeRanges', () => {
  it('finds top-level fences, indented blocks and inline spans', () => {
    expect(covered('a\n```\nx\n```\nb')).toBe('```\nx\n```');
    expect(covered('a\n\n    x\n\nb `c` d')).toBe('    x|`c`');
    expect(covered('~~~\nx\n~~~')).toBe('~~~\nx\n~~~');
  });

  it('closes a fence opened on a bullet line at its own indent', () => {
    expect(covered('- ```\n  a\n  ```\n\nafter')).toBe('- ```\n  a\n  ```');
    expect(covered('1. ```\n   a\n   ```\n   after')).toBe('1. ```\n   a\n   ```');
  });

  it('follows fences into list items and quotes', () => {
    expect(covered('- a\n    ```\n    x\n    ```\nb')).toBe('    ```\n    x\n    ```');
    expect(covered('> ```\n> x\n> ```\nb')).toBe('> ```\n> x\n> ```');
    expect(covered('> ```\n> x\nb')).toBe('> ```\n> x');
  });

  it('ends a fence when its container ends', () => {
    expect(covered('- ```\n  x\ny')).toBe('- ```\n  x');
    expect(covered('> ```\n> x\n\n![[a.png]]')).toBe('> ```\n> x');
  });

  it('treats an indented line after a heading as code only when the rules say so', () => {
    expect(covered('# H\n    x')).toBe('    x');
    expect(covered('para\n    x')).toBe('');
  });

  it('pairs a code span across the lines of a paragraph, not across blocks', () => {
    expect(covered('`a\nb` c')).toBe('`a\nb`');
    expect(covered('`a\n\nb`')).toBe('');
    expect(covered('`a\n# b`')).toBe('');
    expect(covered('> `a\n> b` c')).toBe('`a\n> b`');
  });

  it('lets a backslash shorten an opening run only', () => {
    expect(covered('\\`a`')).toBe('');
    expect(covered('\\``a`')).toBe('`a`');
    expect(covered('`a\\` b')).toBe('`a\\`');
  });

  it('keeps a code span inside one table cell', () => {
    expect(covered('| a |\n| - |\n| `x |')).toBe('');
    expect(covered('| a | b |\n| - | - |\n| `x \\| y` | z |')).toBe('`x \\| y`');
  });

  it('does not open a span on a backtick inside raw HTML or an autolink', () => {
    expect(covered('<a href="`">x`')).toBe('');
    expect(covered('<http://a`b> `c`')).toBe('`c`');
  });

  it('keeps fence-like lines inside an HTML block from opening a fence', () => {
    expect(covered('<div>\n```\nx\n```\n</div>')).toBe('');
    expect(covered('<div>\n</div>\n\n```\nx\n```')).toBe('```\nx\n```');
  });

  it('follows the parser on a lone HTML tag line that would continue a paragraph', () => {
    // The tag starts a block inside the list item, which then ends where the item does.
    expect(covered('- a\n<span>\n    x')).toBe('');
    expect(covered('   - a\n<span>\n    x')).toBe('    x');
    expect(covered('a\n<span>\n    x')).toBe('');
  });

  it('does not take a setext underline for a paragraph of definitions', () => {
    expect(covered('[a]: /u\n--\n    x')).toBe('');
    expect(covered('a\n--\n    x')).toBe('    x');
  });

  it('starts at the given line', () => {
    expect(covered('```\n')).toBe('```');
    expect(codeRanges('---\n```\n---\n`a`', 12).map((r) => r.start)).toEqual([12]);
  });

  it('reports ranges in order and merges adjacent block lines', () => {
    const ranges = codeRanges('```\na\nb\n```\n\n`c`');
    expect(ranges).toEqual([
      { start: 0, end: 11, block: true },
      { start: 13, end: 16, block: false },
    ]);
  });

  it('answers membership by binary search', () => {
    const ranges: CodeRange[] = [
      { start: 2, end: 4, block: false },
      { start: 8, end: 9, block: true },
    ];
    const hits = [0, 1, 2, 3, 4, 7, 8, 9].map((p) => inCode(ranges, p));
    expect(hits).toEqual([false, false, true, true, false, false, true, false]);
    expect(inCode([], 0)).toBe(false);
  });

  it('stays quick on very deep and very wide input', { tags: ['stress'] }, () => {
    const started = performance.now();
    codeRanges(`${'>'.repeat(200_000)} x`);
    codeRanges(`${'- '.repeat(100_000)}x`);
    codeRanges(`${'<a '.repeat(50_000)}\n${'`a '.repeat(50_000)}`);
    codeRanges(`${'`'.repeat(1000)} ${'`a'.repeat(30_000)}`);
    expect(performance.now() - started).toBeLessThan(3000);
  });

  it('stays quick on a wide non-matching line before a setext underline', {
    tags: ['stress'],
  }, () => {
    // Two adjacent blank runs in the definition test backtracked quadratically.
    const started = performance.now();
    codeRanges(`[a]: x${' '.repeat(50_000)}y\n---\n`);
    expect(performance.now() - started).toBeLessThan(500);
  });

  it('still reads a definition with padding as no text for a setext underline', () => {
    // A paragraph of definitions only is not a heading, so the dashes are a break.
    const spans = (md: string) => codeRanges(md).map((r) => md.slice(r.start, r.end));
    expect(spans('[a]:   x   "t"  \n---\n`c`\n')).toEqual(spans('[a]: x "t"\n---\n`c`\n'));
    expect(spans('[a]:   x   "t"  \n---\n`c`\n')).toEqual(['`c`']);
  });
});
