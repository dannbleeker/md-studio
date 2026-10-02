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

/**
 * Cheap top-level block split for `preserveUnchangedBlocks`: runs of
 * non-blank lines, with fenced code kept whole across blank lines. It
 * doesn't need to match the Markdown parser exactly (a loose list becomes
 * several chunks, which compare fine on their own); a full parse per edit
 * costs ~150 ms on a 3,000-line document, this costs ~1 ms.
 */
export function splitBlocks(md: string): BlockRange[] {
  const out: BlockRange[] = [];
  let start = -1;
  let end = 0;
  let fence: string | null = null;
  let pos = 0;
  for (const line of md.split('\n')) {
    const lineEnd = pos + line.length;
    const blank = line.trim() === '';
    if (fence) {
      if (closesFence(line, fence)) fence = null;
      end = lineEnd;
    } else if (blank) {
      if (start >= 0) out.push({ start, end });
      start = -1;
    } else {
      if (start < 0) start = pos;
      end = lineEnd;
      const open = openFence(line);
      if (open) fence = open;
    }
    pos = lineEnd + 1;
  }
  if (start >= 0) out.push({ start, end });
  return out;
}
