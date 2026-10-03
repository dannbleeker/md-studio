import { describe, expect, it } from 'vitest';
import { markdownToPlainText } from './plainText';

describe('markdownToPlainText', () => {
  it('strips inline formatting but keeps link targets', () => {
    expect(markdownToPlainText('A **bold** _move_ with `code` & [a link](https://x.dk).')).toBe(
      'A bold move with code & a link (https://x.dk).\n'
    );
  });

  it('keeps structure: headings, lists, tasks, quotes, tables, code', () => {
    const md = [
      '# Title',
      '## Section',
      '- one\n- [x] done\n  - nested',
      '3. third\n4. fourth',
      '> quoted',
      '| a | b |\n| - | - |\n| 1 | 2 |',
      '```\nconst x = 1 < 2;\n```',
      '---',
    ].join('\n\n');
    expect(markdownToPlainText(md)).toBe(
      `${[
        'Title\n=====',
        'Section\n-------',
        '- one\n- [x] done\n  - nested',
        '3. third\n4. fourth',
        '  quoted',
        'a\tb\n1\t2',
        'const x = 1 < 2;',
        '----',
      ].join('\n\n')}\n`
    );
  });

  it('handles an empty document', () => {
    expect(markdownToPlainText('')).toBe('\n');
  });

  it('decodes named HTML entities', () => {
    expect(markdownToPlainText('A &copy; B &hellip;')).toBe('A © B …\n');
  });

  it('keeps the indent of a leading quote and of leading code', () => {
    expect(markdownToPlainText('> quoted\n> line two\n\nafter')).toBe(
      '  quoted\n  line two\n\nafter\n'
    );
    expect(markdownToPlainText('```\n  x\n```')).toBe('  x\n');
  });

  it('underlines a heading as wide as it shows', () => {
    expect(markdownToPlainText('# 日本語')).toBe('日本語\n======\n');
    expect(markdownToPlainText('## Hi 👍🏽')).toBe('Hi 👍🏽\n-----\n');
  });

  it('lines nested content up with the text after a list marker', () => {
    expect(markdownToPlainText('10. ten\n    - nested')).toBe('10. ten\n    - nested\n');
    expect(markdownToPlainText('> - a\n>\n>   more')).not.toMatch(/^ +$/m);
  });

  it('keeps code exactly as written, entities included', () => {
    expect(markdownToPlainText('Use `&amp;` for &copy;')).toBe('Use &amp; for ©\n');
    expect(markdownToPlainText('```\n&copy;\n```')).toBe('&copy;\n');
  });
});
