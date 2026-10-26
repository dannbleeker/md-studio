import { useEffect } from 'react';
import { scrollReader } from '@/components/editor/readNavigation';
import { modalOpen } from '@/components/ui/modal';
import { readKeyAction } from '@/domain/readKeys';
import { useStore } from '@/store';
import { useUiStore } from '@/store/ui';

/** Where a typed letter belongs to the page, not to Read view. */
const typesText = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  (target.closest('input, textarea, select, [contenteditable="true"], .cm-editor') !== null ||
    target.isContentEditable);

/** Space presses a focused control (a fold or copy button); it scrolls only from the text. */
const pressesControl = (target: EventTarget | null): boolean =>
  target instanceof Element &&
  target.closest('button, summary, [role="button"], [role="checkbox"], [role="switch"]') !== null;

/**
 * Plain-key shortcuts for reading: j/k and Space scroll, g/G jump to the
 * ends, [ and ] step between headings, / opens Find and f toggles focus
 * mode. Only in Read view, and never while a dialog is open or text is being typed somewhere.
 * ? lists every shortcut, from any view.
 */
export function useReadKeys(): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing || typesText(e.target) || modalOpen()) return;
      const { screen, viewMode } = useStore.getState();
      const action = readKeyAction(e);
      // ? lists the shortcuts from anywhere nothing is being typed, not only in Read view.
      if (action === 'help') {
        useUiStore.getState().setShortcutsOpen(true);
        e.preventDefault();
        return;
      }
      if (screen !== 'editor' || viewMode !== 'read') return;
      if (!action || (e.key === ' ' && pressesControl(e.target))) return;
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
