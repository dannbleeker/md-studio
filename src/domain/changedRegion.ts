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

  const lo = Math.max(0, p - 1);
  const slice = (md: string, blocks: BlockRange[], hi: number) =>
    hi > lo ? md.slice(blocks[lo]!.start, blocks[hi - 1]!.end) : '';
  const oldHi = Math.min(ob.length, ob.length - s + 1);
  const newHi = Math.min(nb.length, nb.length - s + 1);
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
