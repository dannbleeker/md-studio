/**
 * Shared chapter manifest + book metadata for `build-book-epub.mjs` and
 * `build-book-pdf.mjs`, so the EPUB and PDF stay in lockstep (same chapters,
 * same order, same identity). Mirrors mindmap-studio's builder.
 *
 * Hand-listed rather than a directory sort, so re-ordering is explicit and
 * appendices never intermix with chapters. Mirrors `docs/guide/README.md`.
 *
 * Add a chapter: append its filename to CHAPTER_FILES and give the file an H1.
 * `readChapterMetadata` reads the H1 (title) + optional H3 (subtitle) from the
 * source, so a rename can't silently drift the table of contents.
 */

import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(HERE, '..', '..');
const GUIDE_DIR = join(PROJECT_ROOT, 'docs', 'guide');
/** Book output: written to public/ so it deploys with the site. */
export const PUBLIC_DIR = join(PROJECT_ROOT, 'public');

// Stable id, pinned once: e-readers cache by identifier, so a new id would
// force readers to re-add the book as a new title.
export const BOOK_ID = 'urn:uuid:md-studio-writing-in-plain-text-2026-v1';
export const BOOK_TITLE = 'Writing in Plain Text';
export const BOOK_SUBTITLE = 'A practical guide to writing in Markdown with MD Studio.';
export const BOOK_AUTHOR = 'Dann Bleeker Pedersen';
export const BOOK_LANG = 'en';
export const BOOK_PUBLISHER = 'md-studio.struktureretsundfornuft.dk';
export const BOOK_SUBJECTS = ['Markdown', 'Writing', 'Plain text', 'MD Studio'];
/** Output basename, shared so the workflow and both builders agree. */
export const BOOK_SLUG = 'Writing-in-Plain-Text';

const CHAPTER_FILES = [
  '00-foreword.md',
  '01-your-first-document.md',
  '02-anatomy-of-the-editor.md',
  '03-structuring-documents.md',
  '04-formatting-and-rich-content.md',
  '05-managing-files-locally.md',
  '06-exporting-and-sharing.md',
  '07-writing-as-practice.md',
  'appendix-a-keyboard-reference.md',
  'appendix-b-markdown-syntax-reference.md',
  'appendix-c-further-reading.md',
];

/**
 * The chapter manifest with H1 (title) + optional H3 (subtitle) read from the
 * source. Throws on a chapter without an H1: a manuscript error worth
 * surfacing loudly rather than emitting an empty TOC entry.
 */
export async function readChapterMetadata() {
  const result = [];
  for (const filename of CHAPTER_FILES) {
    const raw = await readFile(join(GUIDE_DIR, filename), 'utf8');
    const h1 = raw.match(/^#\s+(.+?)\s*$/m);
    if (!h1) throw new Error(`No H1 found in ${filename}`);
    const h3 = raw.match(/^###\s+(.+?)\s*$/m);
    result.push({
      filename,
      slug: filename.replace(/\.md$/, ''),
      title: h1[1],
      subtitle: h3 ? h3[1] : null,
      raw,
    });
  }
  return result;
}

/** TOC part headers, matched on filename prefix (stable across H1 renames). */
export const TOC_GROUPS = [
  { label: 'Front matter', match: (c) => c.filename.startsWith('00-') },
  { label: 'Part 1 — Getting started', match: (c) => /^0[12]-/.test(c.filename) },
  { label: 'Part 2 — Writing', match: (c) => /^0[34]-/.test(c.filename) },
  { label: 'Part 3 — Files and sharing', match: (c) => /^0[56]-/.test(c.filename) },
  { label: 'Part 4 — The practice', match: (c) => c.filename.startsWith('07-') },
  { label: 'Appendices', match: (c) => c.filename.startsWith('appendix-') },
];
