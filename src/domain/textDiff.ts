/**
 * Smallest single-range edit that turns `before` into `after`.
 *
 * When the visual pane changes the document, the text pane applies only the
 * changed span rather than replacing everything, so its cursor, selection,
 * undo history and scroll position survive edits made on the other side.
 */
export type TextChange = { from: number; to: number; insert: string };

export function minimalChange(before: string, after: string): TextChange | null {
  if (before === after) return null;
  let start = 0;
  const maxStart = Math.min(before.length, after.length);
  while (start < maxStart && before.charCodeAt(start) === after.charCodeAt(start)) start++;

  let endBefore = before.length;
  let endAfter = after.length;
  while (
    endBefore > start &&
    endAfter > start &&
    before.charCodeAt(endBefore - 1) === after.charCodeAt(endAfter - 1)
  ) {
    endBefore--;
    endAfter--;
  }
  return { from: start, to: endBefore, insert: after.slice(start, endAfter) };
}
