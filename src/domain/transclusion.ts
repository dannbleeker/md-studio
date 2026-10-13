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
import { findHeadings, type Heading, HTML_BLOCK } from './headings';

/** How deep embeds may nest. The host note is depth 0. */
export const MAX_TRANSCLUSION_DEPTH = 3;

/**
 * How many embedded notes the visual pane keeps on screen at once. Depth alone does
 * not bound the work: ten embeds per note, three levels deep, is a thousand views.
 * The export has its own, larger limit (it only writes text).
 */
export const MAX_LIVE_TRANSCLUSIONS = 200;

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
  // Obsidian hides `^id` markers in reading view, so none of them belong in the shown text.
  if (target.kind === 'whole') return { markdown: hideBlockIds(stripFrontMatterText(markdown)) };
  const doc = analysed(markdown);
  const text = target.kind === 'block' ? blockById(doc, target.id) : sectionText(doc, target.path);
  return text === null ? null : { markdown: hideBlockIds(text) };
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
  /** Per line: 1 when the line really starts a list item (see markItems). */
  item: Uint8Array;
  /** `plainHeading` of each heading, filled on first use: it is the costly part of a lookup. */
  plain: (string | undefined)[];
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
/** The only list starts that may interrupt a paragraph: with content, and numbered from 1. */
const INTERRUPTING_ITEM = /^[ \t]*(?:[-*+]|0*1[.)])[ \t]+\S/;

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

type LinkMatch = { end: number; keep: string } | null | 'stop';

/**
 * Replaces constructs that begin with `open`, run to the first `]` after it (`close`) and are
 * completed by what `finish` accepts, in linear time. The first `]` is the same for every
 * start before it, so after a failure the search resumes past that `]`; `finish` returning
 * 'stop' says no later start can match either. A regex like `\[([^\]]*)\]\(` retries every
 * start and rescans to the same `]` each time, which is quadratic on a heading of brackets.
 */
function replaceBracketed(
  text: string,
  open: string,
  finish: (at: number, close: number) => LinkMatch
): string {
  const parts: string[] = [];
  let copied = 0;
  let from = 0;
  for (;;) {
    const at = text.indexOf(open, from);
    if (at < 0) break;
    const close = text.indexOf(']', at + open.length);
    if (close < 0) break;
    const hit = finish(at, close);
    if (hit === 'stop') break;
    if (hit === null) {
      from = Math.max(at + 1, close - open.length + 1);
      continue;
    }
    parts.push(text.slice(copied, at), hit.keep);
    copied = hit.end;
    from = hit.end;
  }
  return copied === 0 ? text : parts.join('') + text.slice(copied);
}

/**
 * Link syntax out of a heading: `![alt](src)` and `[text](url)` become their text,
 * `[[Note|shown]]` becomes `shown` and `[[Note]]` becomes `Note`.
 */
function stripHeadingLinks(text: string): string {
  const inline = (open: string) => (source: string) =>
    replaceBracketed(source, open, (at, close) => {
      if (source[close + 1] !== '(') return null;
      const end = source.indexOf(')', close + 2);
      return end < 0 ? 'stop' : { end: end + 1, keep: source.slice(at + open.length, close) };
    });
  const aliased = (source: string) =>
    replaceBracketed(source, '[[', (at, close) => {
      if (source[close + 1] !== ']') return null;
      const inner = source.slice(at + 2, close);
      const bar = inner.indexOf('|');
      return bar < 0 ? null : { end: close + 2, keep: inner.slice(bar + 1) };
    });
  const plain = (source: string) =>
    replaceBracketed(source, '[[', (at, close) =>
      source[close + 1] === ']' ? { end: close + 2, keep: source.slice(at + 2, close) } : null
    );
  return inline('[')(plain(aliased(inline('![')(text))));
}

/**
 * Heading text as a reader sees it, for comparing: closing hashes, link and
 * emphasis syntax and block ids dropped, escapes undone, the punctuation
 * Obsidian leaves out of heading links turned into spaces, NFC, case and
 * whitespace normalised. Both the heading and the link target go through
 * this, so `Read *the* docs` matches `#read the docs` and `## Sub: Colon`
 * matches the `#Sub Colon` autocomplete writes.
 */
function plainHeading(text: string): string {
  const linked = stripHeadingLinks(stripBlockId(text).slice(0, MAX_HEADING_CHARS)).replace(
    /^#+(?:[ \t]+|$)/,
    ''
  );
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

/** The analyses of the notes embedded most recently: one note is often embedded many times. */
const recent: { text: string; doc: Doc }[] = [];
const RECENT_NOTES = 4;

/** `analyse`, reused for the same text. A Doc is never mutated, so sharing it is safe. */
function analysed(markdown: string): Doc {
  const at = recent.findIndex((entry) => entry.text === markdown);
  const hit = recent[at];
  if (hit) {
    // Most recent last, so the oldest is the one dropped.
    recent.push(...recent.splice(at, 1));
    return hit.doc;
  }
  const doc = analyse(markdown);
  recent.push({ text: markdown, doc });
  if (recent.length > RECENT_NOTES) recent.shift();
  return doc;
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
  const item = markItems(lines, bodyStart, fenceOf);
  return { lines, bodyStart, headings: findHeadings(markdown), fences, fenceOf, item, plain: [] };
}

/**
 * Marks the lines that start a list item. A marker right under paragraph text
 * is a continuation of that paragraph unless it is one CommonMark lets
 * interrupt it, so `2020. It was great` after a text line is prose.
 */
function markItems(lines: string[], bodyStart: number, fenceOf: Int32Array): Uint8Array {
  const item = new Uint8Array(lines.length);
  for (let i = bodyStart; i < lines.length; i++) {
    const text = lines[i] ?? '';
    if ((fenceOf[i] ?? -1) >= 0 || !isListItem(text)) continue;
    const above = lines[i - 1] ?? '';
    // Indented text above belongs to a list item or code, where a marker starts a fresh item.
    const underParagraph =
      i > bodyStart &&
      (fenceOf[i - 1] ?? -1) < 0 &&
      !isBlank(above) &&
      indentOf(above) === 0 &&
      !item[i - 1] &&
      !ATX_LINE.test(above) &&
      !THEMATIC_BREAK.test(above) &&
      !SETEXT_UNDERLINE.test(above);
    item[i] = !underParagraph || INTERRUPTING_ITEM.test(text) ? 1 : 0;
  }
  return item;
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
function startsBlock(doc: Doc, line: number): boolean {
  const text = doc.lines[line] ?? '';
  return (
    ATX_LINE.test(text) ||
    QUOTE_LINE.test(text) ||
    doc.item[line] === 1 ||
    THEMATIC_BREAK.test(text) ||
    openFence(text) !== null ||
    HTML_BLOCK.test(text)
  );
}

function fenceAt(doc: Doc, line: number): Span | null {
  const index = doc.fenceOf[line] ?? -1;
  return index < 0 ? null : (doc.fences[index] ?? null);
}

function isBoundary(doc: Doc, line: number): boolean {
  const text = doc.lines[line] ?? '';
  return (
    isBlank(text) ||
    fenceAt(doc, line) !== null ||
    startsBlock(doc, line) ||
    SETEXT_UNDERLINE.test(text)
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
    if (!QUOTE_LINE.test(text) && startsBlock(doc, next)) break;
    end = next;
  }
  return { start, end };
}

/**
 * A plain line right under text, indented or not, that carries on the
 * paragraph above it (CommonMark's lazy continuation) rather than starting a block.
 */
function isLazyLine(doc: Doc, line: number): boolean {
  const text = doc.lines[line] ?? '';
  const above = doc.lines[line - 1] ?? '';
  return (
    line > doc.bodyStart &&
    !isBlank(text) &&
    !isBlank(above) &&
    fenceAt(doc, line) === null &&
    fenceAt(doc, line - 1) === null &&
    !ATX_LINE.test(above) &&
    !startsBlock(doc, line)
  );
}

/** A list item and its more-indented or lazy continuation lines, nested children included. */
function itemSpan(doc: Doc, start: number, limit: number): Span {
  const indent = indentOf(doc.lines[start] ?? '');
  let end = start;
  for (let next = start + 1; next < limit; next++) {
    const text = doc.lines[next] ?? '';
    if (isBlank(text)) continue;
    if (indentOf(text) <= indent && !isLazyLine(doc, next)) break;
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
  if (doc.item[line] === 1) return line;
  if (indentOf(doc.lines[line] ?? '') > 0) return indentedOwner(doc, line);
  // Unindented text under an item is that item's lazy continuation. Walk up the
  // run rather than recurse: a long paragraph must not cost stack.
  for (let i = line; i > doc.bodyStart && isLazyLine(doc, i); i--) {
    if (doc.item[i - 1] === 1) return i - 1;
    if (indentOf(doc.lines[i - 1] ?? '') > 0) return indentedOwner(doc, i - 1);
  }
  return null;
}

/** The item above that is indented less than `line` and reaches it. */
function indentedOwner(doc: Doc, line: number): number | null {
  const indent = indentOf(doc.lines[line] ?? '');
  for (let above = line - 1; above >= doc.bodyStart; above--) {
    const candidate = doc.lines[above] ?? '';
    if (isBlank(candidate)) continue;
    if (
      doc.item[above] === 1 &&
      indentOf(candidate) < indent &&
      itemSpan(doc, above, doc.lines.length).end >= line
    ) {
      return above;
    }
    // Unindented text that is not an item ends every list above it.
    if (indentOf(candidate) === 0 && doc.item[above] !== 1) return null;
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
  const text = doc.lines[line] ?? '';
  if (!ONLY_BLOCK_ID.test(text)) return blockAt(doc, line, doc.lines.length);
  let above = line - 1;
  const gap = above >= doc.bodyStart && isBlank(doc.lines[above] ?? '');
  if (gap) above--;
  if (above < doc.bodyStart || isBlank(doc.lines[above] ?? '')) return null;
  // Set apart by a blank line, an id names the whole list above it; right under an item it
  // belongs to that item.
  if (gap && indentOf(text) === 0) {
    const list = wholeList(doc, above);
    if (list) return list;
  }
  return blockAt(doc, above, line);
}

/** The top-level list that ends at `last`, or null when `last` is not in a list. */
function wholeList(doc: Doc, last: number): Span | null {
  const owner = listOwner(doc, last);
  if (owner === null) return null;
  let start = owner;
  for (let i = owner - 1; i >= doc.bodyStart; i--) {
    const text = doc.lines[i] ?? '';
    if (isBlank(text)) continue;
    if (doc.item[i] !== 1 && indentOf(text) === 0) break;
    start = i;
  }
  // Indented lines with no item above them are code or text, not part of the list.
  while (start < owner && doc.item[start] !== 1) start++;
  return { start, end: last };
}

/** `text` without up to `columns` columns of leading blanks; a tab counts as four. */
function dedentLine(text: string, columns: number): string {
  let cut = 0;
  let width = 0;
  while (width < columns && isSpaceTab(text[cut])) width += text[cut++] === '\t' ? 4 : 1;
  // A tab that reaches past the cut leaves the excess behind as spaces.
  return ' '.repeat(Math.max(0, width - columns)) + text.slice(cut);
}

/**
 * The lines of a span, with the marker on `idLine` removed and trailing blank lines dropped.
 * With `dedent` the block's own indent comes off every line: a nested list item shown as a
 * document of its own would otherwise be an indented code block.
 */
function textOf(doc: Doc, span: Span, idLine: number | null, dedent = false): string {
  const out: string[] = [];
  const columns = dedent ? indentOf(doc.lines[span.start] ?? '') : 0;
  for (let i = span.start; i <= span.end; i++) {
    const text = doc.lines[i] ?? '';
    out.push(dedentLine(i === idLine ? stripBlockId(text) : text, columns));
  }
  while (out.length > 0 && isBlank(out[out.length - 1] ?? '')) out.pop();
  return out.join('\n');
}

function blockById(doc: Doc, id: string): string | null {
  for (let line = doc.bodyStart; line < doc.lines.length; line++) {
    if ((doc.fenceOf[line] ?? -1) >= 0) continue;
    if (BLOCK_ID.exec(doc.lines[line] ?? '')?.[1] !== id) continue;
    const span = blockForId(doc, line);
    if (span) return textOf(doc, span, line, true);
  }
  return null;
}

/**
 * Per line: 1 when `indentedOwner` would find a list item for it, computed in one forward
 * pass. The walk up the document costs a whole scan per line, which is quadratic when a note
 * has thousands of indented lines. The stack holds the indents of the items still open
 * (strictly increasing); a line that is not a lazy continuation closes every item indented as
 * much as it is, as itemSpan does, and unindented text that is not an item closes them all, as
 * indentedOwner's walk does.
 */
function itemOwned(doc: Doc): Uint8Array {
  const owned = new Uint8Array(doc.lines.length);
  const open: number[] = [];
  for (let i = doc.bodyStart; i < doc.lines.length; i++) {
    const text = doc.lines[i] ?? '';
    if (isBlank(text)) continue;
    const indent = indentOf(text);
    if (indent === 0 && doc.item[i] !== 1) {
      open.length = 0;
      continue;
    }
    if (!isLazyLine(doc, i)) {
      while (open.length > 0 && (open[open.length - 1] ?? 0) >= indent) open.pop();
    }
    if (open.length > 0 && (open[0] ?? 0) < indent) owned[i] = 1;
    if (doc.item[i] === 1) open.push(indent);
  }
  return owned;
}

/**
 * The text with every trailing `^id` removed (a line holding only one is dropped), outside
 * fenced and indented code. Obsidian shows no block ids in reading view.
 */
function hideBlockIds(text: string): string {
  if (!text.includes('^')) return text;
  const doc = analysed(text);
  const out: string[] = [];
  let changed = false;
  let owned: Uint8Array | null = null;
  for (let i = 0; i < doc.lines.length; i++) {
    const line = doc.lines[i] ?? '';
    // The id test comes first so a note without ids pays for none of this.
    if (!BLOCK_ID.test(line)) {
      out.push(line);
      continue;
    }
    // Indented code is an indented block after a blank line that no list item holds.
    let inCode = (doc.fenceOf[i] ?? -1) >= 0;
    if (!inCode && indentOf(line) >= 4 && (i === 0 || isBlank(doc.lines[i - 1] ?? ''))) {
      owned ??= itemOwned(doc);
      inCode = doc.item[i] !== 1 && owned[i] === 0;
    }
    if (inCode) {
      out.push(line);
      continue;
    }
    changed = true;
    if (!ONLY_BLOCK_ID.test(line)) out.push(stripBlockId(line));
  }
  if (!changed) return text;
  return out.join(text.includes('\r\n') ? '\r\n' : '\n');
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
      let plain = doc.plain[k];
      if (plain === undefined) {
        plain = plainHeading(heading.text);
        doc.plain[k] = plain;
      }
      if (plain === wanted) {
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
