import { type BlockRange, splitBlocks } from './preserveBlocks';

/**
 * Where two versions of a document differ, at block granularity, widened by
 * one unchanged block on each side for parsing context. Used to re-parse
 * only that slice for the visual pane instead of the whole document.
 */
export type ChangedRegion = {
  /** Source slices to re-parse. Empty string when the region is empty. */
  oldText: string;
  newText: string;
  /** The widened region includes an unchanged block before / after the edit. */
  leadingContext: boolean;
  trailingContext: boolean;
  /** Fraction of the old document's blocks before the region (0–1), to guide the node search. */
  position: number;
  /** Share of the new document the region covers (0–1). */
  share: number;
};

/** A block starting with a list item marker. */
const LIST_ITEM = /^ {0,3}(?:[-+*]|\d{1,9}[.)])(?:[ \t]|$)/;

/** Null when nothing changed at block level (e.g. only blank lines moved). */
export function changedRegion(oldMd: string, newMd: string): ChangedRegion | null {
  const ob = splitBlocks(oldMd);
  const nb = splitBlocks(newMd);
  const text = (md: string, r: BlockRange) => md.slice(r.start, r.end);
  const same = (i: number, j: number) => text(oldMd, ob[i]!) === text(newMd, nb[j]!);

  let p = 0;
  while (p < ob.length && p < nb.length && same(p, p)) p++;
  let s = 0;
  while (s < ob.length - p && s < nb.length - p && same(ob.length - 1 - s, nb.length - 1 - s)) s++;
  if (p === ob.length && p === nb.length) return null;

  // A context block must parse alone as it does in the document. An
  // indented block may continue a list item (or quote) that starts
  // earlier, and a list item may continue a loose list: parsed alone, they
  // come out as other nodes, which can then match the wrong place in the
  // visual document. Widen the context to where such a construct starts.
  // The blocks walked over are unchanged, so old and new agree on them.
  const head = (i: number) => text(oldMd, ob[i]!);
  const indented = (i: number) => /^[ \t]/.test(head(i));
  const listItem = (i: number) => LIST_ITEM.test(head(i));
  const continues = (i: number) =>
    indented(i) || (listItem(i) && (listItem(i - 1) || indented(i - 1)));
  let lo = Math.max(0, p - 1);
  while (lo > 0 && continues(lo)) lo--;
  let oldHi = Math.min(ob.length, ob.length - s + 1);
  let newHi = Math.min(nb.length, nb.length - s + 1);
  while (oldHi < ob.length && continues(oldHi)) {
    oldHi++;
    newHi++;
  }
  const slice = (md: string, blocks: BlockRange[], hi: number) =>
    hi > lo ? md.slice(blocks[lo]!.start, blocks[hi - 1]!.end) : '';
  const newText = slice(newMd, nb, newHi);
  return {
    oldText: slice(oldMd, ob, oldHi),
    newText,
    leadingContext: p > 0,
    trailingContext: s > 0,
    position: ob.length ? lo / ob.length : 0,
    share: newMd.length ? newText.length / newMd.length : 1,
  };
}
