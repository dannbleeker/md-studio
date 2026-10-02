#!/usr/bin/env node
/**
 * Build a fixed-layout A4 PDF of *Writing in Plain Text* from docs/guide/*.md.
 *
 *   Output: public/Writing-in-Plain-Text.pdf
 *
 * Rendering lives in src/services/export/markdownPdf.mjs, shared with the
 * app's Export (PDF); this script adds the book's cover, contents page,
 * bookmarks and metadata. Re-run via `pnpm book:pdf` (or `pnpm book`).
 */

import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { markdownToPdf } from '../src/services/export/markdownPdf.mjs';
import {
  BOOK_AUTHOR,
  BOOK_ID,
  BOOK_PUBLISHER,
  BOOK_SLUG,
  BOOK_SUBTITLE,
  BOOK_TITLE,
  PUBLIC_DIR,
  readChapterMetadata,
} from './lib/bookChapters.mjs';

const OUT_PATH = join(PUBLIC_DIR, `${BOOK_SLUG}.pdf`);

/** Build the PDF and return its bytes (no file write — keeps it testable). */
export async function buildPdf() {
  const chapters = await readChapterMetadata();
  return markdownToPdf({
    sources: chapters.map((c) => c.raw),
    title: BOOK_TITLE,
    author: BOOK_AUTHOR,
    subject: BOOK_SUBTITLE,
    producer: 'MD Studio book builder (pdf-lib)',
    creator: BOOK_PUBLISHER,
    keywords: [BOOK_ID],
    cover: { eyebrow: 'AN MD STUDIO GUIDE' },
  });
}

async function main() {
  console.log(`📕 Building ${BOOK_SLUG}.pdf …`);
  const bytes = await buildPdf();
  await writeFile(OUT_PATH, bytes);
  console.log(`✓ Wrote ${OUT_PATH} (${(bytes.length / 1024).toFixed(1)} KB)`);
}

// Run only when executed directly (node scripts/build-book-pdf.mjs), not on import.
if (process.argv[1]?.endsWith('build-book-pdf.mjs')) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
