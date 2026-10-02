import { inflateSync } from 'node:zlib';
import { PDFDocument } from 'pdf-lib';
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
});
