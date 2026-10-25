/**
 * Where the code is in a Markdown document, by the CommonMark block rules:
 * fenced and indented blocks at any depth of quotes, list items and footnote
 * definitions, and inline code spans that wrap across the lines of a
 * paragraph or stay inside one table cell. The wiki-token and image scanners
 * share it, so they agree with the parser the visual pane uses about what is
 * code. It reads text only (no tree), keeps to string work, and stops opening
 * containers past MAX_DEPTH so a line of `>>>>…` stays linear.
 *
 * codeRegionsParity.test.ts checks it against that parser on generated
 * documents. Two things differ from reading the spec alone, because the parser
 * does: a lone-tag HTML line starts a block even where it would continue a
 * paragraph lazily, and a link reference definition is not paragraph text.
 * Left out on purpose: raw HTML tags and comments that wrap over a line break
 * are not skipped when pairing backticks, and micromark's refusal of an empty
 * list item (or a number other than 1) right after a paragraph or indented
 * code in a new container is not copied.
 */

import { closesFence, openFence } from './fences';

export interface CodeRange {
  start: number;
  /** Exclusive. */
  end: number;
  /** A fenced or indented block (whole lines), not an inline span. */
  block: boolean;
}

type Seg = readonly [number, number];

interface Box {
  quote: boolean;
  /** Columns a continuation line must be indented past the enclosing box. */
  width: number;
  /** Whether a block has started inside; an empty list item ends at a blank line. */
  filled: boolean;
}

type Leaf =
  | { kind: 'para'; segs: Seg[] }
  | { kind: 'table' }
  | { kind: 'fence'; fence: string }
  | { kind: 'indented' }
  | { kind: 'html'; end: RegExp | null };

const MAX_DEPTH = 64;
// A tag or autolink longer than this is not one worth hiding a backtick in.
const MAX_INLINE_HTML = 2048;

const OPEN_TAG =
  '<[A-Za-z][A-Za-z0-9-]*(?:\\s+[a-zA-Z_:][a-zA-Z0-9:._-]*(?:\\s*=\\s*(?:[^"\'=<>`\\x00-\\x20]+|\'[^\']*\'|"[^"]*"))?)*\\s*/?>';
const CLOSE_TAG = '</[A-Za-z][A-Za-z0-9-]*\\s*>';
const BLOCK_NAMES =
  'address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|nav|noframes|ol|optgroup|option|p|param|section|source|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul';

// CommonMark HTML block start and end conditions 1 to 7; 6 and 7 end at a blank line.
const HTML_START = [
  /^<(?:script|pre|textarea|style)(?:\s|>|$)/i,
  /^<!--/,
  /^<\?/,
  /^<![A-Za-z]/,
  /^<!\[CDATA\[/,
  new RegExp(`^</?(?:${BLOCK_NAMES})(?:\\s|/?>|$)`, 'i'),
  new RegExp(`^(?:${OPEN_TAG}|${CLOSE_TAG})\\s*$`),
];
const HTML_END = [/<\/(?:script|pre|textarea|style)>/i, /-->/, /\?>/, />/, /\]\]>/];

// Raw HTML and autolinks bind as tightly as code spans, so a backtick inside one is not a span.
const INLINE_HTML = new RegExp(
  `<(?:[A-Za-z][A-Za-z0-9+.-]{1,31}:[^\\s<>]*>|${OPEN_TAG.slice(1)}|${CLOSE_TAG.slice(1)}|!--[^]*?-->)`,
  'y'
);

const THEMATIC = /^(?:(?:\*[ \t]*){3,}|(?:_[ \t]*){3,}|(?:-[ \t]*){3,})$/;
const SETEXT = /^(?:=+|-+)[ \t]*$/;
const LIST_MARKER = /^(?:[*+-]|(\d{1,9})[.)])(?=[ \t]|$)/;
const FOOTNOTE = /^\[\^[^\]\s]+\]:/;
// A paragraph of link reference definitions only has no text left for a setext underline.
// Matched against the line with trailing blanks trimmed, and with one blank run before the
// title: two adjacent blank runs would backtrack quadratically on a wide non-match.
const DEFINITION = /^ {0,3}\[[^\]]+\]:[ \t]*\S+(?:[ \t]+(?:"[^"]*"|'[^']*'|\([^)]*\)))?$/;
// Matched against the line with trailing blanks trimmed: two adjacent blank runs would backtrack quadratically on a wide non-match.
const DELIMITER = /^\|?[ \t]*:?-+:?[ \t]*(?:\|[ \t]*:?-+:?[ \t]*)*\|?$/;

function backslashes(line: string, at: number): number {
  let n = 0;
  while (at - n - 1 >= 0 && line[at - n - 1] === '\\') n++;
  return n;
}

/** Cell ranges of a table row, outer pipes dropped; a backslash-pipe does not split. */
function cellsOf(line: string, base: number): Seg[] {
  const cells: Seg[] = [];
  let from = line.length - line.trimStart().length;
  let to = line.trimEnd().length;
  if (line[from] === '|') from++;
  if (to > from && line[to - 1] === '|' && backslashes(line, to - 1) % 2 === 0) to--;
  let cell = from;
  for (let i = from; i < to; i++) {
    if (line[i] === '|' && backslashes(line, i) % 2 === 0) {
      cells.push([base + cell, base + i]);
      cell = i + 1;
    }
  }
  cells.push([base + cell, base + to]);
  return cells;
}

interface Run {
  seg: number;
  pos: number;
  len: number;
}

/**
 * Inline code spans over the lines of one paragraph, heading or table cell.
 * A run of n backticks opens a span closing at the next run of exactly n;
 * with no such run it is literal. A backslash makes the next character
 * literal, so a backslash before an opening run shortens it by one.
 */
function inlineSpans(text: string, segs: readonly Seg[], out: CodeRange[]): void {
  const lines = segs.map(([s, e]) => text.slice(s, e));
  if (!lines.some((l) => l.includes('`'))) return;
  const byLength = new Map<number, Run[]>();
  lines.forEach((line, seg) => {
    for (const m of line.matchAll(/`+/g)) {
      const run = { seg, pos: m.index, len: m[0].length };
      const list = byLength.get(run.len);
      if (list) list.push(run);
      else byLength.set(run.len, [run]);
    }
  });
  const next = new Map<number, number>();
  let seg = 0;
  let i = 0;
  const special = /[`\\<]/g;
  while (seg < lines.length) {
    const line = lines[seg] ?? '';
    special.lastIndex = i;
    const m = special.exec(line);
    if (!m) {
      seg++;
      i = 0;
      continue;
    }
    const at = m.index;
    if (m[0] === '\\') i = at + 2;
    else if (m[0] === '<') {
      INLINE_HTML.lastIndex = 0;
      const tag = INLINE_HTML.exec(line.slice(at, at + MAX_INLINE_HTML));
      i = at + (tag ? tag[0].length : 1);
    } else {
      let stop = at;
      while (line[stop] === '`') stop++;
      const list = byLength.get(stop - at) ?? [];
      // The first run of this length after the opener. The walk only moves forward,
      // so each length keeps a cursor instead of searching its list again.
      let k = next.get(stop - at) ?? 0;
      while (
        list[k] &&
        ((list[k]?.seg ?? 0) < seg || (list[k]?.seg === seg && (list[k]?.pos ?? 0) < stop))
      )
        k++;
      next.set(stop - at, k);
      const close = list[k];
      if (close) {
        const [from = 0] = segs[seg] ?? [];
        const [closeFrom = 0] = segs[close.seg] ?? [];
        out.push({ start: from + at, end: closeFrom + close.pos + close.len, block: false });
        seg = close.seg;
        i = close.pos + close.len;
      } else i = stop;
    }
  }
}

function addBlock(out: CodeRange[], start: number, end: number): void {
  const last = out.at(-1);
  // Merge consecutive lines (a line break or CRLF apart) into one range.
  if (last?.block && start - last.end <= 2) last.end = end;
  else out.push({ start, end, block: true });
}

/**
 * Code ranges of `text` in document order, from line start `from` on. Block
 * ranges cover whole lines, container markers included. Raw HTML blocks are
 * not code but do keep a fence-like line inside them from opening a fence.
 */
export function codeRanges(text: string, from = 0): CodeRange[] {
  const out: CodeRange[] = [];
  const stack: Box[] = [];
  let leaf: Leaf | null = null;
  // The cursor in the current line: offset, column (tabs to multiples of four) and line end.
  let off = 0;
  let col = 0;
  let end = 0;
  let ni = 0;
  let ncol = 0;

  // Closures assign `leaf`, so reads go through here to keep its declared type.
  const tipOf = (): Leaf | null => leaf;
  const endLeaf = () => {
    if (leaf?.kind === 'para') inlineSpans(text, leaf.segs, out);
    leaf = null;
  };
  const nonspace = () => {
    let i = off;
    let k = col;
    for (; i < end; i++) {
      const ch = text.charCodeAt(i);
      if (ch === 32) k++;
      else if (ch === 9) k += 4 - (k % 4);
      else break;
    }
    ni = i;
    ncol = k;
  };
  // A tab only partly consumed keeps its offset and moves the column.
  const advance = (n: number) => {
    let left = n;
    while (left > 0 && off < end) {
      if (text.charCodeAt(off) === 9) {
        const width = 4 - (col % 4);
        if (width > left) {
          col += left;
          return;
        }
        col += width;
        left -= width;
      } else {
        col++;
        left--;
      }
      off++;
    }
  };
  const spaceAt = (i: number) => i < end && (text.charCodeAt(i) === 32 || text.charCodeAt(i) === 9);
  const fill = () => {
    const box = stack.at(-1);
    if (box) box.filled = true;
  };
  const row = (s: number, e: number) => {
    for (const cell of cellsOf(text.slice(s, e), s)) inlineSpans(text, [cell], out);
  };

  for (let pos = from; pos < text.length; ) {
    const nl = text.indexOf('\n', pos);
    const lineStart = pos;
    pos = nl < 0 ? text.length + 1 : nl + 1;
    end = nl < 0 ? text.length : nl;
    if (end > lineStart && text[end - 1] === '\r') end--;
    off = lineStart;
    col = 0;

    // Containers that carry on through this line.
    let kept = 0;
    for (; kept < stack.length; kept++) {
      const box = stack[kept];
      if (!box) break;
      nonspace();
      if (box.quote) {
        if (ni >= end || text[ni] !== '>' || ncol - col > 3) break;
        advance(ncol - col + 1);
        if (spaceAt(off)) advance(1);
      } else if (ni >= end) {
        if (!box.filled) break;
        off = end;
      } else if (ncol - col >= box.width) advance(box.width);
      else break;
    }
    const all = kept === stack.length;
    // Ends everything below the kept containers, and the open leaf.
    const open = () => {
      endLeaf();
      stack.length = kept;
    };

    let done = false;
    let carry = false;
    const current = tipOf();
    if (all && current) {
      nonspace();
      const blank = ni >= end;
      if (current.kind === 'fence') {
        addBlock(out, lineStart, end);
        if (ncol - col < 4 && closesFence(text.slice(ni, end), current.fence)) leaf = null;
        done = true;
      } else if (current.kind === 'indented') {
        if (blank) done = true;
        else if (ncol - col >= 4) {
          addBlock(out, lineStart, end);
          done = true;
        } else leaf = null;
      } else if (current.kind === 'html') {
        if (blank && current.end === null) leaf = null;
        else {
          done = true;
          if (current.end?.test(text.slice(off, end))) leaf = null;
        }
      } else if (blank) endLeaf();
      else carry = true;
    }

    // New blocks that start on this line, then what is left of it.
    while (!done) {
      nonspace();
      if (ni >= end) break;
      const indent = ncol - col;
      const paragraph = tipOf()?.kind === 'para';
      if (indent >= 4) {
        if (paragraph) break;
        open();
        leaf = { kind: 'indented' };
        fill();
        addBlock(out, lineStart, end);
        done = true;
        break;
      }
      const rest = text.slice(ni, end);
      if (rest.startsWith('>') && stack.length < MAX_DEPTH) {
        open();
        fill();
        stack.push({ quote: true, width: 0, filled: false });
        kept = stack.length;
        advance(indent + 1);
        if (spaceAt(off)) advance(1);
        continue;
      }
      if (/^#{1,6}(?:[ \t]|$)/.test(rest)) {
        open();
        fill();
        inlineSpans(text, [[ni, end]], out);
        done = true;
        break;
      }
      const fence = openFence(rest);
      if (fence) {
        open();
        fill();
        leaf = { kind: 'fence', fence };
        addBlock(out, lineStart, end);
        done = true;
        break;
      }
      if (rest.startsWith('<')) {
        // micromark starts a lone-tag HTML block even on a lazy line, inside the
        // container the paragraph was in (CommonMark would take it as paragraph text).
        const lazy = paragraph && !carry;
        const type = HTML_START.findIndex(
          (re, k) => re.test(rest) && (k < 6 || !paragraph || lazy)
        );
        if (type >= 0) {
          if (lazy && type === 6) endLeaf();
          else open();
          fill();
          const close = HTML_END[type] ?? null;
          leaf = close?.test(rest) ? null : { kind: 'html', end: close };
          done = true;
          break;
        }
      }
      const para = tipOf();
      if (
        para?.kind === 'para' &&
        carry &&
        SETEXT.test(rest) &&
        !para.segs.every(([s, e]) => DEFINITION.test(text.slice(s, e).trimEnd()))
      ) {
        endLeaf();
        done = true;
        break;
      }
      if (THEMATIC.test(rest)) {
        open();
        fill();
        done = true;
        break;
      }
      const note = FOOTNOTE.exec(rest);
      if (note && stack.length < MAX_DEPTH) {
        open();
        fill();
        stack.push({ quote: false, width: 4, filled: false });
        kept = stack.length;
        advance(indent + note[0].length);
        nonspace();
        advance(ncol - col);
        continue;
      }
      const marker = LIST_MARKER.exec(rest);
      const empty = marker !== null && rest.slice(marker[0].length).trim() === '';
      // An empty item, or an ordered one not numbered 1, cannot interrupt a paragraph
      // that carries on; a lazy line has left the paragraph's container, so it can.
      const blocked =
        paragraph && carry && (empty || (marker?.[1] !== undefined && marker[1] !== '1'));
      if (marker && !blocked && stack.length < MAX_DEPTH) {
        open();
        fill();
        advance(indent + marker[0].length);
        const spacesFrom = col;
        const offFrom = off;
        do advance(1);
        while (col - spacesFrom < 5 && spaceAt(off));
        const gap = col - spacesFrom;
        let width = indent + marker[0].length + gap;
        if (gap >= 5 || gap < 1 || off >= end) {
          width = indent + marker[0].length + 1;
          col = spacesFrom;
          off = offFrom;
          if (spaceAt(off)) advance(1);
        }
        stack.push({ quote: false, width, filled: false });
        kept = stack.length;
        continue;
      }
      break;
    }

    if (done) continue;
    nonspace();
    const tip = tipOf();
    if (ni >= end) open();
    else if (tip?.kind === 'para' && !all) tip.segs.push([ni, end]);
    else if (tip?.kind === 'para' && carry) {
      const header = tip.segs.at(-1);
      const rest = text.slice(ni, end);
      if (
        header &&
        ncol - col < 4 &&
        rest.includes('|') &&
        DELIMITER.test(rest.trimEnd()) &&
        cellsOf(text.slice(header[0], header[1]), header[0]).length === cellsOf(rest, ni).length
      ) {
        // The paragraph lines above the header stay a paragraph.
        tip.segs.pop();
        endLeaf();
        row(header[0], header[1]);
        leaf = { kind: 'table' };
      } else tip.segs.push([ni, end]);
    } else if (tip?.kind === 'table' && carry) row(ni, end);
    else {
      open();
      fill();
      leaf = { kind: 'para', segs: [[ni, end]] };
    }
  }
  endLeaf();
  return out;
}

/** Whether `pos` lies in one of `ranges` (sorted, disjoint, as `codeRanges` returns them). */
/**
 * The items (wiki tokens, image links) that do not start in code, given the
 * end of the front matter (-1 for none): one scan, then a lookup per item.
 */
export function outsideCode<T extends { start: number }>(
  text: string,
  items: T[],
  frontMatterEnd: number
): T[] {
  if (items.length === 0) return items;
  const code = codeRanges(text, frontMatterEnd < 0 ? 0 : frontMatterEnd + 1);
  return items.filter((item) => !inCode(code, item.start));
}

export function inCode(ranges: readonly CodeRange[], pos: number): boolean {
  let lo = 0;
  let hi = ranges.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    const range = ranges[mid];
    if (!range || range.end <= pos) lo = mid + 1;
    else hi = mid;
  }
  const found = ranges[lo];
  return found !== undefined && found.start <= pos;
}
