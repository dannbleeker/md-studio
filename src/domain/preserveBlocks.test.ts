import { describe, expect, it } from 'vitest';
import { type BlockRange, preserveUnchangedBlocks, splitBlocks } from './preserveBlocks';

/** Blocks = runs of non-blank lines, as offsets. */
function blocksOf(md: string): BlockRange[] {
  const out: BlockRange[] = [];
  const re = /[^\n]+(?:\n[^\n]+)*/g;
  for (let m = re.exec(md); m; m = re.exec(md))
    out.push({ start: m.index, end: m.index + m[0].length });
  return out;
}

/** Stand-in for parse + serialize: the serializer's style is `-` bullets, `**` strong, ATX. */
const norm = (s: string) =>
  s
    .replace(/^\* /gm, '- ')
    .replace(/__(.+?)__/g, '**$1**')
    .replace(/^(.+)\n=+$/m, '# $1')
    .trim();

/** What the visual pane emits: the whole document in serializer style. */
const serialize = (md: string) =>
  blocksOf(md)
    .map((b) => norm(md.slice(b.start, b.end)))
    .join('\n\n')
    .concat('\n');

const merge = (oldMd: string, newMd: string) =>
  preserveUnchangedBlocks(oldMd, newMd, blocksOf, norm).text;

describe('preserveUnchangedBlocks', () => {
  const source = 'Title\n=====\n\n* star\n* list\n\n__strong__ words\n\n\nlast para\n';

  it('keeps every untouched block exactly as written', () => {
    const edited = serialize(source).replace('last para', 'last paragraph');
    expect(merge(source, edited)).toBe(source.replace('last para', 'last paragraph'));
  });

  it('only the edited block takes the serializer style', () => {
    const edited = serialize(source).replace('- list', '- list item');
    expect(merge(source, edited)).toBe(
      'Title\n=====\n\n- star\n- list item\n\n__strong__ words\n\n\nlast para\n'
    );
  });

  it('handles an inserted block', () => {
    const edited = serialize(source).replace('**strong** words', '**strong** words\n\nNEW');
    expect(merge(source, edited)).toBe(
      'Title\n=====\n\n* star\n* list\n\n__strong__ words\n\nNEW\n\n\nlast para\n'
    );
  });

  it('handles a deleted block', () => {
    const edited = serialize(source).replace('**strong** words\n\n', '');
    expect(merge(source, edited)).toBe('Title\n=====\n\n* star\n* list\n\n\nlast para\n');
  });

  it('handles appending at the end and editing the first block', () => {
    expect(merge(source, `${serialize(source)}\nmore\n`)).toBe(`${source.trimEnd()}\n\nmore\n`);
    expect(merge(source, serialize(source).replace('# Title', '# Title!'))).toBe(
      source.replace('Title\n=====', '# Title!')
    );
  });

  it('reports a check window: the edit plus one neighbour each side', () => {
    const edited = serialize(source).replace('- list', '- list item');
    const r = preserveUnchangedBlocks(source, edited, blocksOf, norm);
    const c = r.check!;
    expect(r.text.slice(c.text.start, c.text.end)).toBe(
      'Title\n=====\n\n- star\n- list item\n\n__strong__ words'
    );
    expect(edited.slice(c.newMd.start, c.newMd.end)).toBe(
      '# Title\n\n- star\n- list item\n\n**strong** words'
    );
  });

  it('returns the new text when nothing can be kept', () => {
    expect(merge('a', 'b\n')).toBe('b\n');
    expect(merge('', 'x\n')).toBe('x\n');
  });
});

describe('splitBlocks', () => {
  const texts = (md: string) => splitBlocks(md).map((b) => md.slice(b.start, b.end));

  it('splits on blank lines', () => {
    expect(texts('# A\n\npara\nline 2\n\n\n- x\n- y\n')).toEqual([
      '# A',
      'para\nline 2',
      '- x\n- y',
    ]);
  });

  it('keeps fenced code whole across blank lines', () => {
    expect(texts('```js\na\n\nb\n```\n\nafter')).toEqual(['```js\na\n\nb\n```', 'after']);
    expect(texts('~~~\n\n```\n~~~')).toEqual(['~~~\n\n```\n~~~']);
  });

  it('handles empty and whitespace-only input', () => {
    expect(splitBlocks('')).toEqual([]);
    expect(splitBlocks('\n  \n')).toEqual([]);
  });

  it('does not open a fence on inline triple backticks or close one on an info line', () => {
    expect(texts('```npm i``` here\n\nnext')).toEqual(['```npm i``` here', 'next']);
    expect(texts('```\n```js\n\nstill code\n```\n\nafter')).toEqual([
      '```\n```js\n\nstill code\n```',
      'after',
    ]);
  });
});

describe('splitBlocks: headings and rules end the run they close', () => {
  const texts = (md: string) => splitBlocks(md).map((b) => md.slice(b.start, b.end));

  it('splits a heading from the text right under it', () => {
    expect(texts('# Title\nIntro\n\nSetext\n===\nAfter\n')).toEqual([
      '# Title',
      'Intro',
      'Setext\n===',
      'After',
    ]);
  });

  it('keeps front matter whole, as the visual pane parses it', () => {
    expect(texts('---\ntitle: Post\ndate: 2024\n---\n\nBody\n')).toEqual([
      '---\ntitle: Post\ndate: 2024\n---',
      'Body',
    ]);
    expect(texts('---\na: 1\n\nnot: split\n---\nBody\n')).toEqual([
      '---\na: 1\n\nnot: split\n---',
      'Body',
    ]);
    expect(texts('---\na: 1\n...\n\n---\n')).toEqual(['---\na: 1\n...', '---']);
    // Not at the start: a rule, then a setext heading.
    expect(texts('Intro\n\n---\ntitle: Post\n---\n')).toEqual(['Intro', '---', 'title: Post\n---']);
  });

  it('leaves fenced code and tables whole', () => {
    expect(texts('```\n# not a heading\n---\n```\n\n| a |\n|---|\n| 1 |\n')).toEqual([
      '```\n# not a heading\n---\n```',
      '| a |\n|---|\n| 1 |',
    ]);
  });
});
