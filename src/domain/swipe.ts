/** A horizontal swipe on a touch screen, read as "go back" or "go forward" through opened notes. */

export type TouchPoint = { x: number; y: number; time: number };

const MIN_DISTANCE = 80;
const MAX_DURATION_MS = 700;
/** How far off horizontal a swipe may drift, as a share of its length. */
const MAX_SLOPE = 0.4;

/**
 * A swipe right goes back and a swipe left goes forward, as in a browser. It
 * must be long, quick and flat: a slow drag is a text selection, a diagonal
 * one is a scroll that wandered.
 */
export function swipeDirection(start: TouchPoint, end: TouchPoint): 'back' | 'forward' | null {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (Math.abs(dx) < MIN_DISTANCE) return null;
  if (end.time - start.time > MAX_DURATION_MS || end.time < start.time) return null;
  if (Math.abs(dy) > Math.abs(dx) * MAX_SLOPE) return null;
  return dx > 0 ? 'back' : 'forward';
}
