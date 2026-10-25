import { Plugin } from '@milkdown/kit/prose/state';
import { linkTarget, wikilinkTarget } from '@/domain/linkTarget';
import { t } from '@/i18n';
import { useStore } from '@/store';
import {
  hidePopover,
  hidePopoverSoon,
  keepPopover,
  popoverAnchor,
  showPopover,
} from './readPopover';

const SHOW_LINK_MS = 400;
const SHOW_NOTE_MS = 120;
const MAX_NOTE_TEXT = 600;

/** The note service loads on first use, like the click handler's. */
const noteLinks = () => import('@/services/noteLinks');

const SELECTOR = 'a[href], .md-wikilink, sup[data-type="footnote_reference"]';

/** The text of the footnote a reference points to, or null. */
export function footnoteText(view: { dom: Element }, label: string): string | null {
  const defs = view.dom.querySelectorAll('dl[data-type="footnote_definition"]');
  for (const def of defs) {
    if (def.getAttribute('data-label') !== label) continue;
    const text = def.querySelector('dd')?.textContent?.trim() ?? '';
    return text === '' ? null : text.slice(0, MAX_NOTE_TEXT);
  }
  return null;
}

let timer: ReturnType<typeof setTimeout> | null = null;
/** Bumped by every new request, so a slow note read cannot show over a newer one. */
let request = 0;

const cancel = () => {
  if (timer !== null) clearTimeout(timer);
  timer = null;
  request++;
};

/** Shows the card for `el` now (a footnote) or after a delay (a note link). */
export function showFor(view: { dom: Element }, el: Element, delay: number): void {
  // One card at a time: a click during a hover's delay must not leave the
  // hover's timer to show the card again after the pointer has left.
  if (timer !== null) clearTimeout(timer);
  const mine = ++request;
  const label = el.getAttribute('data-label');
  if (el.matches('sup[data-type="footnote_reference"]') && label !== null) {
    const text = footnoteText(view, label);
    if (text !== null) {
      timer = setTimeout(
        () => {
          if (mine === request) showPopover(el, null, text);
        },
        Math.min(delay, SHOW_NOTE_MS)
      );
    }
    return;
  }
  const target = el.matches('.md-wikilink')
    ? wikilinkTarget((el as HTMLElement).title)
    : linkTarget(el.getAttribute('href') ?? '');
  if (target.kind !== 'note') return;
  timer = setTimeout(() => {
    void noteLinks()
      .then((m) => m.previewNote(target))
      .then((preview) => {
        if (mine !== request || !el.isConnected) return;
        if (preview) showPopover(el, preview.title ?? preview.name, preview.text);
        else showPopover(el, null, t('read.preview.missing'));
      })
      .catch(() => {});
  }, delay);
}

/**
 * Hover and keyboard-focus cards in Read view: the start of the note a link
 * points to, and the text of a footnote. Hover cards only: a click or tap
 * on a footnote reference shows the same card at once (see readClicks).
 */
export const readHover = new Plugin({
  props: {
    handleDOMEvents: {
      mouseover: (view, event) => {
        if (useStore.getState().viewMode !== 'read') return false;
        const el = event.target instanceof Element ? event.target.closest(SELECTOR) : null;
        if (!el || !view.dom.contains(el)) return false;
        // Back from the card to its own anchor: the card stays.
        if (el === popoverAnchor()) {
          keepPopover();
          return false;
        }
        if (el.closest('.md-transclusion')) return false;
        cancel();
        showFor(view, el, SHOW_LINK_MS);
        return false;
      },
      mouseout: (_view, event) => {
        const el = event.target instanceof Element ? event.target.closest(SELECTOR) : null;
        if (!el) return false;
        cancel();
        hidePopoverSoon();
        return false;
      },
      focusin: (view, event) => {
        if (useStore.getState().viewMode !== 'read') return false;
        const el = event.target instanceof Element ? event.target.closest(SELECTOR) : null;
        if (!el || !view.dom.contains(el) || el.closest('.md-transclusion')) return false;
        cancel();
        showFor(view, el, SHOW_NOTE_MS);
        return false;
      },
      focusout: () => {
        cancel();
        hidePopover();
        return false;
      },
    },
  },
});
