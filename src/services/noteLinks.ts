import { headingSlug } from '@/domain/linkTarget';
import { t } from '@/i18n';
import { showToast } from '@/store/ui';
import { currentDocContext, resolveNoteHandle } from './attachments';
import { openHandle } from './documentActions';

/** Scrolls the visual pane to the heading with this slug (after a note opened, say). */
export function scrollToHeadingSlug(slug: string): boolean {
  const pm = document.querySelector('[data-testid="visual-editor"] .ProseMirror');
  if (!pm) return false;
  const wanted = slug.toLowerCase();
  const heading = Array.from(
    pm.querySelectorAll<HTMLElement>(
      ':scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6'
    )
  ).find((h) => headingSlug(h.textContent ?? '') === wanted);
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
  await openHandle(res.handle);
  const { fragment } = target;
  if (fragment) {
    // The tab switch shows the note a moment later; best effort.
    const slug = headingSlug(fragment);
    setTimeout(() => scrollToHeadingSlug(slug), 300);
  }
}
