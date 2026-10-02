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
