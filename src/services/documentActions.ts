/**
 * User-level document commands shared by the toolbar, start screen,
 * keyboard shortcuts, command palette and file-launch handler.
 */
import { createDocument, isDirty, normalizeFileName } from '@/domain/document';
import { neighbourTab, tabForFile } from '@/domain/tabs';
import { t } from '@/i18n';
import { syncedTabs, useStore } from '@/store';
import { requestConfirm, showToast } from '@/store/ui';
import { type OpenedFile, openFile, readHandle, saveFile } from './fileSystem';
import { ensurePermission, getHandle, pruneHandles, putHandle } from './handleStore';
import type { RecentEntry } from './storage';

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
  const keep = new Set(
    [...state.recents, ...syncedTabs(state)].flatMap((r) => (r.handleId ? [r.handleId] : []))
  );
  await pruneHandles(keep);
}

export async function switchTab(id: string): Promise<void> {
  useStore.getState().activateTab(id);
  await restoreDocumentHandle();
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

export async function openDocument(): Promise<void> {
  try {
    const file = await openFile();
    if (file) await load(file);
  } catch {
    showToast(t('toast.openFailed'));
  }
}

export async function openHandle(handle: FileSystemFileHandle): Promise<void> {
  try {
    await load(await readHandle(handle));
  } catch {
    showToast(t('toast.openFailed'));
  }
}

export async function openDroppedFile(file: File): Promise<void> {
  try {
    await load({ name: file.name, markdown: await file.text(), handle: null });
  } catch {
    showToast(t('toast.openFailed'));
  }
}

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
  const snapshot = { handleId: null, fileName: entry.fileName, markdown: entry.markdown };
  if (showOpenTab(snapshot)) return;
  useStore.getState().loadDocument(createDocument(entry.markdown, entry.fileName), null);
}

export async function saveDocument(saveAs = false): Promise<void> {
  const { doc, fileHandle, markSaved } = useStore.getState();
  try {
    // A handle restored after a reload or from Recent needs write
    // permission again; if refused, fall back to choosing a location.
    const target =
      !saveAs && fileHandle && (await ensurePermission(fileHandle, 'readwrite'))
        ? fileHandle
        : null;
    const result = await saveFile(doc.markdown, normalizeFileName(doc.fileName), target);
    if (!result) return;
    const newHandle = result.handle && result.handle !== fileHandle ? result.handle : null;
    const handleId = newHandle ? await putHandle(newHandle) : useStore.getState().handleId;
    markSaved(result.name, result.handle, handleId);
    if (newHandle) void forgetUnusedHandles();
    showToast(
      t(result.kind === 'written' ? 'toast.saved' : 'toast.downloaded', { name: result.name })
    );
  } catch {
    showToast(t('toast.saveFailed'));
  }
}
