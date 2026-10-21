import { useEffect } from 'react';
import { scrollReader } from '@/components/editor/readNavigation';
import { readKeyAction } from '@/domain/readKeys';
import { useStore } from '@/store';
import { useUiStore } from '@/store/ui';

/** Where a typed letter belongs to the page, not to Read view. */
const typesText = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  (target.closest('input, textarea, select, [contenteditable="true"], .cm-editor') !== null ||
    target.isContentEditable);

/**
 * Plain-key shortcuts for reading: j/k and Space scroll, g/G jump to the
 * ends, [ and ] step between headings, / opens Find and f toggles focus
 * mode. Only in Read view, and never while a dialog is open or text is being
 * typed somewhere.
 */
export function useReadKeys(): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const { screen, viewMode } = useStore.getState();
      if (screen !== 'editor' || viewMode !== 'read' || e.defaultPrevented || e.isComposing) return;
      if (typesText(e.target) || document.querySelector('dialog[open]')) return;
      const action = readKeyAction(e);
      if (!action) return;
      if (action === 'find') useUiStore.getState().setFind(true, false);
      else if (action === 'focus')
        useUiStore.getState().setFocusMode(!useUiStore.getState().focusMode);
      else if (!scrollReader(action)) return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
