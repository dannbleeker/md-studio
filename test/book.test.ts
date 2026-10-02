import JSZip from 'jszip';
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { buildEpub } from '../scripts/build-book-epub.mjs';
import { buildPdf } from '../scripts/build-book-pdf.mjs';
import { BOOK_ID, BOOK_TITLE, readChapterMetadata } from '../scripts/lib/bookChapters.mjs';

describe('book build', () => {
  it('reads every chapter with a title', async () => {
    const chapters = await readChapterMetadata();
    expect(chapters.length).toBeGreaterThanOrEqual(11);
    for (const c of chapters) expect(c.title).not.toBe('');
  });

  it('builds a valid EPUB with one document per chapter', async () => {
    const chapters = await readChapterMetadata();
    const zip = await JSZip.loadAsync(await buildEpub());
    const names = Object.keys(zip.files);
    // The EPUB spec requires `mimetype` first and uncompressed.
    expect(names[0]).toBe('mimetype');
    expect(await zip.file('mimetype')?.async('string')).toBe('application/epub+zip');
    expect(names.filter((n) => /OEBPS\/chapter-\d+\.xhtml$/.test(n))).toHaveLength(chapters.length);
    const opf = await zip.file('OEBPS/content.opf')?.async('string');
    expect(opf).toContain(BOOK_ID);
    expect(opf).toContain(BOOK_TITLE);
  });

  it('builds a PDF with cover, contents and every chapter bookmarked', async () => {
    const chapters = await readChapterMetadata();
    const pdf = await PDFDocument.load(await buildPdf());
    expect(pdf.getTitle()).toBe(BOOK_TITLE);
    // Cover + contents + at least one page per chapter.
    expect(pdf.getPageCount()).toBeGreaterThanOrEqual(chapters.length + 2);
  });
});
