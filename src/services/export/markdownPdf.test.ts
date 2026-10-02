import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { markdownToPdf } from './markdownPdf.mjs';

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
});
