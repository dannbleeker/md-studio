import { marked } from 'marked';
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

  // The visual pane pairs headings by index, so the scanner must agree with
  // a real CommonMark parser on what counts as a top-level heading.
  const parserHeadings = (md: string) =>
    marked
      .lexer(md)
      .filter((t) => t.type === 'heading')
      .map((t) => (t as { text: string }).text);
  const cases: Record<string, string> = {
    inlineTripleBackticks: '# One\n\n```npm install``` runs it\n\n# Two\n\n# Three\n',
    fenceWithInfoInside: '# One\n\n```\n```js\n# not a heading\n```\n\n# Two\n',
    lazySetextAfterList: '# One\n\n- item\n  more text\n---\n\n# Two\n',
    setextInsideListItem: '# One\n\n1. item\n\n   sub para\n   ---\n\n# Two\n',
    htmlBlock: '# One\n\n<div>\n# inside html\n</div>\n\n# Two\n',
    htmlComment: '# One\n\n<!--\n# x\n-->\n\n# Two\n',
    atxAfterList: '- a\n# Heading\n',
    fenceAfterList: '- a\n```\n# code\n```\n\n# Real\n',
    quote: '> # quoted\n> text\n\n# Real\n',
  };
  for (const [name, md] of Object.entries(cases)) {
    it(`agrees with the parser: ${name}`, () => {
      expect(findHeadings(md).map((h) => h.text)).toEqual(parserHeadings(md));
    });
  }

  it('reads prose that merely starts with *, # or a number as a setext heading', () => {
    expect(findHeadings('*Intro* text\n---')).toEqual([
      { line: 0, level: 2, text: '*Intro* text' },
    ]);
    expect(findHeadings('#tag\n===')).toEqual([{ line: 0, level: 1, text: '#tag' }]);
    expect(findHeadings('1.5 m\n---')).toEqual([{ line: 0, level: 2, text: '1.5 m' }]);
  });

  it('does not read a thematic break as the start of a paragraph', () => {
    expect(findHeadings('***\n---')).toEqual([]);
    expect(findHeadings('- - -\n===')).toEqual([]);
  });
});
