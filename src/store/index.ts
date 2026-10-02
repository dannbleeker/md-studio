import { create } from 'zustand';
import { createDocument, documentTitle, type MdDocument } from '@/domain/document';
import { closeTab, moveTab, openTab, type Tab } from '@/domain/tabs';
import type { RecentEntry } from '@/services/storage';
import * as storage from '@/services/storage';
import { type Settings, sanitizeSettings, type ViewMode } from './settings';
import { captureView, type TabView } from './viewState';

/**
 * Who produced the latest `markdown`. Each pane ignores updates it made
 * itself, which is what stops the visual ⇄ text sync from echoing forever.
 */
export type ChangeSource = 'text' | 'visual' | 'load';

type Screen = 'start' | 'editor';

/** A tab plus its live file handle (handles can't be serialized). */
export type OpenTab = Tab & {
  fileHandle: FileSystemFileHandle | null;
  /** Cursor and scroll when the tab was last left (memory only). */
  view?: TabView;
};

type State = {
  /**
   * Open documents in tab order. The active tab's entry may be stale: its
   * live state is `doc` / `fileHandle` / `handleId` below, which the editors
   * read, and is written back here when another tab is activated.
   */
  tabs: OpenTab[];
  activeTabId: string;
  doc: MdDocument;
  source: ChangeSource;
  /** Bumped on every load so panes can reset selection/scroll for a new file. */
  loadId: number;
  /** Where the panes should put cursor and scroll for this load (null: the top). */
  restoreView: TabView | null;
  fileHandle: FileSystemFileHandle | null;
  /** IndexedDB id of `fileHandle` (persisted, so the handle survives a reload). */
  handleId: string | null;
  screen: Screen;
  viewMode: ViewMode;
  settings: Settings;
  recents: RecentEntry[];
  settingsOpen: boolean;
  paletteOpen: boolean;
  exportOpen: boolean;
  findOpen: boolean;
  findWithReplace: boolean;

  setMarkdown: (markdown: string, source: Exclude<ChangeSource, 'load'>) => void;
  /** Opens a document in a new tab (or in place of a blank one) and shows it. */
  loadDocument: (
    doc: MdDocument,
    handle: FileSystemFileHandle | null,
    handleId?: string | null
  ) => void;
  markSaved: (
    fileName: string,
    handle: FileSystemFileHandle | null,
    handleId?: string | null
  ) => void;
  activateTab: (id: string) => void;
  /** Closes a tab without asking; closing the last one returns to the start screen. */
  closeTab: (id: string) => void;
  moveTab: (id: string, toIndex: number) => void;
  forgetRecent: (entry: RecentEntry) => void;
  clearRecents: () => void;
  /** Re-attaches the open document's file after a reload. */
  restoreFileHandle: (handle: FileSystemFileHandle) => void;
  setScreen: (screen: Screen) => void;
  setViewMode: (mode: ViewMode) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  setSettingsOpen: (open: boolean) => void;
  setPaletteOpen: (open: boolean) => void;
  setExportOpen: (open: boolean) => void;
  setFind: (open: boolean, withReplace?: boolean) => void;
};

let tabCounter = 0;
const newTabId = () => `tab-${Date.now().toString(36)}-${(tabCounter++).toString(36)}`;

const blankTab = (): OpenTab => ({
  id: newTabId(),
  doc: createDocument(),
  handleId: null,
  fileHandle: null,
});

type LiveTab = Pick<State, 'tabs' | 'activeTabId' | 'doc' | 'fileHandle' | 'handleId'>;

/** The tabs with the active one's live state written back. */
export function syncedTabs(s: LiveTab): OpenTab[] {
  return s.tabs.map((tab) =>
    tab.id === s.activeTabId
      ? { ...tab, doc: s.doc, fileHandle: s.fileHandle, handleId: s.handleId }
      : tab
  );
}

/** The tabs with the active one's live state and current view written back. */
function leaveActive(s: LiveTab): OpenTab[] {
  return s.tabs.map((tab) =>
    tab.id === s.activeTabId
      ? {
          ...tab,
          doc: s.doc,
          fileHandle: s.fileHandle,
          handleId: s.handleId,
          ...withView(captureView(tab.view)),
        }
      : tab
  );
}

// exactOptionalPropertyTypes: leave `view` out rather than set it to undefined.
const withView = (view: TabView | undefined) => (view ? { view } : {});

/** Live fields for showing `tab`; the new `loadId` makes the panes reset for it. */
function show(tab: OpenTab, loadId: number) {
  return {
    activeTabId: tab.id,
    doc: tab.doc,
    fileHandle: tab.fileHandle,
    handleId: tab.handleId,
    source: 'load' as ChangeSource,
    loadId: loadId + 1,
    restoreView: tab.view ?? null,
  };
}

function initialState() {
  const settings = sanitizeSettings(storage.loadSettings());
  const restored = storage.loadTabs();
  const tabs: OpenTab[] = restored
    ? restored.tabs.map((tab) => ({ ...tab, fileHandle: null }))
    : [blankTab()];
  const active = tabs.find((t) => t.id === restored?.activeId) ?? (tabs[0] as OpenTab);
  return {
    tabs,
    ...show(active, -1),
    // A returning user lands back in their documents, not on a blank editor
    // or the start screen; first-time users see the start screen.
    screen: (restored ? 'editor' : 'start') as Screen,
    viewMode: settings.defaultViewMode,
    settings,
    recents: storage.loadRecents(),
    settingsOpen: false,
    paletteOpen: false,
    exportOpen: false,
    findOpen: false,
    findWithReplace: false,
  };
}

export const useStore = create<State>()((set, get) => ({
  ...initialState(),

  setMarkdown: (markdown, source) => {
    if (markdown === get().doc.markdown) return;
    set((s) => ({ doc: { ...s.doc, markdown, updatedAt: Date.now() }, source }));
  },

  loadDocument: (doc, handle, handleId = null) => {
    const id = handle ? handleId : null;
    const tab: OpenTab = { id: newTabId(), doc, handleId: id, fileHandle: handle };
    set((s) => {
      const { tabs } = openTab({ tabs: leaveActive(s), activeId: s.activeTabId }, tab);
      return { tabs: tabs as OpenTab[], ...show(tab, s.loadId), screen: 'editor' };
    });
    if (doc.markdown || handle) rememberRecent(doc, id);
  },

  markSaved: (fileName, handle, handleId = null) => {
    set((s) => ({
      doc: { ...s.doc, fileName, savedMarkdown: s.doc.markdown },
      fileHandle: handle ?? s.fileHandle,
      handleId: handle ? handleId : s.handleId,
    }));
    rememberRecent(get().doc, get().handleId);
  },

  activateTab: (id) => {
    const s = get();
    if (id === s.activeTabId) {
      set({ screen: 'editor' });
      return;
    }
    const tabs = leaveActive(s);
    const target = tabs.find((t) => t.id === id);
    if (target) set({ tabs, ...show(target, s.loadId), screen: 'editor' });
  },

  closeTab: (id) => {
    const s = get();
    const result = closeTab({ tabs: leaveActive(s), activeId: s.activeTabId }, id);
    const tabs = result.tabs as OpenTab[];
    const next = tabs.find((t) => t.id === result.activeId);
    if (!next) {
      const blank = blankTab();
      set({ tabs: [blank], ...show(blank, s.loadId), screen: 'start' });
    } else if (next.id !== s.activeTabId) {
      set({ tabs, ...show(next, s.loadId) });
    } else {
      set({ tabs });
    }
  },

  forgetRecent: (entry) => set({ recents: storage.removeRecent(entry) }),
  clearRecents: () => {
    storage.clearRecents();
    set({ recents: [] });
  },

  moveTab: (id, toIndex) => set((s) => ({ tabs: moveTab(s.tabs, id, toIndex) })),

  restoreFileHandle: (fileHandle) => set({ fileHandle }),

  setScreen: (screen) => set({ screen }),
  setViewMode: (viewMode) => set({ viewMode }),
  updateSettings: (patch) => {
    const settings = { ...get().settings, ...patch };
    storage.saveSettings(settings);
    set({ settings });
  },
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  setExportOpen: (exportOpen) => set({ exportOpen }),
  setFind: (findOpen, withReplace) =>
    set((s) => ({ findOpen, findWithReplace: withReplace ?? s.findWithReplace })),
}));

function rememberRecent(doc: MdDocument, handleId: string | null) {
  const recents = storage.pushRecent({
    fileName: doc.fileName,
    title: documentTitle(doc.markdown),
    markdown: doc.markdown,
    openedAt: Date.now(),
    ...(handleId ? { handleId } : {}),
  });
  useStore.setState({ recents });
}

/** Test helper: rebuilds state from (possibly freshly seeded) storage. */
export function resetStoreForTest(): void {
  useStore.setState(initialState());
}

const persistable = (s: State) => ({
  activeId: s.activeTabId,
  tabs: syncedTabs(s).map(({ id, doc, handleId }) => ({ id, doc, handleId })),
});

// Debounced so a burst of keystrokes costs one localStorage write.
let persistTimer: ReturnType<typeof setTimeout> | undefined;
useStore.subscribe((state, prev) => {
  if (
    state.doc === prev.doc &&
    state.tabs === prev.tabs &&
    state.activeTabId === prev.activeTabId &&
    state.handleId === prev.handleId
  )
    return;
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => storage.saveTabs(persistable(useStore.getState())), 300);
});

// Flush on tab close / app switch so the last keystrokes are not lost.
if (typeof window !== 'undefined') {
  const flush = () => {
    clearTimeout(persistTimer);
    storage.saveTabs(persistable(useStore.getState()));
  };
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
}
