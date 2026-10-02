/**
 * User-level document commands shared by the toolbar, start screen,
 * keyboard shortcuts, command palette and file-launch handler.
 */
import { createDocument, isDirty, normalizeFileName } from '@/domain/document';
import { t } from '@/i18n';
import { useStore } from '@/store';
import { requestConfirm, showToast } from '@/store/ui';
import { type OpenedFile, openFile, readHandle, saveFile } from './fileSystem';
import { ensurePermission, getHandle, pruneHandles, putHandle } from './handleStore';
import type { RecentEntry } from './storage';

async function confirmDiscard(): Promise<boolean> {
  const { doc } = useStore.getState();
  if (!isDirty(doc)) return true;
  return requestConfirm({
    title: t('confirm.discard.title'),
    body: t('confirm.discard.body', { name: doc.fileName }),
    confirmLabel: t('confirm.discard.ok'),
  });
}

async function load(file: OpenedFile) {
  const handleId = file.handle ? await putHandle(file.handle) : null;
  useStore.getState().loadDocument(createDocument(file.markdown, file.name), file.handle, handleId);
  showToast(t('toast.opened', { name: file.name }));
  void forgetUnusedHandles();
}

/** Drops stored handles no recent entry or open document points at any more. */
async function forgetUnusedHandles() {
  const { recents, handleId } = useStore.getState();
  const keep = new Set(recents.flatMap((r) => (r.handleId ? [r.handleId] : [])));
  if (handleId) keep.add(handleId);
  await pruneHandles(keep);
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
  if (!(await confirmDiscard())) return;
  useStore.getState().loadDocument(createDocument(), null);
}

export async function openDocument(): Promise<void> {
  if (!(await confirmDiscard())) return;
  try {
    const file = await openFile();
    if (file) await load(file);
  } catch {
    showToast(t('toast.openFailed'));
  }
}

export async function openHandle(handle: FileSystemFileHandle): Promise<void> {
  if (!(await confirmDiscard())) return;
  try {
    await load(await readHandle(handle));
  } catch {
    showToast(t('toast.openFailed'));
  }
}

export async function openDroppedFile(file: File): Promise<void> {
  if (!(await confirmDiscard())) return;
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
  if (!(await confirmDiscard())) return;
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
