import { PluginKey } from '@milkdown/kit/prose/state';
import type { Mapping } from '@milkdown/kit/prose/transform';
import type { EditorView } from '@milkdown/kit/prose/view';

/**
 * The folds of Read view: the headings (by their position) whose section is
 * hidden, for the document loaded as `loadId`. Kept apart from the rest of
 * Read view, which loads later, because the plugin state and the outline's
 * "unfold" need to be there from the start. A plugin's key is a string, and
 * a transaction carries meta by it, so nothing here needs the lazy code.
 */
export type Folds = ReadonlySet<number>;
export type FoldState = { loadId: number; folded: Folds };
export type FoldMeta = { toggle: number } | { expandAll: true };

export const folds = new PluginKey<FoldState>('read-folds');
/** What `folds` is called in a transaction's meta. */
export const READ_FOLDS_KEY = 'read-folds$';

export const NO_FOLDS: Folds = new Set();

/** The next fold state for a transaction's meta (a toggle, or all unfolded). */
export function applyFoldMeta(value: Folds, meta: FoldMeta | undefined): Folds {
  if (!meta) return value;
  if ('expandAll' in meta) return value.size === 0 ? value : NO_FOLDS;
  const next = new Set(value);
  if (!next.delete(meta.toggle)) next.add(meta.toggle);
  return next;
}

/**
 * Follows the folded headings through an edit: a heading added above moves
 * them down. A heading the edit replaced loses its fold (it may be another
 * heading now).
 */
export function mapFolds(value: Folds, mapping: Mapping): Folds {
  if (value.size === 0) return value;
  const next = new Set<number>();
  for (const pos of value) {
    const mapped = mapping.mapResult(pos, 1);
    if (!mapped.deleted) next.add(mapped.pos);
  }
  return next;
}

/** Unfolds every heading, e.g. before jumping to one a fold may be hiding. */
export function expandAllFolds(view: EditorView): void {
  const current = folds.getState(view.state);
  if (current && current.folded.size > 0)
    view.dispatch(view.state.tr.setMeta(READ_FOLDS_KEY, { expandAll: true } satisfies FoldMeta));
}
