import { describe, expect, it } from 'vitest';
import { findHeadings } from './headings';

describe('findHeadings', () => {
  it('finds ATX headings with level and text', () => {
    const md = '# Title\n\ntext\n\n### Third ###\n';
    expect(findHeadings(md)).toEqual([
      { line: 0, level: 1, text: 'Title' },
      { line: 4, level: 3, text: 'Third' },
    ]);
  });

  it('ignores headings inside fenced code', () => {
    const md = '```md\n# not a heading\n```\n# real\n~~~\n## nope\n~~~';
    expect(findHeadings(md).map((h) => h.text)).toEqual(['real']);
  });

  it('ignores indented code, block quotes and list items', () => {
    const md = '    # code\n> # quote\n- # item\n#hashtag';
    expect(findHeadings(md)).toEqual([]);
  });

  it('treats a paragraph underlined with = or - as a setext heading', () => {
    const md = 'Big\n===\n\nTwo lines\nof title\n---\n';
    expect(findHeadings(md)).toEqual([
      { line: 0, level: 1, text: 'Big' },
      { line: 3, level: 2, text: 'Two lines of title' },
    ]);
  });

  it('does not treat a thematic break after a blank line as a heading', () => {
    expect(findHeadings('text\n\n---\n')).toEqual([]);
  });

  it('accepts an empty ATX heading', () => {
    expect(findHeadings('#\n')).toEqual([{ line: 0, level: 1, text: '' }]);
  });
});
