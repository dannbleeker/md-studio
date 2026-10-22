import type { ReadAction } from '@/domain/readKeys';
import { editors, visualHeadings } from './editorRegistry';

/** The visual pane's scrolling element, or null before it exists. */
export const readerScroller = (): HTMLElement | null =>
  editors.visual?.dom.closest<HTMLElement>('.pane-scroll') ?? null;

const LINE = 80;
/** A heading this close to the top counts as the one being read, so `]` goes past it. */
const CURRENT = 80;

/** Scrolls the reader for a scroll or heading key; false for actions that are not scrolling. */
export function scrollReader(action: ReadAction): boolean {
  const scroller = readerScroller();
  if (!scroller) return false;
  const page = Math.max(120, scroller.clientHeight * 0.9);
  switch (action) {
    case 'down':
      scroller.scrollBy({ top: LINE });
      return true;
    case 'up':
      scroller.scrollBy({ top: -LINE });
      return true;
    case 'pageDown':
      scroller.scrollBy({ top: page });
      return true;
    case 'pageUp':
      scroller.scrollBy({ top: -page });
      return true;
    case 'top':
      scroller.scrollTo({ top: 0 });
      return true;
    case 'bottom':
      scroller.scrollTo({ top: scroller.scrollHeight });
      return true;
    case 'prevHeading':
    case 'nextHeading': {
      const pm = editors.visual?.dom;
      if (!pm) return true;
      const top = scroller.getBoundingClientRect().top;
      // Offsets of the headings from the top of the visible page.
      const offsets = visualHeadings(pm).map((h) => h.getBoundingClientRect().top - top);
      const target =
        action === 'nextHeading'
          ? offsets.find((o) => o > CURRENT)
          : [...offsets].reverse().find((o) => o < -12);
      if (target !== undefined) scroller.scrollBy({ top: target - 8 });
      else if (action === 'prevHeading') scroller.scrollTo({ top: 0 });
      return true;
    }
    default:
      return false;
  }
}
