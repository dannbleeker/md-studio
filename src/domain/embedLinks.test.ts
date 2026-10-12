import { describe, expect, it } from 'vitest';
import { OBSIDIAN_SAMPLE } from '../../test/fixtures/obsidianNote';
import { findMarkdownImages, formatWikiEmbed, isLocalTarget } from './embedLinks';

const dests = (text: string, opts?: Parameters<typeof findMarkdownImages>[1]) =>
  findMarkdownImages(text, opts).map((r) => r.dest);

describe('findMarkdownImages', () => {
  it('parses alt, destination and offsets', () => {
    const text = 'x ![alt](a/b.png) y';
    const [img] = findMarkdownImages(text);
    expect(img).toMatchObject({
      start: 2,
      end: 17,
      raw: '![alt](a/b.png)',
      alt: 'alt',
      altText: 'alt',
      size: null,
      dest: 'a/b.png',
      angle: false,
      title: null,
    });
    expect(text.slice(img?.start, img?.end)).toBe(img?.raw);
  });

  it('keeps balanced parentheses in the destination', () => {
    expect(dests('![a](x(1).png) ![b](p(q(r)).png)')).toEqual(['x(1).png', 'p(q(r)).png']);
    expect(dests('![a](x(1.png)')).toEqual([]);
  });

  it('accepts angle destinations with spaces', () => {
    const [img] = findMarkdownImages('![](<my file.png>)');
    expect(img).toMatchObject({ dest: 'my file.png', angle: true, alt: '' });
  });

  it('reads titles in all three quote styles', () => {
    expect(findMarkdownImages('![a](p.png "t 1")')[0]?.title).toBe('t 1');
    expect(findMarkdownImages("![a](p.png 't')")[0]?.title).toBe('t');
    expect(findMarkdownImages('![a](p.png (t))')[0]?.title).toBe('t');
    expect(findMarkdownImages('![a](<my p.png> "t")')[0]).toMatchObject({
      dest: 'my p.png',
      title: 't',
    });
    expect(findMarkdownImages('![a](p.png"t")')[0]).toMatchObject({
      dest: 'p.png"t"',
      title: null,
    });
    expect(findMarkdownImages('![a](p.png "t)')).toEqual([]);
  });

  it('handles an escaped closing bracket and nested brackets in alt', () => {
    expect(findMarkdownImages('![a\\]b](p.png)')[0]?.alt).toBe('a\\]b');
    expect(findMarkdownImages('![a [b] c](p.png)')[0]?.alt).toBe('a [b] c');
  });

  it('splits a size off the alt', () => {
    const [img] = findMarkdownImages('![alt|300](p.png)');
    expect(img).toMatchObject({
      alt: 'alt|300',
      altText: 'alt',
      size: { width: 300, height: null },
    });
    expect(findMarkdownImages('![|300x200](p.png)')[0]).toMatchObject({
      altText: '',
      size: { width: 300, height: 200 },
    });
    expect(findMarkdownImages('![a|b](p.png)')[0]).toMatchObject({ altText: 'a|b', size: null });
  });

  it('allows an empty destination', () => {
    expect(dests('![a]()')).toEqual(['']);
  });

  it('ignores reference-style images, plain links and wiki embeds', () => {
    expect(dests('![a][ref] ![b] [c](d.png) ![[e.png]] ![a] (x.png)')).toEqual([]);
  });

  it('skips code like findWikiRefs', () => {
    expect(dests('```\n![a](1.png)\n```\n![b](2.png)')).toEqual(['2.png']);
    expect(dests('`![a](1.png)` ![b](2.png)')).toEqual(['2.png']);
    expect(dests('para\n\n    ![a](1.png)\n\n![b](2.png)')).toEqual(['2.png']);
    expect(dests('---\nx: ![a](1.png)\n---\n![b](2.png)')).toEqual(['2.png']);
    expect(dests('\\![a](1.png)')).toEqual([]);
    expect(dests('```\n![a](1.png)\n```', { code: 'ignore' })).toEqual(['1.png']);
  });

  it('copes with CRLF and unclosed or nested openers', () => {
    const text = '![a](1.png)\r\n![b](2.png)\r\n';
    const refs = findMarkdownImages(text);
    expect(refs.map((r) => r.raw)).toEqual(['![a](1.png)', '![b](2.png)']);
    // Small on purpose: a wall-clock bound is flaky and fails under Stryker's
    // instrumentation. Each unclosed opener scans at most MAX_SPAN characters.
    expect(findMarkdownImages('![a'.repeat(300))).toEqual([]);
    expect(findMarkdownImages(`${'![a(('.repeat(100)}`)).toEqual([]);
    expect(dests(`${'![a'.repeat(300)} ![b](3.png)`)).toEqual(['3.png']);
  });

  it('finds the Markdown image of the Obsidian sample only', () => {
    expect(dests(OBSIDIAN_SAMPLE)).toEqual(['my file.png']);
  });
});

describe('isLocalTarget', () => {
  it('rejects remote and scheme targets', () => {
    for (const d of [
      'http://x/a.png',
      'HTTPS://x/a.png',
      '//host/a.png',
      'data:image/png;base64,AA',
      'mailto:a@b.c',
      'attachment:a.png',
      'blob:abc',
      '<https://x/a.png>',
    ]) {
      expect(isLocalTarget(d)).toBe(false);
    }
  });

  it('accepts relative and absolute paths', () => {
    for (const d of [
      'a.png',
      './a.png',
      '../a.png',
      '/a.png',
      'dir/a:b.png',
      '<my file.png>',
      '#top',
    ]) {
      expect(isLocalTarget(d)).toBe(true);
    }
  });
});

describe('formatWikiEmbed', () => {
  it('builds target, fragment, alt and size', () => {
    expect(formatWikiEmbed({ target: 'a.png' })).toBe('![[a.png]]');
    expect(formatWikiEmbed({ target: 'x.pdf', fragment: 'page=3' })).toBe('![[x.pdf#page=3]]');
    expect(
      formatWikiEmbed({ target: 'a.png', alt: 'alt', size: { width: 300, height: 200 } })
    ).toBe('![[a.png|alt|300x200]]');
    expect(formatWikiEmbed({ target: 'a.png', size: { width: 300, height: null } })).toBe(
      '![[a.png|300]]'
    );
    expect(formatWikiEmbed({ target: 'a.png', fragment: null, alt: null, size: null })).toBe(
      '![[a.png]]'
    );
  });

  it('escapes every pipe inside a table', () => {
    expect(
      formatWikiEmbed({
        target: 'a.png',
        alt: 'alt',
        size: { width: 300, height: null },
        inTable: true,
      })
    ).toBe('![[a.png\\|alt\\|300]]');
  });
});
