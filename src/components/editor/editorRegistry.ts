import type { EditorView as TextView } from '@codemirror/view';
import type { Editor } from '@milkdown/kit/core';
import type { EditorView as VisualView } from '@milkdown/kit/prose/view';

/**
 * The live editor views, for features that act on a pane from outside it
 * (find & replace, outline navigation). Each pane registers itself on
 * mount and clears itself on unmount; `lastFocused` says which pane the
 * user was working in.
 */
export const editors: {
  text: TextView | null;
  visual: VisualView | null;
  /** The Milkdown editor behind `visual`, for running its commands. */
  milkdown: Editor | null;
  lastFocused: 'text' | 'visual';
  /**
   * Linked scroll ignores scroll events until this time (performance.now()).
   * Set while a feature positions both panes itself (outline jumps):
   * CodeMirror keeps firing scroll events while it measures line heights,
   * and syncing on those estimates would drag the other pane off target.
   */
  linkedScrollPausedUntil: number;
} = { text: null, visual: null, milkdown: null, lastFocused: 'text', linkedScrollPausedUntil: 0 };

/** A pane hidden by the current view mode (its scroll offset reads as 0). */
export const isHidden = (el: Element): boolean => el.closest('[hidden]') !== null;

/**
 * Puts a pane back at a saved offset after a tab switch. Repeated on the
 * next frame because the new document's layout (CodeMirror's height
 * estimates, images) settles after the first paint; linked scroll is held
 * off meanwhile so the two restored offsets don't fight.
 */
export function restoreScroll(el: HTMLElement, top: number): void {
  editors.linkedScrollPausedUntil = performance.now() + 400;
  el.scrollTop = top;
  requestAnimationFrame(() => {
    el.scrollTop = top;
  });
}

/**
 * The visual pane's top-level headings, in document order. Linked scroll
 * and heading jumps (outline, palette) must count headings the same way,
 * or a jump lands on the wrong one.
 */
export const visualHeadings = (pm: Element): HTMLElement[] =>
  Array.from(
    pm.querySelectorAll<HTMLElement>(
      ':scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6'
    )
  );
