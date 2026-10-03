#!/usr/bin/env node
/**
 * Build an A4 PDF of the user guide (USER_GUIDE.md), for reading or
 * printing outside the app; inside it, the guide opens as a document.
 *
 *   Output: public/User-Guide.pdf
 *
 * Same renderer as the app's Export (PDF) and the book. Re-run via
 * `pnpm book:guide` (or `pnpm book`).
 */

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { markdownToPdf } from '../src/services/export/markdownPdf.mjs';
import { BOOK_AUTHOR, PUBLIC_DIR } from './lib/bookChapters.mjs';

const SOURCE = new URL('../USER_GUIDE.md', import.meta.url);
const OUT_PATH = join(PUBLIC_DIR, 'User-Guide.pdf');

async function main() {
  const bytes = await markdownToPdf({
    sources: [await readFile(SOURCE, 'utf8')],
    title: 'MD Studio user guide',
    author: BOOK_AUTHOR,
    producer: 'MD Studio guide builder (pdf-lib)',
    pageNumbers: true,
  });
  await writeFile(OUT_PATH, bytes);
  console.log(`✓ Wrote ${OUT_PATH} (${(bytes.length / 1024).toFixed(1)} KB)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
