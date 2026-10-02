/**
 * User-level document commands shared by the toolbar, start screen,
 * keyboard shortcuts, command palette and file-launch handler.
 */
import { createDocument, isDirty, normalizeFileName } from '@/domain/document';
import { t } from '@/i18n';
import { useStore } from '@/store';
import { requestConfirm, showToast } from '@/store/ui';
import { type OpenedFile, openFile, readHandle, saveFile } from './fileSystem';
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

function load(file: OpenedFile) {
  useStore.getState().loadDocument(createDocument(file.markdown, file.name), file.handle);
  showToast(t('toast.opened', { name: file.name }));
}

export async function newDocument(): Promise<void> {
  if (!(await confirmDiscard())) return;
  useStore.getState().loadDocument(createDocument(), null);
}

export async function openDocument(): Promise<void> {
  if (!(await confirmDiscard())) return;
  try {
    const file = await openFile();
    if (file) load(file);
  } catch {
    showToast(t('toast.openFailed'));
  }
}

export async function openHandle(handle: FileSystemFileHandle): Promise<void> {
  if (!(await confirmDiscard())) return;
  try {
    load(await readHandle(handle));
  } catch {
    showToast(t('toast.openFailed'));
  }
}

export async function openDroppedFile(file: File): Promise<void> {
  if (!(await confirmDiscard())) return;
  try {
    load({ name: file.name, markdown: await file.text(), handle: null });
  } catch {
    showToast(t('toast.openFailed'));
  }
}

export async function openRecent(entry: RecentEntry): Promise<void> {
  if (!(await confirmDiscard())) return;
  useStore.getState().loadDocument(createDocument(entry.markdown, entry.fileName), null);
}

export async function saveDocument(saveAs = false): Promise<void> {
  const { doc, fileHandle, markSaved } = useStore.getState();
  try {
    const result = await saveFile(
      doc.markdown,
      normalizeFileName(doc.fileName),
      saveAs ? null : fileHandle
    );
    if (!result) return;
    markSaved(result.name, result.handle);
    showToast(
      t(result.kind === 'written' ? 'toast.saved' : 'toast.downloaded', { name: result.name })
    );
  } catch {
    showToast(t('toast.saveFailed'));
  }
}
