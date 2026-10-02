/**
 * Where the user was in a tab: text cursor and both panes' scroll offsets.
 * Kept in memory only, so switching tabs returns to the same spot.
 *
 * Each pane registers a function that reports its part. The store calls
 * them when the active tab is about to change, without having to know the
 * editors (which import the store, not the other way round).
 */
export type TabView = {
  textAnchor: number;
  textHead: number;
  textScroll: number;
  visualScroll: number;
};

const parts = new Set<() => Partial<TabView>>();

export function registerViewPart(read: () => Partial<TabView>): () => void {
  parts.add(read);
  return () => parts.delete(read);
}

/**
 * The current view, on top of `previous`: a hidden pane reports nothing
 * (its scroll offset reads as 0), so its last known position is kept.
 */
export function captureView(previous: TabView | undefined): TabView | undefined {
  if (parts.size === 0) return previous;
  const view: TabView = previous ?? { textAnchor: 0, textHead: 0, textScroll: 0, visualScroll: 0 };
  return Object.assign({ ...view }, ...[...parts].map((read) => read()));
}
