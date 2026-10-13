import { Plugin } from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';

type WithObserver = { domObserver?: { onSelectionChange?: () => void } };

/**
 * A click into the visual pane moves the browser's selection at once, but
 * ProseMirror only adopts it on the next `selectionchange` event, which
 * Chromium queues behind input events. A key pressed before it arrives (on
 * a busy main thread, say while a large document syncs) acted on the old
 * selection: Enter split the paragraph the cursor had been in, far from
 * where the user clicked. Reading the selection first, as that event would,
 * makes keys act where the user clicked; when nothing is pending it does
 * nothing. `domObserver` is ProseMirror's own (not public API) handler.
 *
 * The same delay hits ProseMirror's focus handler: 20 ms after the pane is
 * focused it compares the DOM selection with the one it last saw and, if
 * they differ, writes its own back over the click (to the end of the
 * document, after a text-side update replaced the blocks). Adopting the
 * click's selection just after focus, before that check, stops it.
 */
export const clickSelection = new Plugin({
  props: {
    handleDOMEvents: {
      focus: (view: EditorView) => {
        // The browser places the caret right after focusing, in the same task,
        // so a zero delay sees it, and this timer is set (and so runs) before
        // ProseMirror's own 20 ms one.
        setTimeout(() => {
          if (!view.isDestroyed && view.hasFocus())
            (view as unknown as WithObserver).domObserver?.onSelectionChange?.();
        }, 0);
        return false;
      },
      keydown: (view: EditorView, event: KeyboardEvent) => {
        // 229 is an IME's first key in Chromium, before isComposing is set;
        // ProseMirror leaves the selection alone for it too.
        if (!event.isComposing && event.keyCode !== 229)
          (view as unknown as WithObserver).domObserver?.onSelectionChange?.();
        return false;
      },
    },
  },
});
