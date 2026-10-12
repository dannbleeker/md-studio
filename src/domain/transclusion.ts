/**
 * Selection inside a note for transclusion: `![[Note#Heading]]`,
 * `![[Note#H1#H2]]` and `![[Note#^block]]`, plus the guard that stops embeds
 * from recursing forever. Text in, text out; the view decides how to show it.
 *
 * Headings come from findHeadings, so only top-level headings can be
 * targeted. Headings inside lists, quotes and callouts are a documented gap,
 * and a section ends at the next top-level heading of the same or a higher
 * level, so a heading hidden in a quote doesn't cut a section short either.
 */

import { unescapeMarkdownText } from './embeds';
import { closesFence, openFence } from './fences';
import { frontMatterEnd, frontMatterLines } from './frontMatter';
import { findHeadings, type Heading } from './headings';

/** How deep embeds may nest. The host note is depth 0. */
export const MAX_TRANSCLUSION_DEPTH = 3;

export interface TranscludeChain {
  depth: number;
  /** `path#fragment` keys already on the stack, host included. */
  visited: readonly string[];
}

/** The chain for a note being shown. The host itself is on the stack, whole. */
export function startChain(hostNotePath: string | null): TranscludeChain {
  return { depth: 0, visited: [chainKey(hostNotePath ?? '', null)] };
}

/**
 * Enter an embed of `notePath#fragment`. Repeating a (note, section) pair
 * is a cycle, but the same note in a different section is not, so
 * A#S1 -> B -> A#S2 is allowed. The cycle check runs first, so a loop is
 * reported as a loop even when it is also at the depth limit.
 */
export function descend(
  chain: TranscludeChain,
  notePath: string,
  fragment: string | null
): { ok: true; chain: TranscludeChain } | { ok: false; reason: 'cycle' | 'depth' } {
  const key = chainKey(notePath, fragment);
  if (chain.visited.includes(key)) return { ok: false, reason: 'cycle' };
  if (chain.depth + 1 > MAX_TRANSCLUSION_DEPTH) return { ok: false, reason: 'depth' };
  return { ok: true, chain: { depth: chain.depth + 1, visited: [...chain.visited, key] } };
}

/** The note body: front matter and the blank lines after it removed. */
export function stripFrontMatterText(markdown: string): string {
  const end = frontMatterEnd(markdown);
  if (end < 0) return markdown;
  return markdown.slice(end + 1).replace(/^(?:[ \t]*\r?\n)+/, '');
}

/**
 * The text an embed of `fragment` shows: the whole body, a heading section,
 * or a block. Null when the heading or block isn't there, so the view can
 * show a placeholder instead of the whole note.
 */
export function selectNoteContent(
  markdown: string,
  fragment: string | null
): { markdown: string } | null {
  const target = parseTarget(fragment);
  if (target.kind === 'whole') return { markdown: stripFrontMatterText(markdown) };
  const doc = analyse(markdown);
  const text = target.kind === 'block' ? blockById(doc, target.id) : sectionText(doc, target.path);
  return text === null ? null : { markdown: text };
}

// Internals

type Target =
  | { kind: 'whole' }
  | { kind: 'block'; id: string }
  | { kind: 'heading'; path: string[] };

/** Inclusive line indices into the split source. */
interface Span {
  start: number;
  end: number;
}

interface Doc {
  lines: string[];
  /** First line after front matter. Lines before it are never body. */
  bodyStart: number;
  headings: Heading[];
  /** Fenced code blocks, in document order. */
  fences: Span[];
  /** Per line: index into `fences`, or -1 when the line is outside fenced code. */
  fenceOf: Int32Array;
}

const ATX_LINE = /^ {0,3}#{1,6}(?:[ \t]|$)/;
const SETEXT_UNDERLINE = /^ {0,3}(?:=+|-+)[ \t]*$/;
const THEMATIC_BREAK = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const QUOTE_LINE = /^ {0,3}>/;
const LIST_ITEM = /^[ \t]*(?:[-*+]|\d{1,9}[.)])(?:[ \t]|$)/;
/**
 * Matched against a line already trimmed of spaces and tabs (see
 * isTableDelimiter): leading and trailing `[ \t]*` next to the optional pipes
 * make a long run of blanks quadratic to reject.
 */
const TABLE_DELIMITER = /^\|?[ \t]*:?-+:?[ \t]*(?:\|[ \t]*:?-+:?[ \t]*)*\|?$/;
/** A block id: `^` plus letters, digits or hyphens, after whitespace or at the start. */
const BLOCK_ID = /(?:^|\s)\^([A-Za-z0-9-]+)[ \t]*$/;
/** Longest heading text compared; longer text is cut, which keeps the link patterns cheap. */
const MAX_HEADING_CHARS = 1000;
const ONLY_BLOCK_ID = /^[ \t]*\^[A-Za-z0-9-]+[ \t]*$/;

function chainKey(notePath: string, fragment: string | null): string {
  return `${notePath}#${fragment ?? ''}`;
}

function parseTarget(fragment: string | null): Target {
  const text = (fragment ?? '').trim();
  if (text === '') return { kind: 'whole' };
  // A block id is a single token, so an id that isn't one simply matches nothing.
  if (text.startsWith('^')) return { kind: 'block', id: text.slice(1) };
  const path = text
    .split('#')
    .map((part) => part.trim())
    .filter((part) => part !== '');
  return path.length === 0 ? { kind: 'whole' } : { kind: 'heading', path };
}

const isSpaceTab = (ch: string | undefined): boolean => ch === ' ' || ch === '\t';

function isTableDelimiter(text: string): boolean {
  let start = 0;
  let end = text.length;
  while (start < end && isSpaceTab(text[start])) start++;
  while (end > start && isSpaceTab(text[end - 1])) end--;
  return start < end && TABLE_DELIMITER.test(text.slice(start, end));
}

/**
 * The text without a trailing block id (`^id`) and the whitespace before it.
 * A scan from the end: a regex for this backtracks over every run of
 * whitespace in the line.
 */
function stripBlockId(text: string): string {
  let end = text.length;
  while (end > 0 && isSpaceTab(text[end - 1])) end--;
  let id = end;
  while (id > 0 && /[A-Za-z0-9-]/.test(text[id - 1] ?? '')) id--;
  if (id === end || text[id - 1] !== '^') return text;
  let cut = id - 1;
  if (cut > 0 && !/\s/.test(text[cut - 1] ?? '')) return text;
  while (cut > 0 && /\s/.test(text[cut - 1] ?? '')) cut--;
  return text.slice(0, cut);
}

/** The text without closing hashes (`## Title ##`) and the blanks before them. */
function stripClosingHashes(text: string): string {
  let end = text.length;
  while (end > 0 && isSpaceTab(text[end - 1])) end--;
  let hashes = end;
  while (hashes > 0 && text[hashes - 1] === '#') hashes--;
  if (hashes === end) return text;
  if (hashes > 0 && !isSpaceTab(text[hashes - 1])) return text;
  while (hashes > 0 && isSpaceTab(text[hashes - 1])) hashes--;
  return text.slice(0, hashes);
}

/** Characters Obsidian drops from a heading link; both sides of a comparison lose them. */
const LINK_PUNCTUATION = /[#|^:%[\]\\/]/g;

/**
 * Heading text as a reader sees it, for comparing: closing hashes, link and
 * emphasis syntax and block ids dropped, escapes undone, the punctuation
 * Obsidian leaves out of heading links turned into spaces, NFC, case and
 * whitespace normalised. Both the heading and the link target go through
 * this, so `Read *the* docs` matches `#read the docs` and `## Sub: Colon`
 * matches the `#Sub Colon` autocomplete writes.
 */
function plainHeading(text: string): string {
  const linked = stripBlockId(text)
    .slice(0, MAX_HEADING_CHARS)
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[\[([^\]|]*)\|([^\]]*)\]\]/g, '$2')
    .replace(/\[\[([^\]]*)\]\]/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^#+(?:[ \t]+|$)/, '');
  const stripped = stripClosingHashes(linked);
  // After the link syntax is gone, so an escaped bracket can't start a link; before the
  // emphasis marks go, so `\*star\*` and `*star*` end up the same.
  return (
    unescapeMarkdownText(stripped)
      .replace(/[*`~]/g, '')
      // Underscores are emphasis only at a word edge; `snake_case` keeps its own.
      .replace(/(^|[^\p{L}\p{N}])_+/gu, '$1')
      .replace(/_+(?=[^\p{L}\p{N}]|$)/gu, '')
      .replace(LINK_PUNCTUATION, ' ')
      .normalize('NFC')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase()
  );
}

/**
 * Splits the note once and records the fenced code and top-level headings.
 * Front matter is skipped by the same rule findHeadings uses, so line numbers
 * agree between the two.
 */
function analyse(markdown: string): Doc {
  const lines = markdown.split(/\r?\n/);
  const bodyStart = frontMatterLines(markdown);
  const fenceOf = new Int32Array(lines.length).fill(-1);
  const fences: Span[] = [];
  let fence: string | null = null;
  let open = 0;
  for (let i = bodyStart; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (fence === null) {
      const opener = openFence(line);
      if (opener !== null) {
        fence = opener;
        open = i;
        fenceOf[i] = fences.length;
      }
      continue;
    }
    fenceOf[i] = fences.length;
    if (closesFence(line, fence)) {
      fences.push({ start: open, end: i });
      fence = null;
    }
  }
  // An unclosed fence runs to the end of the note, as CommonMark has it.
  if (fence !== null) fences.push({ start: open, end: lines.length - 1 });
  return { lines, bodyStart, headings: findHeadings(markdown), fences, fenceOf };
}

const isBlank = (text: string): boolean => text.trim() === '';

/** Width of the leading indent. A tab counts as four columns, which is enough for nesting. */
function indentOf(text: string): number {
  let width = 0;
  for (const ch of text) {
    if (ch === ' ') width += 1;
    else if (ch === '\t') width += 4;
    else break;
  }
  return width;
}

const isListItem = (text: string): boolean => LIST_ITEM.test(text) && !THEMATIC_BREAK.test(text);

/** A line that opens a block of its own, so a paragraph can't run into it. */
function startsBlock(text: string): boolean {
  return (
    ATX_LINE.test(text) ||
    QUOTE_LINE.test(text) ||
    isListItem(text) ||
    THEMATIC_BREAK.test(text) ||
    openFence(text) !== null
  );
}

function fenceAt(doc: Doc, line: number): Span | null {
  const index = doc.fenceOf[line] ?? -1;
  return index < 0 ? null : (doc.fences[index] ?? null);
}

function isBoundary(doc: Doc, line: number): boolean {
  const text = doc.lines[line] ?? '';
  return (
    isBlank(text) || fenceAt(doc, line) !== null || startsBlock(text) || SETEXT_UNDERLINE.test(text)
  );
}

/**
 * Index of the top-level heading whose own lines (its ATX line, or its setext
 * text) include `line`, or -1.
 */
function headingIndexAt(doc: Doc, line: number): number {
  for (let k = 0; k < doc.headings.length; k++) {
    const heading = doc.headings[k];
    if (!heading) continue;
    if (ATX_LINE.test(doc.lines[heading.line] ?? '')) {
      if (heading.line === line) return k;
      continue;
    }
    if (heading.line <= line && line < setextUnderline(doc, heading.line)) return k;
  }
  return -1;
}

/** Line of the underline that ends a setext heading starting at `start`, or -1. */
function setextUnderline(doc: Doc, start: number): number {
  for (let i = start + 1; i < doc.lines.length; i++) {
    if (SETEXT_UNDERLINE.test(doc.lines[i] ?? '')) return i;
  }
  return -1;
}

/**
 * Exclusive end line of the section a heading starts: the next heading at its
 * level or higher, or the end of the note.
 */
function sectionEnd(doc: Doc, index: number): number {
  const level = doc.headings[index]?.level ?? 0;
  for (let k = index + 1; k < doc.headings.length; k++) {
    const next = doc.headings[k];
    if (next && next.level <= level) return next.line;
  }
  return doc.lines.length;
}

function sectionSpan(doc: Doc, index: number): Span | null {
  const heading = doc.headings[index];
  return heading ? { start: heading.line, end: sectionEnd(doc, index) - 1 } : null;
}

/**
 * The run of non-blank lines around `line`, stopping at anything that opens a
 * block. `limit` is exclusive.
 */
function paragraphSpan(doc: Doc, line: number, limit: number): Span {
  let start = line;
  while (start > doc.bodyStart && !isBoundary(doc, start - 1)) start--;
  let end = line;
  while (end + 1 < limit && !isBoundary(doc, end + 1)) end++;
  return { start, end };
}

function paragraphBlock(doc: Doc, line: number, limit: number): Span {
  if (isBoundary(doc, line)) return { start: line, end: line };
  const span = paragraphSpan(doc, line, limit);
  const above = span.start - 1;
  // A plain line right under a quote is that quote's lazy continuation.
  if (above >= doc.bodyStart && QUOTE_LINE.test(doc.lines[above] ?? '')) {
    return quoteSpan(doc, above, limit);
  }
  return span;
}

/** Quote lines around `line`, plus lazy continuation lines that follow them. */
function quoteSpan(doc: Doc, line: number, limit: number): Span {
  let start = line;
  while (start > doc.bodyStart && QUOTE_LINE.test(doc.lines[start - 1] ?? '')) start--;
  let end = line;
  for (let next = line + 1; next < limit; next++) {
    const text = doc.lines[next] ?? '';
    if (isBlank(text)) break;
    if (!QUOTE_LINE.test(text) && startsBlock(text)) break;
    end = next;
  }
  return { start, end };
}

/** A list item and its more-indented continuation lines, nested children included. */
function itemSpan(doc: Doc, start: number, limit: number): Span {
  const indent = indentOf(doc.lines[start] ?? '');
  let end = start;
  for (let next = start + 1; next < limit; next++) {
    const text = doc.lines[next] ?? '';
    if (isBlank(text)) continue;
    if (indentOf(text) <= indent) break;
    end = next;
  }
  return { start, end };
}

/**
 * The list item a line belongs to: the line itself when it starts an item,
 * otherwise the nearest item above that is indented less and reaches the
 * line. Null for anything else.
 */
function listOwner(doc: Doc, line: number): number | null {
  const text = doc.lines[line] ?? '';
  if (isListItem(text)) return line;
  if (indentOf(text) === 0) return null;
  for (let above = line - 1; above >= doc.bodyStart; above--) {
    const candidate = doc.lines[above] ?? '';
    if (isBlank(candidate)) continue;
    if (
      isListItem(candidate) &&
      indentOf(candidate) < indentOf(text) &&
      itemSpan(doc, above, doc.lines.length).end >= line
    ) {
      return above;
    }
    // Unindented text that is not an item ends every list above it.
    if (indentOf(candidate) === 0 && !isListItem(candidate)) return null;
  }
  return null;
}

/**
 * The table holding `line`: from the header row above the nearest delimiter
 * row at or above the line, down to the end of the non-blank run. Null when
 * the run has no delimiter row, so a plain paragraph with pipes stays text.
 */
function tableSpan(doc: Doc, line: number, limit: number): Span | null {
  const run = paragraphSpan(doc, line, limit);
  let header: number | null = null;
  for (let delim = run.start + 1; delim <= run.end && delim - 1 <= line; delim++) {
    const text = doc.lines[delim] ?? '';
    if (
      isTableDelimiter(text) &&
      text.includes('|') &&
      (doc.lines[delim - 1] ?? '').includes('|')
    ) {
      header = delim - 1;
    }
  }
  return header === null ? null : { start: header, end: run.end };
}

/** The block that holds `line`. `limit` caps the lines it may take, exclusive. */
function blockAt(doc: Doc, line: number, limit: number): Span | null {
  const fence = fenceAt(doc, line);
  if (fence) return fence;
  const heading = headingIndexAt(doc, line);
  if (heading >= 0) return sectionSpan(doc, heading);
  if (QUOTE_LINE.test(doc.lines[line] ?? '')) return quoteSpan(doc, line, limit);
  const owner = listOwner(doc, line);
  if (owner !== null) return itemSpan(doc, owner, limit);
  return tableSpan(doc, line, limit) ?? paragraphBlock(doc, line, limit);
}

/**
 * The block a `^id` marker on `line` names. A marker on a line of its own
 * names the block before it, past at most one blank line.
 */
function blockForId(doc: Doc, line: number): Span | null {
  if (!ONLY_BLOCK_ID.test(doc.lines[line] ?? '')) return blockAt(doc, line, doc.lines.length);
  let above = line - 1;
  if (above >= doc.bodyStart && isBlank(doc.lines[above] ?? '')) above--;
  if (above < doc.bodyStart || isBlank(doc.lines[above] ?? '')) return null;
  return blockAt(doc, above, line);
}

/** The lines of a span, with the marker on `idLine` removed and trailing blank lines dropped. */
function textOf(doc: Doc, span: Span, idLine: number | null): string {
  const out: string[] = [];
  for (let i = span.start; i <= span.end; i++) {
    const text = doc.lines[i] ?? '';
    out.push(i === idLine ? stripBlockId(text) : text);
  }
  while (out.length > 0 && isBlank(out[out.length - 1] ?? '')) out.pop();
  return out.join('\n');
}

function blockById(doc: Doc, id: string): string | null {
  for (let line = doc.bodyStart; line < doc.lines.length; line++) {
    if ((doc.fenceOf[line] ?? -1) >= 0) continue;
    if (BLOCK_ID.exec(doc.lines[line] ?? '')?.[1] !== id) continue;
    const span = blockForId(doc, line);
    if (span) return textOf(doc, span, line);
  }
  return null;
}

/**
 * The section for a heading path: `A#B` finds A, then B inside A's section.
 * Each step takes the first match in its scope.
 */
function headingSpan(doc: Doc, path: readonly string[]): Span | null {
  let scope = -1;
  let scopeEnd = doc.lines.length;
  let chosen = -1;
  for (const segment of path) {
    const wanted = plainHeading(segment);
    let found = -1;
    for (let k = 0; k < doc.headings.length; k++) {
      const heading = doc.headings[k];
      if (!heading || heading.line <= scope) continue;
      if (heading.line >= scopeEnd) break;
      if (plainHeading(heading.text) === wanted) {
        found = k;
        break;
      }
    }
    if (found < 0) return null;
    chosen = found;
    scope = doc.headings[found]?.line ?? scope;
    scopeEnd = sectionEnd(doc, found);
  }
  return sectionSpan(doc, chosen);
}

function sectionText(doc: Doc, path: readonly string[]): string | null {
  const span = headingSpan(doc, path);
  return span ? textOf(doc, span, null) : null;
}
