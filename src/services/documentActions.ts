/**
 * User-level document commands shared by the toolbar, start screen,
 * keyboard shortcuts, command palette and file-launch handler.
 */
import { createDocument, isDirty, normalizeFileName } from '@/domain/document';
import { t } from '@/i18n';
import { useStore } from '@/store';
import { requestConfirm, showToast } from '@/store/ui';
import { downloadText, type OpenedFile, openFile, readHandle, saveFile } from './fileSystem';
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

const escapeHtml = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);

/** Exports the visual pane's rendered HTML as a standalone page. */
export function exportHtml(): void {
  const { doc } = useStore.getState();
  const body = document.querySelector('[data-pane="visual"] .ProseMirror')?.innerHTML ?? '';
  const title = escapeHtml(doc.fileName.replace(/\.[^.]+$/, ''));
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
body { font: 16px/1.6 system-ui, sans-serif; max-width: 46rem; margin: 2rem auto; padding: 0 1rem; color: #1e293b; }
pre { background: #f1f4f8; padding: 0.75rem 1rem; overflow-x: auto; border-radius: 6px; }
code { font-family: ui-monospace, Consolas, monospace; }
table { border-collapse: collapse; } th, td { border: 1px solid #cbd5e1; padding: 0.3rem 0.6rem; }
blockquote { border-left: 3px solid #94a3b8; margin-left: 0; padding-left: 1rem; color: #475569; }
</style>
</head>
<body>
${body}
</body>
</html>
`;
  downloadText(html, `${doc.fileName.replace(/\.[^.]+$/, '')}.html`, 'text/html');
}
