import { headingPlainText } from '@/components/editor/editorRegistry';
import { fileOpenMode, headingSlug } from '@/domain/linkTarget';
import { withoutNoteExtension } from '@/domain/noteFiles';
import { type NotePreview, notePreview } from '@/domain/notePreview';
import { t } from '@/i18n';
import { useStore } from '@/store';
import { showToast } from '@/store/ui';
import {
  type AttachmentUnavailable,
  chooseAttachmentFolder,
  currentDocContext,
  type DocContext,
  grantAttachmentAccess,
  readNoteText,
  resolveAttachment,
  resolveNoteHandle,
} from './attachments';
import { navigateToNote } from './noteHistory';

const SCAN_RETRIES = 12;
const SCAN_RETRY_MS = 250;

/**
 * A click on a link is a user gesture, so a missing folder or permission is
 * asked for right here (the picker, or the permission prompt) instead of
 * sending the user to the banner. True when the lookup is worth repeating.
 */
function recoverAccess(reason: AttachmentUnavailable, ctx: DocContext): Promise<boolean> {
  if (reason === 'needs-permission') return grantAttachmentAccess(ctx);
  if (reason === 'no-folder') return chooseAttachmentFolder(ctx);
  return Promise.resolve(false);
}

/**
 * Runs a lookup for the document on screen; on "unavailable" asks for access
 * once, and waits out a first scan. All of it is for the document the link
 * was clicked in: null when another one is showing by the end, as the link
 * no longer means anything there.
 */
async function resolveWithAccess<T extends { state: string }>(
  lookup: (ctx: DocContext) => Promise<T>
): Promise<T | null> {
  const ctx = currentDocContext();
  const { loadId } = useStore.getState();
  let res = await lookup(ctx);
  const first = res as { state: string; reason?: AttachmentUnavailable };
  if (first.state === 'unavailable' && first.reason && (await recoverAccess(first.reason, ctx))) {
    res = await lookup(ctx);
  }
  for (let i = 0; res.state === 'scanning' && i < SCAN_RETRIES; i++) {
    await new Promise((r) => setTimeout(r, SCAN_RETRY_MS));
    if (useStore.getState().loadId !== loadId) return null;
    res = await lookup(ctx);
  }
  return useStore.getState().loadId === loadId ? res : null;
}

/** Scrolls the visual pane to the heading with this slug (after a note opened, say). */
export function scrollToHeadingSlug(slug: string): boolean {
  const pm = document.querySelector('[data-testid="visual-editor"] .ProseMirror');
  if (!pm) return false;
  const wanted = slug.toLowerCase();
  const heading = Array.from(
    pm.querySelectorAll<HTMLElement>(
      ':scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6'
    )
  ).find((h) => headingSlug(headingPlainText(h)) === wanted);
  heading?.scrollIntoView({ block: 'start' });
  return heading !== undefined;
}

/**
 * Opens the note a link names in a tab (the one already holding it, if any).
 * Links resolve like attachments: against the vault folder, so the folder
 * must have been chosen; a failure says why instead of doing nothing.
 */
export async function followNoteLink(target: {
  path: string;
  fragment: string | null;
  markdown: boolean;
}): Promise<void> {
  const name = target.path;
  const res = await resolveWithAccess((ctx) =>
    resolveNoteHandle(ctx, target.path, { markdown: target.markdown })
  );
  if (!res) return;
  if (res.state === 'scanning') return void showToast(t('link.scanning'));
  if (res.state === 'missing') return void showToast(t('link.noteMissing', { name }));
  if (res.state === 'unavailable') return void showToast(t('link.noteUnavailable'));
  await navigateToNote(res.handle);
  const { fragment } = target;
  if (fragment) {
    // The tab switch shows the note a moment later; best effort.
    const slug = headingSlug(fragment);
    setTimeout(() => scrollToHeadingSlug(slug), 300);
  }
}

/**
 * Opens a linked file that is not a note: a PDF, picture, recording or video
 * in a new tab, anything else as a download. Resolved like attachments, so
 * the vault folder must have been chosen; a failure says why.
 */
export async function followFileLink(target: { path: string; markdown: boolean }): Promise<void> {
  const name = target.path.replace(/^.*\//, '');
  const res = await resolveWithAccess((ctx) =>
    resolveAttachment(ctx, target.path, { markdown: target.markdown })
  );
  if (!res) return;
  if (res.state === 'scanning') return void showToast(t('link.scanning'));
  if (res.state === 'missing') return void showToast(t('link.fileMissing', { name }));
  if (res.state === 'unavailable') return void showToast(t('link.fileUnavailable'));
  if (fileOpenMode(res.path) === 'view') {
    window.open(res.url, '_blank', 'noopener');
    return;
  }
  const a = document.createElement('a');
  a.href = res.url;
  a.download = res.name;
  a.click();
}

const previews = new Map<
  string,
  { at: number; preview: (NotePreview & { name: string }) | null }
>();
const PREVIEW_TTL_MS = 30_000;
const PREVIEW_ENTRIES = 40;

/**
 * The start of the note a link names, for a hover card; null when it cannot
 * be read. Kept for a short while, so moving over the same link again is free.
 */
export async function previewNote(target: {
  path: string;
  markdown: boolean;
}): Promise<(NotePreview & { name: string }) | null> {
  const ctx = currentDocContext();
  const key = `${ctx.handleId ?? ''}\0${target.markdown ? 'm' : 'w'}\0${target.path}`;
  const known = previews.get(key);
  if (known && Date.now() - known.at < PREVIEW_TTL_MS) return known.preview;
  const read = await readNoteText(ctx, target.path, { markdown: target.markdown });
  const preview =
    read.state === 'ok'
      ? { ...notePreview(read.text), name: withoutNoteExtension(read.path.replace(/^.*\//, '')) }
      : null;
  // Only a settled answer is kept: a vault still scanning, or not yet
  // allowed, may find the note a moment later.
  if (read.state === 'ok' || read.state === 'missing') {
    if (previews.size >= PREVIEW_ENTRIES) previews.delete(previews.keys().next().value as string);
    previews.set(key, { at: Date.now(), preview });
  }
  return preview;
}
