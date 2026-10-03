import { inflateSync } from 'node:zlib';
import { PDFArray, PDFDocument, PDFName, PDFRawStream } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { markdownToPdf } from './markdownPdf.mjs';

/** The text a PDF draws, in order: inflates each content stream and decodes its hex strings. */
function drawnText(bytes: Uint8Array): string {
  const raw = Buffer.from(bytes).toString('latin1');
  const out: string[] = [];
  for (const m of raw.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    let content: string;
    try {
      content = inflateSync(Buffer.from(m[1] ?? '', 'latin1')).toString('latin1');
    } catch {
      continue;
    }
    for (const t of content.matchAll(/<([0-9A-Fa-f]+)> Tj/g)) {
      out.push(Buffer.from(t[1] ?? '', 'hex').toString('latin1'));
    }
  }
  return out.join(' ');
}

/** The text drawn on each page, as one list of strings per page. */
async function pageTexts(bytes: Uint8Array): Promise<string[][]> {
  const pdf = await PDFDocument.load(bytes);
  return pdf.getPages().map((page) => {
    const contents = page.node.get(PDFName.of('Contents'));
    const refs = contents instanceof PDFArray ? contents.asArray() : [contents];
    const out: string[] = [];
    for (const ref of refs) {
      const stream = ref ? pdf.context.lookup(ref) : undefined;
      if (!(stream instanceof PDFRawStream)) continue;
      const content = inflateSync(Buffer.from(stream.contents)).toString('latin1');
      for (const t of content.matchAll(/<([0-9A-Fa-f]+)> Tj/g)) {
        out.push(Buffer.from(t[1] ?? '', 'hex').toString('latin1'));
      }
    }
    return out;
  });
}

/** Where each word is drawn: its x position on the page. */
function wordPositions(bytes: Uint8Array): Map<string, number> {
  const raw = Buffer.from(bytes).toString('latin1');
  const at = new Map<string, number>();
  for (const m of raw.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    let content: string;
    try {
      content = inflateSync(Buffer.from(m[1] ?? '', 'latin1')).toString('latin1');
    } catch {
      continue;
    }
    for (const t of content.matchAll(/1 0 0 1 ([\d.]+) [\d.]+ Tm\s*<([0-9A-Fa-f]+)> Tj/g)) {
      at.set(Buffer.from(t[2] ?? '', 'hex').toString('latin1'), Number(t[1]));
    }
  }
  return at;
}

/** The fill colour (`r g b`) each word is drawn in. */
function wordColors(bytes: Uint8Array): Map<string, string> {
  const raw = Buffer.from(bytes).toString('latin1');
  const at = new Map<string, string>();
  for (const m of raw.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    let content: string;
    try {
      content = inflateSync(Buffer.from(m[1] ?? '', 'latin1')).toString('latin1');
    } catch {
      continue;
    }
    for (const t of content.matchAll(/([\d.]+ [\d.]+ [\d.]+) rg[^<]*<([0-9A-Fa-f]+)> Tj/g)) {
      at.set(Buffer.from(t[2] ?? '', 'hex').toString('latin1'), t[1] ?? '');
    }
  }
  return at;
}

describe('markdownToPdf', () => {
  it('starts a single document on its first page, with no cover or contents', async () => {
    const pdf = await PDFDocument.load(
      await markdownToPdf({
        sources: ['# Notes\n\nShort body with **bold** and æøå.'],
        title: 'Notes',
      })
    );
    expect(pdf.getPageCount()).toBe(1);
    expect(pdf.getTitle()).toBe('Notes');
  });

  it('paginates long content and survives characters the PDF fonts lack', async () => {
    const long = Array.from({ length: 120 }, (_, i) => `Paragraph ${i} → with emoji 🎉.`).join(
      '\n\n'
    );
    const pdf = await PDFDocument.load(await markdownToPdf({ sources: [long], title: 'Long' }));
    expect(pdf.getPageCount()).toBeGreaterThan(2);
  });

  it('adds cover and contents pages in book mode', async () => {
    const pdf = await PDFDocument.load(
      await markdownToPdf({
        sources: ['# One', '# Two'],
        title: 'Book',
        cover: { eyebrow: 'GUIDE' },
      })
    );
    // cover + contents + one page per H1
    expect(pdf.getPageCount()).toBe(4);
  });

  it('numbers the pages of a book, leaving the cover unnumbered', async () => {
    const long = Array.from({ length: 80 }, (_, i) => `Paragraph ${i}.`).join('\n\n');
    const pages = await pageTexts(
      await markdownToPdf({
        sources: [`# One\n\n${long}`, '# Two\n\nShort.'],
        title: 'Book',
        cover: { eyebrow: 'GUIDE' },
        pageNumbers: true,
      })
    );
    expect(pages.length).toBeGreaterThan(4);
    expect(pages[0]).not.toContain('1');
    for (const [i, texts] of pages.entries()) if (i > 0) expect(texts).toContain(String(i + 1));
  });

  it('gives each contents entry the page its chapter starts on', async () => {
    const long = Array.from({ length: 80 }, (_, i) => `Paragraph ${i}.`).join('\n\n');
    const pages = await pageTexts(
      await markdownToPdf({
        sources: [`# One\n\n${long}`, '# Two\n\nShort.'],
        title: 'Book',
        cover: { eyebrow: 'GUIDE' },
        pageNumbers: true,
      })
    );
    const two =
      pages.findIndex((texts) => texts.includes('Two') && !texts.includes('Contents')) + 1;
    expect(two).toBeGreaterThan(3);
    const contents = pages[1] ?? [];
    expect(contents.slice(contents.indexOf('One'), contents.indexOf('One') + 2)).toEqual([
      'One',
      '3',
    ]);
    expect(contents.slice(contents.indexOf('Two'), contents.indexOf('Two') + 2)).toEqual([
      'Two',
      String(two),
    ]);
  });

  it('numbers every page of a document without a cover, and none by default', async () => {
    const long = Array.from({ length: 80 }, (_, i) => `Paragraph ${i}.`).join('\n\n');
    const numbered = await pageTexts(
      await markdownToPdf({ sources: [long], title: 'Guide', pageNumbers: true })
    );
    expect(numbered.length).toBeGreaterThan(1);
    for (const [i, texts] of numbered.entries()) expect(texts).toContain(String(i + 1));
    const plain = await pageTexts(await markdownToPdf({ sources: [long], title: 'Export' }));
    expect(plain[1]).not.toContain('2');
  });

  it('draws the cover eyebrow in the Studio books’ indigo', async () => {
    const bytes = await markdownToPdf({
      sources: ['# One'],
      title: 'Book',
      cover: { eyebrow: 'GUIDE' },
    });
    expect(wordColors(bytes).get('GUIDE')).toBe('0.39 0.4 0.95');
  });

  it('draws nested list items and task boxes', async () => {
    const text = drawnText(
      await markdownToPdf({
        sources: ['- outer\n  - inner item\n    - deepest\n- [x] done\n- [ ] todo\n'],
        title: 'Lists',
      })
    );
    for (const word of ['outer', 'inner', 'deepest', '[x]', 'done', '[ ]', 'todo']) {
      expect(text).toContain(word);
    }
  });

  it('strikes through deleted text instead of dropping the mark', async () => {
    const plain = await markdownToPdf({ sources: ['gone'], title: 'x' });
    const struck = await markdownToPdf({ sources: ['~~gone~~'], title: 'x' });
    expect(drawnText(struck)).toContain('gone');
    // The strike is an extra line drawn on the page.
    const lines = (b: Uint8Array) => {
      const raw = Buffer.from(b).toString('latin1');
      let n = 0;
      for (const m of raw.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
        try {
          n += (
            inflateSync(Buffer.from(m[1] ?? '', 'latin1'))
              .toString('latin1')
              .match(/ l\n/g) ?? []
          ).length;
        } catch {}
      }
      return n;
    };
    expect(lines(struck)).toBeGreaterThan(lines(plain));
  });

  it('embeds PNG images it is given and keeps alt text for the rest', async () => {
    const png = Uint8Array.from(
      atob(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
      ),
      (c) => c.charCodeAt(0)
    );
    const images = new Map([
      ['dot.png', { type: 'png' as const, bytes: png, width: 1, height: 1 }],
    ]);
    const bytes = await markdownToPdf({
      sources: ['![dot](dot.png)\n\n![missing](web.png)'],
      title: 'x',
      images,
    });
    expect(Buffer.from(bytes).toString('latin1')).toMatch(/\/Subtype \/Image/);
    expect(drawnText(bytes)).toContain('[missing]');
  });

  it('draws everything inside quotes, parsed table cells and entities', async () => {
    const text = drawnText(
      await markdownToPdf({
        sources: [
          '> outer\n>\n> > inner quote\n>\n> ```\n> code in quote\n> ```\n\n| **bold** | [link](https://e.dk) |\n| - | - |\n| a &copy; | b |',
        ],
        title: 'x',
      })
    );
    for (const word of ['outer', 'inner', 'code in quote', 'bold', 'link'])
      expect(text).toContain(word);
    expect(text).not.toContain('**');
    expect(text).not.toContain('](');
    expect(text).toContain('\xa9'); // ©, WinAnsi 0xA9
  });

  it('splits a word wider than the page instead of drawing past the edge', async () => {
    const text = drawnText(
      await markdownToPdf({ sources: [`https://example.com/${'a'.repeat(200)}`], title: 'x' })
    );
    const pieces = text.split(' ').filter((p) => p.includes('aaa'));
    expect(pieces.length).toBeGreaterThan(1);
  });

  it('numbers an ordered list from its own start, 0 included', async () => {
    const text = drawnText(await markdownToPdf({ sources: ['0. zero\n1. one'], title: 'T' }));
    expect(text).toContain('0.');
    expect(text).toContain('1.');
    expect(text).not.toContain('2.');
  });

  it('keeps Danish letters on a code line with a character the font lacks', async () => {
    const text = drawnText(
      await markdownToPdf({ sources: ['```\nblåbærgrød ─ box\n```'], title: 'T' })
    );
    expect(text).toContain('blåbærgrød');
  });

  it('adds no space where the source has none between styled runs', async () => {
    const glued = wordPositions(await markdownToPdf({ sources: ['Mid**word**, end'], title: 'T' }));
    const spaced = wordPositions(
      await markdownToPdf({ sources: ['Mid **word** , end'], title: 'T' })
    );
    // "word" follows "Mid" directly, and "," follows "word" directly.
    expect(glued.get('word')).toBeLessThan(spaced.get('word') ?? 0);
    const wordToComma = (at: Map<string, number>) => (at.get(',') ?? 0) - (at.get('word') ?? 0);
    expect(wordToComma(glued)).toBeLessThan(wordToComma(spaced));
  });

  it('aligns table columns as the delimiter row says', async () => {
    const at = async (delimiter: string) =>
      wordPositions(
        await markdownToPdf({ sources: [`| head |\n| ${delimiter} |\n| x |`], title: 'T' })
      ).get('x') ?? 0;
    const left = await at(':--');
    const center = await at(':-:');
    const right = await at('--:');
    expect(center).toBeGreaterThan(left);
    expect(right).toBeGreaterThan(center);
  });

  it('draws code exactly as written, entities included', async () => {
    const text = drawnText(
      await markdownToPdf({
        sources: [
          'Use `&amp;` for and.\n\n```\n&copy; 2026\n```\n\n| a |\n| - |\n| `&lt;` |\n\n- `&gt;` item',
        ],
        title: 'T',
      })
    );
    for (const code of ['&amp;', '&copy; 2026', '&lt;', '&gt;']) expect(text).toContain(code);
    expect(text).not.toContain('\xa9');
  });

  it('still decodes entities in prose and table cells next to code', async () => {
    const text = drawnText(
      await markdownToPdf({
        sources: ['a &copy; `&copy;`\n\n| &eacute; `&eacute;` |\n| - |'],
        title: 'T',
      })
    );
    expect(text).toContain('\xa9');
    expect(text).toContain('&copy;');
    expect(text).toContain('\xe9 &eacute;');
  });

  it('draws quotes, tables and headings inside list items', async () => {
    const text = drawnText(
      await markdownToPdf({
        sources: [
          '- item\n\n  > QUOTED\n\n- item two\n\n  | a | b |\n  | - | - |\n  | CELLX | 2 |\n\n- ## HEAD',
        ],
        title: 'T',
      })
    );
    for (const word of ['QUOTED', 'CELLX', 'HEAD']) expect(text).toContain(word);
  });

  it('styles an H3 as a subtitle only directly under an H1', async () => {
    const direct = wordColors(await markdownToPdf({ sources: ['# T\n\n### SUB'], title: 'T' }));
    const later = wordColors(
      await markdownToPdf({ sources: ['# T\n\nA paragraph.\n\n### LATER'], title: 'T' })
    );
    expect(direct.get('SUB')).toBe('0.42 0.45 0.5');
    expect(later.get('LATER')).toBe(later.get('T'));
  });
});
