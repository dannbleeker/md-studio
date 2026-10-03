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
 */
export const clickSelection = new Plugin({
  props: {
    handleDOMEvents: {
      keydown: (view: EditorView, event: KeyboardEvent) => {
        if (!event.isComposing)
          (view as unknown as WithObserver).domObserver?.onSelectionChange?.();
        return false;
      },
    },
  },
});
