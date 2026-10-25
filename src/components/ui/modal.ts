/**
 * Whether a modal is showing: an open <dialog>, or the image lightbox (a
 * role="dialog" overlay). It owns the keyboard and touch: the app's own keys
 * and swipes must not act on the page behind it.
 */
export const modalOpen = (): boolean =>
  // A closed <dialog> may carry aria-modal too: only `open` counts for those.
  document.querySelector('dialog[open], [aria-modal="true"]:not(dialog)') !== null;
