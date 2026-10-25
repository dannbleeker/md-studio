import { useEffect } from 'react';
import { useUiStore } from '@/store/ui';

/**
 * Escape leaves focus mode, unless something else takes it first: an open
 * dialog, or a find bar or link preview that closes on that Escape.
 */
export function useFocusModeEscape(): void {
  const focusMode = useUiStore((s) => s.focusMode);
  useEffect(() => {
    if (!focusMode) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || document.querySelector('dialog[open]'))
        return;
      useUiStore.getState().setFocusMode(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [focusMode]);
}
