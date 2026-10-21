import { describe, expect, it } from 'vitest';
import { extractNoteLinks } from './backlinks';

describe('extractNoteLinks', () => {
  it('finds wikilinks, note embeds and Markdown links to notes', () => {
    expect(
      extractNoteLinks(
        'See [[Plan]] and [[Folder/Other#Part|alias]] and ![[Embedded]], also [t](notes/a.md#x) and [u](<b c.md>).'
      )
    ).toEqual([
      { target: 'Plan', markdown: false },
      { target: 'Folder/Other', markdown: false },
      { target: 'Embedded', markdown: false },
      { target: 'notes/a.md', markdown: true },
      { target: 'b c.md', markdown: true },
    ]);
  });

  it('skips attachments, web links, anchors and links in code or front matter', () => {
    const md = [
      '---',
      'related: "[[In front matter]]"',
      '---',
      '![[pic.png]] [pdf](a.pdf) [web](https://x.dk/a.md) [here](#part)',
      '`[[In code]]` and `[c](code.md)`',
      '```',
      '[[Fenced]] [d](fenced.md)',
      '```',
    ].join('\n');
    expect(extractNoteLinks(md)).toEqual([]);
  });

  it('reads a link with a title', () => {
    expect(extractNoteLinks('[x](page.md "A title") and [y](a(1).md)')).toEqual([
      { target: 'page.md', markdown: true },
      { target: 'a(1).md', markdown: true },
    ]);
  });

  it('stays linear on many opening brackets', () => {
    const time = (n: number) => {
      const md = '](('.repeat(n) + '\n' + '[['.repeat(n);
      const start = performance.now();
      extractNoteLinks(md);
      return performance.now() - start;
    };
    time(2000);
    const small = Math.max(time(40_000), 1);
    expect(time(80_000)).toBeLessThan(small * 6);
  });
});
