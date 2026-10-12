/**
 * Edits an editor has made but not yet reported to the store. The visual
 * pane reports its edits after a short debounce; anything that reads or
 * replaces the document (save, tab switch, page hide) flushes first, so
 * those last keystrokes are neither lost nor written into the wrong tab.
 * Same registry shape as viewState.ts, for the same reason: the editors
 * import the store, not the other way round.
 */
const flushers = new Set<() => void>();

export function registerFlush(flush: () => void): () => void {
  flushers.add(flush);
  return () => flushers.delete(flush);
}

export function flushEditors(): void {
  for (const flush of flushers) flush();
}

/**
 * Printing shows the visual pane even in text-only view, where it skips
 * updates, so it is brought up to date first. Separate from `flushEditors`
 * (which moves edits toward the store): this moves the store toward a pane.
 */
const printPreparers = new Set<() => void>();

export function registerPrepareForPrint(prepare: () => void): () => void {
  printPreparers.add(prepare);
  return () => printPreparers.delete(prepare);
}

export function prepareForPrint(): void {
  for (const prepare of printPreparers) prepare();
}
