import { create } from 'zustand';
import { createDocument, documentTitle, type MdDocument } from '@/domain/document';
import type { RecentEntry } from '@/services/storage';
import * as storage from '@/services/storage';
import { type Settings, sanitizeSettings, type ViewMode } from './settings';

/**
 * Who produced the latest `markdown`. Each pane ignores updates it made
 * itself, which is what stops the visual ⇄ text sync from echoing forever.
 */
export type ChangeSource = 'text' | 'visual' | 'load';

type Screen = 'start' | 'editor';

type State = {
  doc: MdDocument;
  source: ChangeSource;
  /** Bumped on every load so panes can reset selection/scroll for a new file. */
  loadId: number;
  fileHandle: FileSystemFileHandle | null;
  screen: Screen;
  viewMode: ViewMode;
  settings: Settings;
  recents: RecentEntry[];
  settingsOpen: boolean;
  paletteOpen: boolean;
  exportOpen: boolean;

  setMarkdown: (markdown: string, source: Exclude<ChangeSource, 'load'>) => void;
  loadDocument: (doc: MdDocument, handle: FileSystemFileHandle | null) => void;
  markSaved: (fileName: string, handle: FileSystemFileHandle | null) => void;
  setScreen: (screen: Screen) => void;
  setViewMode: (mode: ViewMode) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  setSettingsOpen: (open: boolean) => void;
  setPaletteOpen: (open: boolean) => void;
  setExportOpen: (open: boolean) => void;
};

function initialState() {
  const settings = sanitizeSettings(storage.loadSettings());
  const restored = storage.loadDocument();
  return {
    doc: restored ?? createDocument(),
    source: 'load' as ChangeSource,
    loadId: 0,
    fileHandle: null,
    // A returning user lands back in their document, not on a blank editor
    // or the start screen; first-time users see the start screen.
    screen: (restored ? 'editor' : 'start') as Screen,
    viewMode: settings.defaultViewMode,
    settings,
    recents: storage.loadRecents(),
    settingsOpen: false,
    paletteOpen: false,
    exportOpen: false,
  };
}

export const useStore = create<State>()((set, get) => ({
  ...initialState(),

  setMarkdown: (markdown, source) => {
    if (markdown === get().doc.markdown) return;
    set((s) => ({ doc: { ...s.doc, markdown, updatedAt: Date.now() }, source }));
  },

  loadDocument: (doc, handle) => {
    set((s) => ({
      doc,
      source: 'load',
      loadId: s.loadId + 1,
      fileHandle: handle,
      screen: 'editor',
    }));
    if (doc.markdown || handle) rememberRecent(doc);
  },

  markSaved: (fileName, handle) => {
    set((s) => ({
      doc: { ...s.doc, fileName, savedMarkdown: s.doc.markdown },
      fileHandle: handle ?? s.fileHandle,
    }));
    rememberRecent(get().doc);
  },

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
}));

function rememberRecent(doc: MdDocument) {
  const recents = storage.pushRecent({
    fileName: doc.fileName,
    title: documentTitle(doc.markdown),
    markdown: doc.markdown,
    openedAt: Date.now(),
  });
  useStore.setState({ recents });
}

/** Test helper: rebuilds state from (possibly freshly seeded) storage. */
export function resetStoreForTest(): void {
  useStore.setState(initialState());
}

// Debounced so a burst of keystrokes costs one localStorage write.
let persistTimer: ReturnType<typeof setTimeout> | undefined;
useStore.subscribe((state, prev) => {
  if (state.doc === prev.doc) return;
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => storage.saveDocument(useStore.getState().doc), 300);
});

// Flush on tab close / app switch so the last keystrokes are not lost.
if (typeof window !== 'undefined') {
  const flush = () => {
    clearTimeout(persistTimer);
    storage.saveDocument(useStore.getState().doc);
  };
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
}
