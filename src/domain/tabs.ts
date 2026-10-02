/**
 * Open documents as tabs. Pure list operations; the store keeps the active
 * tab's document in its own fields (so the editors stay unaware of tabs)
 * and writes it back here when another tab is activated.
 */
import { documentTitle, isDirty, type MdDocument, UNTITLED } from './document';

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

/**
 * The tab already showing this file, if any. With a handle id that is
 * exact. Without one (a dropped file, a recent snapshot, browsers without
 * file handles) the best evidence is a tab without a handle that has the
 * same name and was opened from the same content.
 */
export function tabForFile(
  tabs: readonly Tab[],
  file: { handleId: string | null; fileName: string; markdown: string }
): Tab | undefined {
  if (file.handleId) return tabs.find((t) => t.handleId === file.handleId);
  return tabs.find(
    (t) =>
      t.handleId === null &&
      t.doc.fileName === file.fileName &&
      t.doc.savedMarkdown === file.markdown
  );
}

/**
 * Tab captions. Names are shown as they are unless two tabs share one;
 * those get their first heading ("notes.md · Plan"), or a number when
 * that doesn't tell them apart either ("notes.md (2)"). The browser does
 * not expose folders, so a path can't be used.
 */
export function tabLabels(tabs: readonly Tab[]): string[] {
  const byName = new Map<string, Tab[]>();
  for (const tab of tabs) {
    const group = byName.get(tab.doc.fileName) ?? [];
    group.push(tab);
    byName.set(tab.doc.fileName, group);
  }
  return tabs.map((tab) => {
    const name = tab.doc.fileName;
    const group = byName.get(name) ?? [];
    if (group.length < 2) return name;
    const title = documentTitle(tab.doc.markdown);
    const titleIsUnique =
      title && group.filter((t) => documentTitle(t.doc.markdown) === title).length === 1;
    return titleIsUnique ? `${name} · ${title}` : `${name} (${group.indexOf(tab) + 1})`;
  });
}

/** Moves a tab to `toIndex` (clamped), keeping the others in order. */
export function moveTab<T extends Tab>(tabs: readonly T[], id: string, toIndex: number): T[] {
  const moving = tabs.find((t) => t.id === id);
  if (!moving) return [...tabs];
  const rest = tabs.filter((t) => t.id !== id);
  rest.splice(Math.max(0, Math.min(toIndex, rest.length)), 0, moving);
  return rest;
}
