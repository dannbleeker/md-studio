/**
 * User-level document commands shared by the toolbar, start screen,
 * keyboard shortcuts, command palette and file-launch handler.
 */
import { createDocument, isDirty, normalizeFileName } from '@/domain/document';
import { neighbourTab, tabForFile } from '@/domain/tabs';
import { t } from '@/i18n';
import { syncedTabs, useStore } from '@/store';
import { flushEditors } from '@/store/flush';
import { requestConfirm, showToast } from '@/store/ui';
import { type OpenedFile, openFile, readHandle, saveFile } from './fileSystem';
import { ensurePermission, getHandle, pruneHandles, putHandle } from './handleStore';
import { loadTabs, type RecentEntry } from './storage';

/** Asks before closing a tab whose changes are not saved to disk. */
async function confirmClose(id: string): Promise<boolean> {
  const tab = syncedTabs(useStore.getState()).find((t) => t.id === id);
  if (!tab || !isDirty(tab.doc)) return true;
  return requestConfirm({
    title: t('confirm.discard.title'),
    body: t('confirm.discard.body', { name: tab.doc.fileName }),
    confirmLabel: t('confirm.discard.ok'),
  });
}

/** Shows the tab already holding this file, if any; true when it did. */
function showOpenTab(file: Parameters<typeof tabForFile>[1]): boolean {
  const tab = tabForFile(syncedTabs(useStore.getState()), file);
  if (!tab) return false;
  void switchTab(tab.id);
  return true;
}

async function load(file: OpenedFile) {
  // putHandle reuses the id of a handle to the same file, so an id match
  // means the file is already open.
  const handleId = file.handle ? await putHandle(file.handle) : null;
  if (showOpenTab({ handleId, fileName: file.name, markdown: file.markdown })) return;
  useStore.getState().loadDocument(createDocument(file.markdown, file.name), file.handle, handleId);
  showToast(t('toast.opened', { name: file.name }));
  void forgetUnusedHandles();
}

/** Drops stored handles no recent entry or open document points at any more. */
async function forgetUnusedHandles() {
  const state = useStore.getState();
  // Saved tabs count too: another window of the app may still use them.
  const keep = new Set(
    [...state.recents, ...syncedTabs(state), ...(loadTabs()?.tabs ?? [])].flatMap((r) =>
      r.handleId ? [r.handleId] : []
    )
  );
  await pruneHandles(keep);
}

export async function switchTab(id: string): Promise<void> {
  useStore.getState().activateTab(id);
  await restoreDocumentHandle();
  await checkDiskChanges();
}

/** Activates the tab `step` places to the right (negative: left), wrapping. */
export function cycleTab(step: number): void {
  const { tabs, activeTabId } = useStore.getState();
  if (tabs.length > 1) void switchTab(neighbourTab({ tabs, activeId: activeTabId }, step));
}

export async function closeTab(id = useStore.getState().activeTabId): Promise<void> {
  if (!(await confirmClose(id))) return;
  useStore.getState().closeTab(id);
  await restoreDocumentHandle();
  void forgetUnusedHandles();
}

/**
 * After a reload the open document's handle is still in IndexedDB; put it
 * back so Save writes to the file instead of asking where. Permission is
 * requested at the first Save (it needs a user gesture).
 */
export async function restoreDocumentHandle(): Promise<void> {
  const { handleId, fileHandle } = useStore.getState();
  if (!handleId || fileHandle) return;
  const handle = await getHandle(handleId);
  if (handle && useStore.getState().handleId === handleId) {
    useStore.getState().restoreFileHandle(handle);
  }
}

export async function newDocument(): Promise<void> {
  useStore.getState().loadDocument(createDocument(), null);
}

/** Opens what `read` returns (nothing when the user cancelled); a failure becomes a toast. */
async function openOrToast(read: () => Promise<OpenedFile | null>): Promise<void> {
  try {
    const file = await read();
    if (file) await load(file);
  } catch {
    showToast(t('toast.openFailed'));
  }
}

export const openDocument = (): Promise<void> => openOrToast(openFile);

export const openHandle = (handle: FileSystemFileHandle): Promise<void> =>
  openOrToast(() => readHandle(handle));

export const openDroppedFile = (file: File): Promise<void> =>
  openOrToast(async () => ({ name: file.name, markdown: await file.text(), handle: null }));

/**
 * Reopens a recent file from disk when its handle is still usable, so the
 * content is current and Save writes back to it. Otherwise (no handle,
 * permission refused, file moved or deleted) opens the saved snapshot.
 */
export async function openRecent(entry: RecentEntry): Promise<void> {
  if (entry.handleId && showOpenTab({ ...entry, handleId: entry.handleId })) return;
  const handle = entry.handleId ? await getHandle(entry.handleId) : null;
  if (handle) {
    if (await ensurePermission(handle, 'readwrite')) {
      try {
        const file = await readHandle(handle);
        useStore
          .getState()
          .loadDocument(createDocument(file.markdown, file.name), handle, entry.handleId ?? null);
        return;
      } catch {
        showToast(t('toast.recentMissing', { name: entry.fileName }));
      }
    } else {
      showToast(t('toast.recentCopy', { name: entry.fileName }));
    }
  }
  // Falling back to the snapshot: if that very snapshot is already open, show it.
  openSnapshot(entry.markdown, entry.fileName);
}

export async function saveDocument(saveAs = false): Promise<void> {
  // Land the visual pane's pending edits, then pin what this save writes
  // and which tab it belongs to.
  flushEditors();
  const { doc, fileHandle, handleId: startHandleId, activeTabId, markSaved } = useStore.getState();
  const written = { tabId: activeTabId, markdown: doc.markdown };
  try {
    // A handle restored after a reload or from Recent needs write
    // permission again; if refused, fall back to choosing a location.
    const target =
      !saveAs && fileHandle && (await ensurePermission(fileHandle, 'readwrite'))
        ? fileHandle
        : null;
    // The file may have changed since we last read or wrote it (another
    // app, another device syncing the folder): ask before replacing that.
    if (target && (await diskText(target)) !== doc.savedMarkdown) {
      const overwrite = await requestConfirm({
        title: t('confirm.overwrite.title'),
        body: t('confirm.overwrite.body', { name: doc.fileName }),
        confirmLabel: t('confirm.overwrite.ok'),
      });
      if (!overwrite) return;
    }
    const result = await saveFile(doc.markdown, normalizeFileName(doc.fileName), target);
    if (!result) return;
    const newHandle = result.handle && result.handle !== fileHandle ? result.handle : null;
    const handleId = newHandle ? await putHandle(newHandle) : startHandleId;
    markSaved(result.name, result.handle, handleId, written);
    if (newHandle && handleId) settleOtherTabsOf(handleId, written.tabId);
    if (newHandle) void forgetUnusedHandles();
    showToast(
      t(result.kind === 'written' ? 'toast.saved' : 'toast.downloaded', { name: result.name })
    );
  } catch {
    showToast(t('toast.saveFailed'));
  }
}

/**
 * Save As onto a file another tab has open: that tab's text no longer
 * matches the file. Without unsaved changes it is closed (this tab now
 * shows the file); with them it keeps its text as an unlinked copy, so a
 * later Save there can't silently replace what was just written.
 */
function settleOtherTabsOf(handleId: string, keepTabId: string): void {
  const others = syncedTabs(useStore.getState()).filter(
    (tab) => tab.handleId === handleId && tab.id !== keepTabId
  );
  for (const tab of others) {
    if (isDirty(tab.doc)) {
      useStore.getState().unlinkTab(tab.id);
      showToast(t('toast.unlinkedCopy', { name: tab.doc.fileName }));
    } else {
      useStore.getState().closeTab(tab.id);
    }
  }
}

/** Removes a file from the recent list; the file on disk is not touched. */
export function forgetRecent(entry: RecentEntry): void {
  useStore.getState().forgetRecent(entry);
  void forgetUnusedHandles();
}

export async function clearRecents(): Promise<void> {
  const ok = await requestConfirm({
    title: t('confirm.clearRecents.title'),
    body: t('confirm.clearRecents.body'),
    confirmLabel: t('confirm.clearRecents.ok'),
  });
  if (!ok) return;
  useStore.getState().clearRecents();
  void forgetUnusedHandles();
}

/**
 * Shows text not linked to a file (a recent file's snapshot, a document
 * bundled with the app), in its open tab if there is one.
 */
function openSnapshot(markdown: string, fileName: string): void {
  if (showOpenTab({ handleId: null, fileName, markdown })) return;
  useStore.getState().loadDocument(createDocument(markdown, fileName), null);
}

/**
 * Opens the bundled sample document as a new, unsaved tab. Loaded on
 * demand so it never weighs on start-up.
 */
export async function openWelcome(): Promise<void> {
  const { default: markdown } = await import('@/i18n/welcome.en.md?raw');
  openSnapshot(markdown, t('welcome.fileName'));
}

/** Opens the user guide (USER_GUIDE.md, bundled on demand) as a document. */
export async function openUserGuide(): Promise<void> {
  const { default: markdown } = await import('../../USER_GUIDE.md?raw');
  openSnapshot(markdown, t('guide.fileName'));
}

/** The file's current text, or null when it can't be read (moved, deleted, no permission). */
async function diskText(handle: FileSystemFileHandle): Promise<string | null> {
  try {
    return await (await handle.getFile()).text();
  } catch {
    return null;
  }
}

/** The disk text we last warned about, so a change is announced once. */
let warnedAbout: string | null = null;

/**
 * Picks up changes made to the active document's file outside MD Studio.
 * Runs when the window regains focus and after a tab switch. Only reads
 * when permission is already granted, so it never prompts. A tab without
 * unsaved changes reloads quietly; one with unsaved changes gets a warning,
 * and Save asks before overwriting.
 */
export async function checkDiskChanges(): Promise<void> {
  const { fileHandle, doc, activeTabId } = useStore.getState();
  if (!fileHandle) return;
  try {
    if (
      fileHandle.queryPermission &&
      (await fileHandle.queryPermission({ mode: 'read' })) !== 'granted'
    )
      return;
  } catch {
    return;
  }
  const text = await diskText(fileHandle);
  const now = useStore.getState();
  // Ignore results that arrive after a switch, an edit or a save.
  if (
    text === null ||
    now.activeTabId !== activeTabId ||
    now.doc.savedMarkdown !== doc.savedMarkdown
  )
    return;
  if (text === doc.savedMarkdown) return;
  if (!isDirty(now.doc)) {
    now.reloadFromDisk(text);
    showToast(t('toast.reloadedFromDisk', { name: doc.fileName }));
  } else if (warnedAbout !== text) {
    warnedAbout = text;
    showToast(t('toast.changedOnDisk', { name: doc.fileName }));
  }
}
