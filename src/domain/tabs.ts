/**
 * Open documents as tabs. Pure list operations; the store keeps the active
 * tab's document in its own fields (so the editors stay unaware of tabs)
 * and writes it back here when another tab is activated.
 */
import { isDirty, type MdDocument, UNTITLED } from './document';

export type Tab = {
  id: string;
  doc: MdDocument;
  /** IndexedDB id of the tab's file handle, if it has one. */
  handleId: string | null;
};

export type Tabs = { tabs: Tab[]; activeId: string };

/** An untouched new document: opening a file replaces it instead of adding a tab. */
export function isBlank(tab: Tab): boolean {
  return (
    tab.doc.fileName === UNTITLED &&
    tab.doc.markdown === '' &&
    !isDirty(tab.doc) &&
    tab.handleId === null
  );
}

/** Opens `tab` next to the active one, or in its place when the active tab is blank. */
export function openTab(state: Tabs, tab: Tab): Tabs {
  const index = state.tabs.findIndex((t) => t.id === state.activeId);
  const active = state.tabs[index];
  if (!active) return { tabs: [...state.tabs, tab], activeId: tab.id };
  const tabs = [...state.tabs];
  if (isBlank(active)) tabs.splice(index, 1, tab);
  else tabs.splice(index + 1, 0, tab);
  return { tabs, activeId: tab.id };
}

/**
 * Removes a tab. Closing the active tab activates its right neighbour, or
 * the left one at the end of the strip; `activeId` is null when no tab is left.
 */
export function closeTab(state: Tabs, id: string): { tabs: Tab[]; activeId: string | null } {
  const index = state.tabs.findIndex((t) => t.id === id);
  if (index < 0) return state;
  const tabs = state.tabs.filter((t) => t.id !== id);
  if (id !== state.activeId) return { tabs, activeId: state.activeId };
  const next = tabs[Math.min(index, tabs.length - 1)];
  return { tabs, activeId: next?.id ?? null };
}

/** The tab `step` places away from the active one, wrapping around. */
export function neighbourTab(state: Tabs, step: number): string {
  const n = state.tabs.length;
  const index = state.tabs.findIndex((t) => t.id === state.activeId);
  if (n === 0 || index < 0) return state.activeId;
  return state.tabs[(((index + step) % n) + n) % n]?.id ?? state.activeId;
}

/** The tab already showing the file with this handle, if any. */
export function tabForHandle(tabs: readonly Tab[], handleId: string | null): Tab | undefined {
  return handleId ? tabs.find((t) => t.handleId === handleId) : undefined;
}
