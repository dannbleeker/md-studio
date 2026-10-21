import { PluginKey } from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';

/**
 * The folds of Read view: which headings (by their place among the
 * top-level ones) have their section hidden. Kept apart from the rest of
 * Read view, which loads later, because the plugin state and the outline's
 * "unfold" need to be there from the start. A plugin's key is a string, and
 * a transaction carries meta by it, so nothing here needs the lazy code.
 */
export type Folds = ReadonlySet<number>;
export type FoldMeta = { toggle: number } | { expandAll: true };

export const folds = new PluginKey<Folds>('read-folds');
/** What `folds` is called in a transaction's meta. */
export const READ_FOLDS_KEY = 'read-folds$';

/** The next fold state for a transaction's meta (a toggle, or all unfolded). */
export function applyFoldMeta(value: Folds, meta: FoldMeta | undefined): Folds {
  if (!meta) return value;
  if ('expandAll' in meta) return value.size === 0 ? value : new Set<number>();
  const next = new Set(value);
  if (!next.delete(meta.toggle)) next.add(meta.toggle);
  return next;
}

/** Unfolds every heading, e.g. before jumping to one a fold may be hiding. */
export function expandAllFolds(view: EditorView): void {
  const current = folds.getState(view.state);
  if (current && current.size > 0)
    view.dispatch(view.state.tr.setMeta(READ_FOLDS_KEY, { expandAll: true } satisfies FoldMeta));
}
