import { create } from 'zustand';
import { createDocument, documentTitle, type MdDocument, withFormat } from '@/domain/document';
import { closeTab, isBlank, moveTab, openTab, type Tab } from '@/domain/tabs';
import type { TextFormat } from '@/domain/textFormat';
import { t } from '@/i18n';
import type { RecentEntry } from '@/services/storage';
import * as storage from '@/services/storage';
import { flushEditors } from './flush';
import { type Settings, sanitizeSettings, type ViewMode } from './settings';
import { resetDialogsForTest, showToast } from './ui';
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

  setMarkdown: (markdown: string, source: Exclude<ChangeSource, 'load'>) => void;
  /** Opens a document in a new tab (or in place of a blank one) and shows it. */
  loadDocument: (
    doc: MdDocument,
    handle: FileSystemFileHandle | null,
    handleId?: string | null,
    /** False when the document is itself a recent entry's snapshot. */
    remember?: boolean
  ) => void;
  /**
   * Records a finished save. `written` names the tab the save started in and
   * the exact text written: a save is async (picker, permission, write), and
   * by the time it finishes the user may have typed more or switched tabs.
   */
  markSaved: (
    fileName: string,
    handle: FileSystemFileHandle | null,
    handleId?: string | null,
    /** `format`: the format the file was written in, when the save changed it. */
    written?: { tabId: string; markdown: string; format?: TextFormat }
  ) => void;
  activateTab: (id: string) => void;
  /** Closes a tab without asking; closing the last one returns to the start screen. */
  closeTab: (id: string) => void;
  moveTab: (id: string, toIndex: number) => void;
  /** Detaches a tab from its file, keeping its text (it becomes an unsaved copy). */
  unlinkTab: (id: string) => void;
  forgetRecent: (entry: RecentEntry) => void;
  clearRecents: () => void;
  /** Replaces the active document with newer text found on disk (no unsaved changes). */
  reloadFromDisk: (markdown: string) => void;
  /** Re-attaches the open document's file after a reload. */
  restoreFileHandle: (handle: FileSystemFileHandle) => void;
  setScreen: (screen: Screen) => void;
  setViewMode: (mode: ViewMode) => void;
  updateSettings: (patch: Partial<Settings>) => void;
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
  return syncedTabs(s).map((tab) =>
    tab.id === s.activeTabId ? { ...tab, ...withView(captureView(tab.view)) } : tab
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
    // A returning user lands back in their documents; first-time users,
    // and anyone who closed every tab (one blank tab left), see the start
    // screen instead of a blank editor.
    screen: (restored && !(tabs.length === 1 && isBlank(active)) ? 'editor' : 'start') as Screen,
    viewMode: settings.defaultViewMode,
    settings,
    recents: storage.loadRecents(),
  };
}

export const useStore = create<State>()((set, get) => ({
  ...initialState(),

  setMarkdown: (markdown, source) => {
    if (markdown === get().doc.markdown) return;
    set((s) => ({ doc: { ...s.doc, markdown, updatedAt: Date.now() }, source }));
  },

  loadDocument: (doc, handle, handleId = null, remember = true) => {
    flushEditors();
    const id = handle ? handleId : null;
    const tab: OpenTab = { id: newTabId(), doc, handleId: id, fileHandle: handle };
    set((s) => {
      const { tabs } = openTab({ tabs: leaveActive(s), activeId: s.activeTabId }, tab);
      // A blank tab the file took the place of is closed: merging must not
      // bring it back from storage.
      if (!tabs.some((t) => t.id === s.activeTabId)) closedTabIds.add(s.activeTabId);
      return { tabs: tabs as OpenTab[], ...show(tab, s.loadId), screen: 'editor' };
    });
    if (remember && (doc.markdown || handle)) rememberRecent(doc, id);
  },

  markSaved: (fileName, handle, handleId = null, written) => {
    const s = get();
    const tabId = written?.tabId ?? s.activeTabId;
    const savedMarkdown = written?.markdown ?? s.doc.markdown;
    const format = written?.format;
    const savedFields = (entry: Pick<OpenTab, 'doc' | 'fileHandle' | 'handleId'>) => ({
      doc: {
        ...(format ? withFormat(entry.doc, format) : entry.doc),
        fileName,
        savedMarkdown,
      },
      fileHandle: handle ?? entry.fileHandle,
      handleId: handle ? handleId : entry.handleId,
    });
    if (tabId === s.activeTabId) {
      set(savedFields(s));
      rememberRecent({ ...get().doc, markdown: savedMarkdown }, get().handleId);
      return;
    }
    // The user switched tabs while the save ran: update that tab's entry.
    const tab = s.tabs.find((t) => t.id === tabId);
    if (!tab) return;
    const saved: OpenTab = { ...tab, ...savedFields(tab) };
    set({ tabs: s.tabs.map((t) => (t.id === tabId ? saved : t)) });
    rememberRecent({ ...saved.doc, markdown: savedMarkdown }, saved.handleId);
  },

  activateTab: (id) => {
    flushEditors();
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
    flushEditors();
    closedTabIds.add(id);
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

  unlinkTab: (id) =>
    set((s) =>
      id === s.activeTabId
        ? { fileHandle: null, handleId: null }
        : {
            tabs: s.tabs.map((tab) =>
              tab.id === id ? { ...tab, fileHandle: null, handleId: null } : tab
            ),
          }
    ),

  reloadFromDisk: (markdown) =>
    set((s) => ({
      doc: { ...s.doc, markdown, savedMarkdown: markdown, updatedAt: Date.now() },
      source: 'load',
      loadId: s.loadId + 1,
      // Stay where the reader was; the panes clamp if the text got shorter.
      restoreView: captureView(undefined) ?? null,
    })),

  restoreFileHandle: (fileHandle) => set({ fileHandle }),

  setScreen: (screen) => set({ screen }),
  setViewMode: (viewMode) => set({ viewMode }),
  updateSettings: (patch) => {
    const settings = { ...get().settings, ...patch };
    storage.saveSettings(settings);
    set({ settings });
  },
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
  resetDialogsForTest();
}

/** Tabs closed in this window, so merging never brings them back. */
const closedTabIds = new Set<string>();
let warnedStorageFull = false;

/** The store changed since the last write (a write on page hide needs no other reason). */
let unpersisted = false;

/**
 * Writes the open tabs. Another window of the app shares the same storage:
 * tabs it saved that this window doesn't know (and didn't close) are kept,
 * and so is its copy of a shared tab when that copy was edited more
 * recently, so an idle window never writes its old copy over newer work.
 * Warns once if the tabs no longer fit.
 */
function persist(): void {
  unpersisted = false;
  const s = useStore.getState();
  const stored = new Map((storage.loadTabs()?.tabs ?? []).map((tab) => [tab.id, tab]));
  const mine = syncedTabs(s).map(({ id, doc, handleId }) => {
    const theirs = stored.get(id);
    return theirs && theirs.doc.updatedAt > doc.updatedAt ? theirs : { id, doc, handleId };
  });
  const ids = new Set(mine.map((tab) => tab.id));
  const others = [...stored.values()].filter(
    (tab) => !ids.has(tab.id) && !closedTabIds.has(tab.id)
  );
  const ok = storage.saveTabs({ activeId: s.activeTabId, tabs: [...mine, ...others] });
  if (!ok && !warnedStorageFull) {
    warnedStorageFull = true;
    showToast(t('toast.storageFull'), undefined, 12000);
  }
  if (ok) warnedStorageFull = false;
}

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
  unpersisted = true;
  clearTimeout(persistTimer);
  persistTimer = setTimeout(persist, 300);
});

// Flush on tab close / app switch so the last keystrokes are not lost.
if (typeof window !== 'undefined') {
  const flush = () => {
    flushEditors();
    clearTimeout(persistTimer);
    if (unpersisted) persist();
  };
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
}
