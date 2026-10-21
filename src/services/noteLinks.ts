import { headingPlainText } from '@/components/editor/editorRegistry';
import { headingSlug } from '@/domain/linkTarget';
import { type NotePreview, notePreview } from '@/domain/notePreview';
import { t } from '@/i18n';
import { showToast } from '@/store/ui';
import { currentDocContext, readNoteText, resolveNoteHandle } from './attachments';
import { navigateToNote } from './noteHistory';

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
  const res = await resolveNoteHandle(currentDocContext(), target.path, {
    markdown: target.markdown,
  });
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
      ? { ...notePreview(read.text), name: read.path.replace(/^.*\//, '').replace(/\.md$/i, '') }
      : null;
  if (previews.size >= PREVIEW_ENTRIES) previews.delete(previews.keys().next().value as string);
  previews.set(key, { at: Date.now(), preview });
  return preview;
}
