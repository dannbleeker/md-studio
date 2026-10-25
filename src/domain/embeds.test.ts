import { describe, expect, it } from 'vitest';
import { OBSIDIAN_SAMPLE } from '../../test/fixtures/obsidianNote';
import {
  classifyTarget,
  EMBED_NODE_NAME,
  embedTokenFor,
  findWikiRefs,
  formatSize,
  isAttachmentExtension,
  parseAltSize,
  parseWikiRef,
  splitLinkTarget,
  unescapeMarkdownText,
  wikilinkLabel,
} from './embeds';

const raws = (text: string, opts?: Parameters<typeof findWikiRefs>[1]) =>
  findWikiRefs(text, opts).map((r) => r.raw);

describe('classifyTarget', () => {
  it('classifies by lower-cased extension', () => {
    expect(EMBED_NODE_NAME).toBe('embed');
    expect(classifyTarget('a.PNG')).toBe('image');
    expect(classifyTarget('dir/a.avif')).toBe('image');
    expect(classifyTarget('x.pdf')).toBe('pdf');
    expect(classifyTarget('x.oga')).toBe('audio');
    expect(classifyTarget('x.opus')).toBe('audio');
    expect(classifyTarget('x.webm')).toBe('video');
    expect(classifyTarget('x.mkv')).toBe('video');
  });

  it('treats md, no extension and empty as notes', () => {
    expect(classifyTarget('Note.md')).toBe('note');
    expect(classifyTarget('Note')).toBe('note');
    expect(classifyTarget('')).toBe('note');
    expect(classifyTarget('dir.v2/Note')).toBe('note');
  });

  it('reports other for unknown extensions, dotted note names included', () => {
    expect(classifyTarget('x.zip')).toBe('other');
    expect(classifyTarget('a.canvas')).toBe('other');
    expect(classifyTarget('Note v1.2')).toBe('other');
  });

  it('knows attachment extensions', () => {
    for (const ext of ['png', 'pdf', 'mp3', 'mp4', 'flac'])
      expect(isAttachmentExtension(ext)).toBe(true);
    for (const ext of ['md', '', 'zip', 'canvas']) expect(isAttachmentExtension(ext)).toBe(false);
  });
});

describe('wikilinkLabel', () => {
  const label = (raw: string) => {
    const ref = parseWikiRef(raw);
    return ref ? wikilinkLabel(ref) : null;
  };
  it('shows the alias, else the note and heading', () => {
    expect(label('[[Note|Shown]]')).toBe('Shown');
    expect(label('[[Note#Part]]')).toBe('Note > Part');
    expect(label('[[#Part]]')).toBe('Part');
    expect(label('[[Note]]')).toBe('Note');
  });
});

describe('parseWikiRef', () => {
  it('parses a plain embed', () => {
    const ref = parseWikiRef('![[a.png]]');
    expect(ref).toMatchObject({
      embed: true,
      start: 0,
      end: 10,
      raw: '![[a.png]]',
      target: 'a.png',
      fragment: null,
      options: [],
      kind: 'image',
      size: null,
      alt: null,
      pdf: null,
    });
  });

  it('reads width, both dimensions and alt for images', () => {
    expect(parseWikiRef('![[a.png|300]]')?.size).toEqual({ width: 300, height: null });
    expect(parseWikiRef('![[a.png|300x200]]')?.size).toEqual({ width: 300, height: 200 });
    const both = parseWikiRef('![[a.png|alt|300x200]]');
    expect(both?.size).toEqual({ width: 300, height: 200 });
    expect(both?.alt).toBe('alt');
    const alt = parseWikiRef('![[a.png|some alt text]]');
    expect(alt?.size).toBeNull();
    expect(alt?.alt).toBe('some alt text');
  });

  it('rejects out-of-range sizes and an upper-case X', () => {
    expect(parseWikiRef('![[a.png|0]]')?.size).toBeNull();
    expect(parseWikiRef('![[a.png|10001]]')?.size).toBeNull();
    expect(parseWikiRef('![[a.png|10000]]')?.size?.width).toBe(10000);
    expect(parseWikiRef('![[a.png|300X200]]')?.size).toBeNull();
    expect(parseWikiRef('![[a.png|300x0]]')?.size).toBeNull();
  });

  it('keeps numbers as alias for notes, audio, other files and links', () => {
    const note = parseWikiRef('![[Note|2024]]');
    expect(note?.size).toBeNull();
    expect(note?.alt).toBe('2024');
    expect(parseWikiRef('![[s.mp3|300]]')?.alt).toBe('300');
    expect(parseWikiRef('![[x.zip|300]]')?.size).toBeNull();
    const link = parseWikiRef('[[Note|alias]]');
    expect(link).toMatchObject({ embed: false, alt: 'alias', size: null });
    expect(parseWikiRef('[[a.png|300]]')?.size).toBeNull();
  });

  it('sizes pdf and video embeds', () => {
    expect(parseWikiRef('![[x.pdf|500]]')?.size?.width).toBe(500);
    expect(parseWikiRef('![[v.mp4|640]]')?.size?.width).toBe(640);
  });

  it('keeps dotted note names as other without a size', () => {
    const ref = parseWikiRef('![[Note v1.2]]');
    expect(ref?.kind).toBe('other');
    expect(ref?.size).toBeNull();
  });

  it('splits a fragment at the first hash', () => {
    expect(parseWikiRef('![[Note#Heading]]')).toMatchObject({
      target: 'Note',
      fragment: 'Heading',
    });
    expect(parseWikiRef('![[Note#H1#H2]]')).toMatchObject({ target: 'Note', fragment: 'H1#H2' });
    expect(parseWikiRef('![[Note#^blk]]')?.fragment).toBe('^blk');
    expect(parseWikiRef('![[Note#Heading|shown]]')).toMatchObject({
      fragment: 'Heading',
      alt: 'shown',
    });
  });

  it('accepts an empty target for the current note', () => {
    expect(parseWikiRef('![[#Heading]]')).toMatchObject({
      target: '',
      fragment: 'Heading',
      kind: 'note',
    });
    expect(parseWikiRef('![[#^id]]')).toMatchObject({ target: '', fragment: '^id', kind: 'note' });
  });

  it('parses pdf page and height from the fragment', () => {
    expect(parseWikiRef('![[x.pdf#page=3&height=400]]')?.pdf).toEqual({ page: 3, height: 400 });
    expect(parseWikiRef('![[x.pdf#height=400]]')?.pdf).toEqual({ page: null, height: 400 });
    expect(parseWikiRef('![[x.pdf#page=2]]')?.pdf).toEqual({ page: 2, height: null });
    expect(parseWikiRef('![[x.pdf]]')?.pdf).toEqual({ page: null, height: null });
    expect(parseWikiRef('![[a.png#page=3]]')?.pdf).toBeNull();
  });

  it('trims the target and options but keeps raw', () => {
    const ref = parseWikiRef('![[ a.png | alt | 300 ]]');
    expect(ref).toMatchObject({ target: 'a.png', alt: 'alt', raw: '![[ a.png | alt | 300 ]]' });
    expect(ref?.size?.width).toBe(300);
  });

  it('unescapes pipes written for table cells', () => {
    const cell = parseWikiRef('![[a.png\\|300]]');
    expect(cell).toMatchObject({
      target: 'a.png',
      kind: 'image',
      size: { width: 300, height: null },
      raw: '![[a.png\\|300]]',
    });
    const alt = parseWikiRef('![[a.png\\|alt\\|100x50]]');
    expect(alt).toMatchObject({ target: 'a.png', alt: 'alt', size: { width: 100, height: 50 } });
  });

  it('rejects malformed tokens', () => {
    for (const raw of [
      '![[]]',
      '![[ ]]',
      '![[a[b]]',
      '![[a]b]]',
      '![[a\nb]]',
      '[[a]',
      'a.png',
      '![[a]]x',
    ]) {
      expect(parseWikiRef(raw)).toBeNull();
    }
    expect(parseWikiRef(`![[${'a'.repeat(1025)}]]`)).toBeNull();
    expect(parseWikiRef(`![[${'a'.repeat(1024)}]]`)).not.toBeNull();
  });
});

describe('findWikiRefs', () => {
  it('finds two tokens on one line with correct offsets', () => {
    const text = 'x ![[a.png]] y [[B]] z';
    const refs = findWikiRefs(text);
    expect(refs.map((r) => [r.start, r.end, r.embed])).toEqual([
      [2, 12, true],
      [15, 20, false],
    ]);
    for (const r of refs) expect(text.slice(r.start, r.end)).toBe(r.raw);
  });

  it('skips backtick and tilde fences, longer fences and unterminated fences', () => {
    expect(raws('```\n![[a.png]]\n```\n![[b.png]]')).toEqual(['![[b.png]]']);
    expect(raws('~~~\n![[a.png]]\n~~~\n![[b.png]]')).toEqual(['![[b.png]]']);
    expect(raws('````\n```\n![[a.png]]\n```\n````\n![[b.png]]')).toEqual(['![[b.png]]']);
    expect(raws('```\n![[a.png]]\n~~~\n![[b.png]]')).toEqual([]);
    expect(raws('text\n```js\n![[a.png]]\nnever closed')).toEqual([]);
  });

  it('does not let an inline triple-backtick line open a fence', () => {
    expect(raws('```npm i```\n![[a.png]]')).toEqual(['![[a.png]]']);
  });

  it('skips indented code but not paragraph continuations', () => {
    expect(raws('para\n\n    ![[a.png]]\n\n![[b.png]]')).toEqual(['![[b.png]]']);
    expect(raws('para\n    ![[a.png]]')).toEqual(['![[a.png]]']);
  });

  it('skips inline code spans, double-backtick spans included', () => {
    expect(raws('`![[a.png]]` ![[b.png]]')).toEqual(['![[b.png]]']);
    expect(raws('`` a ` ![[a.png]] `` ![[b.png]]')).toEqual(['![[b.png]]']);
    expect(raws('a `![[x.png]]`b ![[y.png]]')).toEqual(['![[y.png]]']);
  });

  it('pairs backtick runs of equal length only', () => {
    // Two backticks never close a three-backtick opener, so nothing is code.
    expect(raws('``` ![[a.png]] `` ![[b.png]]')).toEqual(['![[a.png]]', '![[b.png]]']);
  });

  it('finds a token after an unmatched lone backtick', () => {
    expect(raws('it`s ![[a.png]]')).toEqual(['![[a.png]]']);
  });

  it('honours escapes', () => {
    expect(raws('\\![[a.png]]')).toEqual(['[[a.png]]']);
    expect(raws('!\\[[a.png]]')).toEqual([]);
    expect(raws('\\[[a]]')).toEqual([]);
    expect(raws('\\\\![[a.png]]')).toEqual(['![[a.png]]']);
  });

  it('reads an escaped bang before [[ as a plain link after a literal bang', () => {
    const text = 'x \\![[Note]] y';
    const [ref] = findWikiRefs(text);
    expect(ref).toMatchObject({ embed: false, raw: '[[Note]]', start: 4, end: 12 });
    expect(text.slice(ref?.start, ref?.end)).toBe('[[Note]]');
    expect(raws('\\![[Note]] \\\\![[a.png]]')).toEqual(['[[Note]]', '![[a.png]]']);
  });

  it('closes a fence opened on a bullet line at its own indent (embeds after it count)', () => {
    expect(raws('- ```\n  a\n  ```\n\n![[y.png]]')).toEqual(['![[y.png]]']);
    expect(raws('- ```\n  a\n  ```\n  ![[x.png]]')).toEqual(['![[x.png]]']);
    expect(raws('1. ```\n   a\n   ```\n\n![[y.png]]')).toEqual(['![[y.png]]']);
    expect(raws('- ```\n  ![[a.png]]\n  ```\n![[b.png]]')).toEqual(['![[b.png]]']);
  });

  it('skips fences and indented code nested in list items and quotes', () => {
    expect(raws('- a\n    ```\n    ![[t.png]]\n    ```')).toEqual([]);
    expect(raws('> ```\n> ![[t.png]]\n> ```')).toEqual([]);
    expect(raws('1. a\n\n    ```\n    ![[t.png]]\n    ```')).toEqual([]);
    expect(raws('>     ![[t.png]]')).toEqual([]);
    expect(raws('# H\n    ![[t.png]]')).toEqual([]);
    expect(raws('> ```\n> ![[t.png]]\n\n![[u.png]]')).toEqual(['![[u.png]]']);
  });

  it('skips a code span that wraps over a line break', () => {
    expect(raws('`a\n![[x.png]]`')).toEqual([]);
    expect(raws('para `a\n![[x.png|300]]` tail ![[y.png]]')).toEqual(['![[y.png]]']);
    expect(raws('``\n![[x.png]]\n``')).toEqual([]);
    expect(raws('para\n    ```\n![[x.png]]\n    ```')).toEqual([]);
    // A blank line or another block ends the paragraph, so the backtick stays literal.
    expect(raws('`a\n\n![[x.png]]`')).toEqual(['![[x.png]]']);
    expect(raws('`a\n# ![[x.png]]`')).toEqual(['![[x.png]]']);
  });

  it('keeps an escaped pipe in a table cell and reads the size', () => {
    const [ref] = findWikiRefs('| a | ![[p.png\\|300]] |');
    expect(ref?.raw).toBe('![[p.png\\|300]]');
    expect(ref).toMatchObject({ target: 'p.png', size: { width: 300, height: null } });
  });

  it('reads a size from a table cell written with escaped pipes around alt', () => {
    const [ref] = findWikiRefs('| ![[p.png\\|alt\\|300]] |');
    expect(ref).toMatchObject({ target: 'p.png', alt: 'alt', size: { width: 300, height: null } });
  });

  it('rejects empty and nested tokens but finds the inner one', () => {
    expect(raws('![[]] ![[ ]]')).toEqual([]);
    expect(raws('![[a[b]]')).toEqual([]);
    expect(raws('[[[a]]')).toEqual(['[[a]]']);
  });

  it('never spans lines and copes with CRLF', () => {
    expect(raws('![[a\nb]]')).toEqual([]);
    const text = 'one\r\n![[a.png]]\r\n![[b.png]]\r\n';
    const refs = findWikiRefs(text);
    expect(refs.map((r) => r.raw)).toEqual(['![[a.png]]', '![[b.png]]']);
    for (const r of refs) expect(text.slice(r.start, r.end)).toBe(r.raw);
  });

  it('skips front matter by default and scans it in ignore mode', () => {
    const text = '---\nimg: ![[x.png]]\n---\n![[y.png]]';
    expect(raws(text)).toEqual(['![[y.png]]']);
    expect(raws(text, { frontMatter: 'ignore' })).toEqual(['![[x.png]]', '![[y.png]]']);
  });

  it('scans code in ignore mode', () => {
    const text = '```\n![[a.png]]\n```\n`![[b.png]]`';
    expect(raws(text, { code: 'ignore' })).toEqual(['![[a.png]]', '![[b.png]]']);
  });

  it('finds tokens after long runs of unclosed openers', () => {
    // Small on purpose: wall-clock bounds fail under Stryker's instrumentation.
    const hostile = `${'[['.repeat(500)}${'`a'.repeat(500)}${'![[a.png]] '.repeat(10)}`;
    expect(findWikiRefs(hostile).length).toBeGreaterThan(0);
    expect(findWikiRefs(`${'`'.repeat(1000)} ![[a.png]]`)).toEqual([]);
  });

  it('finds exactly the tokens of the Obsidian sample', () => {
    const refs = findWikiRefs(OBSIDIAN_SAMPLE);
    expect(refs.map((r) => r.raw)).toEqual([
      '![[a b.png|300]]',
      '![[x.pdf#page=2&height=300]]',
      '![[Note#^blk]]',
      '![[one.png\\|200]]',
      '![[two.png\\|alt\\|100x50]]',
      '[[Plain|alias]]',
      '![[quoted.png]]',
      '![[Note v1.2]]',
    ]);
    for (const r of refs) expect(OBSIDIAN_SAMPLE.slice(r.start, r.end)).toBe(r.raw);
    expect(refs[0]?.size?.width).toBe(300);
    expect(refs[1]?.pdf).toEqual({ page: 2, height: 300 });
  });
});

describe('alt sizes', () => {
  it('splits a trailing size from alt text', () => {
    expect(parseAltSize('a|300x200')).toEqual({ alt: 'a', size: { width: 300, height: 200 } });
    expect(parseAltSize('a|300')).toEqual({ alt: 'a', size: { width: 300, height: null } });
    expect(parseAltSize('|300')).toEqual({ alt: '', size: { width: 300, height: null } });
    expect(parseAltSize('a|b|300').alt).toBe('a|b');
  });

  it('drops the backslash of a table-escaped pipe with the size', () => {
    expect(parseAltSize('al\\|300')).toEqual({ alt: 'al', size: { width: 300, height: null } });
    expect(parseAltSize('a\\|b\\|300x20')).toEqual({
      alt: 'a\\|b',
      size: { width: 300, height: 20 },
    });
    // An escaped backslash is a literal one, and the pipe is a plain separator.
    expect(parseAltSize('a\\\\|300')).toEqual({ alt: 'a\\\\', size: { width: 300, height: null } });
    expect(parseAltSize('a\\|b')).toEqual({ alt: 'a\\|b', size: null });
  });

  it('leaves other alts unchanged', () => {
    expect(parseAltSize('a|b')).toEqual({ alt: 'a|b', size: null });
    expect(parseAltSize('plain')).toEqual({ alt: 'plain', size: null });
    expect(parseAltSize('a|0')).toEqual({ alt: 'a|0', size: null });
  });

  it('formats sizes', () => {
    expect(formatSize({ width: 300, height: null })).toBe('300');
    expect(formatSize({ width: 300, height: 200 })).toBe('300x200');
  });
});

describe('unescapeMarkdownText', () => {
  it('unescapes punctuation and basic entities', () => {
    expect(unescapeMarkdownText('a\\|b\\[\\]')).toBe('a|b[]');
    expect(unescapeMarkdownText('&amp;&lt;&gt;&quot;')).toBe('&<>"');
    expect(unescapeMarkdownText('&#65;&#x42;&#X43;')).toBe('ABC');
  });

  it('leaves other text alone', () => {
    expect(unescapeMarkdownText('&nbsp; \\a plain')).toBe('&nbsp; \\a plain');
    expect(unescapeMarkdownText('&#99999999;')).toBe('&#99999999;');
    expect(unescapeMarkdownText('\\&amp;')).toBe('&amp;');
  });
});

describe('splitLinkTarget', () => {
  it('decodes per segment and keeps the literal path', () => {
    expect(splitLinkTarget('my%20dir/a%20b.png')).toEqual({
      path: 'my dir/a b.png',
      literal: 'my%20dir/a%20b.png',
      fragment: null,
    });
  });

  it('keeps a malformed percent sequence literal', () => {
    expect(splitLinkTarget('100%/a%20b.png').path).toBe('100%/a b.png');
    expect(splitLinkTarget('50%.png')).toMatchObject({ path: '50%.png', literal: '50%.png' });
  });

  it('unwraps angle brackets and drops the query', () => {
    expect(splitLinkTarget('<my file.png>')).toMatchObject({
      path: 'my file.png',
      literal: 'my file.png',
    });
    expect(splitLinkTarget('a.png?raw=1').path).toBe('a.png');
    expect(splitLinkTarget('a.png?x=1#frag')).toMatchObject({ path: 'a.png', fragment: 'frag' });
  });

  it('splits the fragment', () => {
    expect(splitLinkTarget('x.pdf#page=3')).toMatchObject({ path: 'x.pdf', fragment: 'page=3' });
    expect(splitLinkTarget('x.pdf#')).toMatchObject({ fragment: null });
    expect(splitLinkTarget('#top')).toMatchObject({ path: '', fragment: 'top' });
  });
});

describe('embedTokenFor', () => {
  it('writes a decoded path as a wiki embed token', () => {
    expect(embedTokenFor('docs/x.pdf')).toBe('![[docs/x.pdf]]');
    expect(embedTokenFor('<my file.pdf>')).toBe('![[my file.pdf]]');
    expect(embedTokenFor('a%20b.mp4?raw=1')).toBe('![[a b.mp4]]');
  });

  it('is null for a path a token cannot hold', () => {
    expect(embedTokenFor('a|b.pdf')).toBeNull();
    expect(embedTokenFor('a%23b.pdf')).toBeNull();
    expect(embedTokenFor('Report%20%5Bfinal%5D.mp4')).toBeNull();
    expect(embedTokenFor('a%0Ab.pdf')).toBeNull();
    expect(embedTokenFor('#top')).toBeNull();
  });
});
