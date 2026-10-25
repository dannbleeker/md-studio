/**
 * The one small card Read view shows over a link or a footnote reference. It
 * holds plain text only (built with textContent), follows its anchor, and
 * goes away on Escape, on scrolling and when the pointer or focus leaves both
 * the anchor and the card.
 */

let card: HTMLElement | null = null;
let anchor: Element | null = null;
let hideTimer: ReturnType<typeof setTimeout> | null = null;

const GAP = 6;
const EDGE = 8;

function place(box: HTMLElement, near: Element): void {
  const a = near.getBoundingClientRect();
  const width = box.offsetWidth;
  const height = box.offsetHeight;
  const left = Math.max(EDGE, Math.min(a.left, window.innerWidth - width - EDGE));
  const below = a.bottom + GAP;
  const top =
    below + height > window.innerHeight - EDGE ? Math.max(EDGE, a.top - height - GAP) : below;
  box.style.left = `${left}px`;
  box.style.top = `${top}px`;
}

export function hidePopover(): void {
  if (hideTimer !== null) clearTimeout(hideTimer);
  hideTimer = null;
  anchor?.removeAttribute('aria-describedby');
  card?.remove();
  card = null;
  anchor = null;
}

/** Hides after a moment, so moving from the anchor onto the card does not close it. */
export function hidePopoverSoon(): void {
  if (hideTimer !== null) clearTimeout(hideTimer);
  hideTimer = setTimeout(hidePopover, 180);
}

/** The element the card is showing for, to tell a move between its anchor and it from a real exit. */
export const popoverAnchor = (): Element | null => anchor;

export function showPopover(near: Element, title: string | null, text: string): void {
  hidePopover();
  const box = document.createElement('div');
  box.className = 'read-popover';
  box.id = 'read-popover';
  box.setAttribute('role', 'tooltip');
  if (title) {
    const heading = document.createElement('div');
    heading.className = 'read-popover-title';
    heading.textContent = title;
    box.append(heading);
  }
  const body = document.createElement('div');
  body.className = 'read-popover-text';
  body.textContent = text;
  box.append(body);
  box.addEventListener('pointerenter', () => {
    if (hideTimer !== null) clearTimeout(hideTimer);
    hideTimer = null;
  });
  box.addEventListener('pointerleave', hidePopoverSoon);
  document.body.append(box);
  card = box;
  anchor = near;
  near.setAttribute('aria-describedby', box.id);
  place(box, near);
}

if (typeof window !== 'undefined') {
  // Capture, and claimed: this chunk loads late, so a bubbling listener could
  // run after focus mode's, and the same Escape would leave focus mode too.
  window.addEventListener(
    'keydown',
    (e) => {
      if (e.key !== 'Escape' || !card) return;
      e.preventDefault();
      hidePopover();
    },
    { capture: true }
  );
  // A scroll moves the anchor away from the card: capture, as panes scroll on their own elements.
  window.addEventListener('scroll', hidePopover, { capture: true, passive: true });
}
