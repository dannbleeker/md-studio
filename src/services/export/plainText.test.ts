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
});
