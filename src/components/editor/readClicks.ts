import { Plugin } from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';
import { headingSlug, type LinkTarget, linkTarget, wikilinkTarget } from '@/domain/linkTarget';
import { useStore } from '@/store';
import { headingPlainText, visualHeadings } from './editorRegistry';
import { openLightbox } from './lightbox';
import { expandAllFolds } from './readFolds';
import { showFor } from './readHover';

/** The note-link service loads on first use: most sessions never follow one. */
const noteLinks = () => import('@/services/noteLinks');

const headingFor = (pm: Element, slug: string) =>
  visualHeadings(pm).find((h) => headingSlug(headingPlainText(h)) === slug);

function follow(target: LinkTarget, view: EditorView): void {
  if (target.kind === 'external') {
    window.open(target.url, '_blank', 'noopener,noreferrer');
  } else if (target.kind === 'anchor') {
    const slug = target.slug.toLowerCase();
    let heading = headingFor(view.dom, slug);
    // A folded section's heading is not drawn: there is nowhere to scroll to.
    if (heading?.classList.contains('read-folded')) {
      expandAllFolds(view);
      heading = headingFor(view.dom, slug);
    }
    heading?.scrollIntoView({ block: 'start' });
  } else if (target.kind === 'note') {
    void noteLinks().then((m) => m.followNoteLink(target));
  } else if (target.kind === 'file') {
    void noteLinks().then((m) => m.followFileLink(target));
  }
}

/**
 * Clicks in the visual pane that go somewhere: links, wikilinks and, in Read
 * view, images. A plain click follows in Read view; while editing a plain
 * click places the caret, so only Ctrl/Cmd+click follows. Without this the
 * browser would navigate the app itself away from a non-editable page.
 */
export const readClicks = new Plugin({
  props: {
    handleDOMEvents: {
      click: (view, event) => {
        const el = event.target instanceof Element ? event.target : null;
        if (!el || !view.dom.contains(el)) return false;
        const reading = useStore.getState().viewMode === 'read';
        const wants = reading || event.ctrlKey || event.metaKey;
        const anchor = el.closest<HTMLAnchorElement>('a[href]');
        if (anchor && view.dom.contains(anchor)) {
          if (!wants) return false;
          event.preventDefault();
          // A transcluded note's links are relative to that note, not this one.
          if (!anchor.closest('.md-transclusion'))
            follow(linkTarget(anchor.getAttribute('href') ?? ''), view);
          return true;
        }
        const chip = el.closest<HTMLElement>('.md-wikilink');
        if (chip && wants && !chip.closest('.md-transclusion')) {
          event.preventDefault();
          follow(wikilinkTarget(chip.title), view);
          return true;
        }
        // A tap on a footnote reference shows its text at once (touch has no hover).
        const ref = el.closest('sup[data-type="footnote_reference"]');
        if (reading && ref && view.dom.contains(ref)) {
          event.preventDefault();
          showFor(view, ref, 0);
          return true;
        }
        const img = el.closest('img');
        if (reading && img && !img.classList.contains('image-blocked') && img.src) {
          event.preventDefault();
          openLightbox(img.currentSrc || img.src, img.alt);
          return true;
        }
        return false;
      },
    },
  },
});
