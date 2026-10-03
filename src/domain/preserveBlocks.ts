/**
 * Keep the user's own Markdown style when the visual pane edits.
 *
 * The visual pane re-serializes the WHOLE document after every edit, which
 * would rewrite untouched parts too (`*` bullets become `-`, `__bold__`
 * becomes `**bold**`, setext headings become ATX…). This takes the old
 * source and the serializer's new output, and keeps the old source text for
 * every leading and trailing top-level block whose meaning didn't change.
 * Only the contiguous run of blocks that really changed takes the
 * serializer's text — the same idea as `minimalChange`, one level up.
 *
 * `blocksOf` returns top-level block ranges (offsets into the string);
 * `norm` maps a block's source to a canonical form (parse + serialize), so
 * two blocks are "the same" exactly when they mean the same thing.
 */

import { closesFence, openFence } from './fences';
import { frontMatterEnd } from './frontMatter';

export type BlockRange = { start: number; end: number };

export type PreserveResult = {
  text: string;
  /**
   * The rewritten region plus one neighbouring block on each side, as
   * offsets into `text` and into the serializer's `newMd`. Comparing just
   * these two slices is enough to check the merge, because Markdown
   * context is local to adjacent blocks (except link reference
   * definitions, which callers check for separately).
   */
  check: { text: BlockRange; newMd: BlockRange } | null;
};

export function preserveUnchangedBlocks(
  oldMd: string,
  newMd: string,
  blocksOf: (md: string) => BlockRange[],
  norm: (blockSource: string) => string
): PreserveResult {
  if (oldMd === newMd) return { text: newMd, check: null };
  const oldBlocks = blocksOf(oldMd);
  const newBlocks = blocksOf(newMd);
  const oldText = (i: number) => oldMd.slice(oldBlocks[i]!.start, oldBlocks[i]!.end);
  const newText = (i: number) => newMd.slice(newBlocks[i]!.start, newBlocks[i]!.end);
  const same = (o: number, n: number) => norm(oldText(o)) === norm(newText(n));

  const oldN = oldBlocks.length;
  const newN = newBlocks.length;
  let p = 0;
  while (p < oldN && p < newN && same(p, p)) p++;
  let s = 0;
  while (s < oldN - p && s < newN - p && same(oldN - 1 - s, newN - 1 - s)) s++;

  // Nothing worth keeping: the serializer's text is the answer.
  if (p === 0 && s === 0) return { text: newMd, check: null };

  const middle = newN - s > p ? newMd.slice(newBlocks[p]!.start, newBlocks[newN - s - 1]!.end) : '';
  const head = p > 0 ? oldMd.slice(0, oldBlocks[p - 1]!.end) : '';
  const tail =
    s > 0
      ? oldMd.slice(oldBlocks[oldN - s]!.start)
      : newMd.slice(newBlocks.at(-1)?.end ?? newMd.length);

  // Separators: reuse the old gap where an old block boundary survives,
  // otherwise a blank line (what the serializer itself writes).
  const oldGap = (i: number) => oldMd.slice(oldBlocks[i]!.end, oldBlocks[i + 1]!.start);
  const hadOldMiddle = oldN - s > p;
  let out = head;
  if (middle) {
    if (head) out += hadOldMiddle ? oldGap(p - 1) : '\n\n';
    out += middle;
    // Pure insertion: the new block takes a blank line, and the original
    // gap stays in front of the block that followed it.
    if (s > 0) out += hadOldMiddle || p > 0 ? oldGap(oldN - s - 1) : '\n\n';
  } else if (head && s > 0) {
    out += hadOldMiddle ? oldGap(oldN - s - 1) : oldGap(p - 1);
  }
  const tailStart = out.length;
  out += tail;

  const firstSuffix = oldBlocks[oldN - s];
  return {
    text: out,
    check: {
      text: {
        start: p > 0 ? oldBlocks[p - 1]!.start : 0,
        end: s > 0 && firstSuffix ? tailStart + (firstSuffix.end - firstSuffix.start) : out.length,
      },
      newMd: {
        start: p > 0 ? newBlocks[p - 1]!.start : 0,
        end: s > 0 ? newBlocks[newN - s]!.end : newMd.length,
      },
    },
  };
}

/** An ATX heading line: always a block of its own. */
const ATX = /^ {0,3}#{1,6}(?:[ \t]|$)/;
/** A setext underline (after paragraph text) or, at a block's start, a thematic break. */
const SETEXT = /^ {0,3}(?:=+|-+)[ \t]*$/;
const THEMATIC_BREAK = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;

/**
 * HTML blocks that run across blank lines until their end marker
 * (CommonMark types 1-5: raw text elements, comments, processing
 * instructions, declarations, CDATA), as [start, end] patterns.
 */
const HTML_BLOCKS: Array<[RegExp, RegExp]> = [
  [/^ {0,3}<(?:script|pre|style|textarea)(?=[\s>]|$)/i, /<\/(?:script|pre|style|textarea)>/i],
  [/^ {0,3}<!--/, /-->/],
  [/^ {0,3}<\?/, /\?>/],
  [/^ {0,3}<![A-Za-z]/, />/],
  [/^ {0,3}<!\[CDATA\[/, /\]\]>/],
];

/** The end marker an HTML block opened on `line` still waits for, or null. */
function openHtmlBlock(line: string): RegExp | null {
  for (const [open, close] of HTML_BLOCKS) {
    const m = open.exec(line);
    if (m) return close.test(line.slice(m[0].length)) ? null : close;
  }
  return null;
}

/**
 * Cheap top-level block split for `preserveUnchangedBlocks`: runs of
 * non-blank lines, with fenced code kept whole across blank lines, and a
 * heading or thematic break ending the run it closes (`# Title` directly
 * followed by text is two blocks, as the serializer writes them), and
 * front matter as one block, as the visual pane parses it. It
 * doesn't need to match the Markdown parser exactly (a loose list becomes
 * several chunks, which compare fine on their own, and the merge is
 * verified anyway); a full parse per edit costs ~150 ms on a 3,000-line
 * document, this costs ~1 ms.
 */
export function splitBlocks(md: string): BlockRange[] {
  const out: BlockRange[] = [];
  let start = -1;
  let end = 0;
  let fence: string | null = null;
  let html: RegExp | null = null;
  const front = frontMatterEnd(md);
  if (front >= 0) out.push({ start: 0, end: front });
  let pos = front >= 0 ? front + 1 : 0;
  const close = () => {
    if (start >= 0) out.push({ start, end });
    start = -1;
  };
  for (const line of md.slice(pos).split('\n')) {
    const lineEnd = pos + line.length;
    const blank = line.trim() === '';
    if (fence) {
      if (closesFence(line, fence)) fence = null;
      end = lineEnd;
    } else if (html) {
      if (html.test(line)) html = null;
      end = lineEnd;
    } else if (blank) {
      close();
    } else if (ATX.test(line) || (start < 0 && THEMATIC_BREAK.test(line))) {
      // A block of its own, ending whatever came before.
      close();
      out.push({ start: pos, end: lineEnd });
    } else if (start >= 0 && SETEXT.test(line)) {
      // Underlines the paragraph so far into a heading, which ends there.
      end = lineEnd;
      close();
    } else {
      if (start < 0) start = pos;
      end = lineEnd;
      const open = openFence(line);
      if (open) fence = open;
      else html = openHtmlBlock(line);
    }
    pos = lineEnd + 1;
  }
  close();
  return out;
}
