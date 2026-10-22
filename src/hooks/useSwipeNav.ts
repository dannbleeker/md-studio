import { useEffect } from 'react';
import { swipeDirection, type TouchPoint } from '@/domain/swipe';
import { goBack, goForward } from '@/services/noteHistory';
import { useStore } from '@/store';

/** Places that scroll sideways or take a drag of their own: a swipe there is not navigation. */
const OWN_GESTURE =
  'pre, table, .katex, math, .read-diagram, input, textarea, select, dialog, .folder-panel, .outline, .cm-editor';

const point = (t: Touch): TouchPoint => ({ x: t.clientX, y: t.clientY, time: performance.now() });

/**
 * Swipe right to go back and left to go forward through opened notes, in
 * Read view on a touch screen. Only a single finger that starts on plain
 * text counts, and never while text is selected.
 */
export function useSwipeNav(): void {
  useEffect(() => {
    let start: TouchPoint | null = null;
    const onStart = (e: TouchEvent) => {
      const { screen, viewMode } = useStore.getState();
      const target = e.target instanceof Element ? e.target : null;
      const touch = e.touches[0];
      start =
        screen === 'editor' &&
        viewMode === 'read' &&
        e.touches.length === 1 &&
        touch &&
        target &&
        !target.closest(OWN_GESTURE)
          ? point(touch)
          : null;
    };
    const onEnd = (e: TouchEvent) => {
      const from = start;
      start = null;
      const touch = e.changedTouches[0];
      if (!from || !touch || window.getSelection()?.toString()) return;
      const direction = swipeDirection(from, point(touch));
      if (direction === 'back') void goBack();
      else if (direction === 'forward') void goForward();
    };
    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchend', onEnd, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchend', onEnd);
    };
  }, []);
}
