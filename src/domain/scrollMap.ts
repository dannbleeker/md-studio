/**
 * Linked scroll by anchor, not by pixel ratio.
 *
 * The text and visual panes render the same document at very different
 * heights (a table is one line per row in text, a tall grid in visual; an
 * image is one line in text, hundreds of pixels in visual). Matching raw
 * scroll offsets or percentages drifts badly. Instead each pane reports the
 * pixel offsets of its headings; a scroll position becomes "section i,
 * fraction f of the way through it", which is then mapped back to pixels in
 * the other pane.
 *
 * `anchors` must be ascending and include the start of the content (0) and
 * its end (total height) as the outermost entries.
 */

export type AnchorPosition = { section: number; fraction: number };

export function toAnchorPosition(anchors: readonly number[], offset: number): AnchorPosition {
  if (anchors.length < 2) return { section: 0, fraction: 0 };
  const last = anchors.length - 2;
  let section = 0;
  for (let i = 0; i <= last; i++) {
    if ((anchors[i] ?? 0) <= offset) section = i;
    else break;
  }
  const start = anchors[section] ?? 0;
  const end = anchors[section + 1] ?? start;
  const span = end - start;
  const fraction = span > 0 ? Math.min(1, Math.max(0, (offset - start) / span)) : 0;
  return { section, fraction };
}

export function fromAnchorPosition(anchors: readonly number[], pos: AnchorPosition): number {
  if (anchors.length < 2) return 0;
  // A section this pane doesn't have (the panes briefly disagree on heading
  // count mid-edit) maps to the end rather than to a wrong heading.
  if (pos.section > anchors.length - 2) return anchors[anchors.length - 1] ?? 0;
  const section = Math.max(0, pos.section);
  const start = anchors[section] ?? 0;
  const end = anchors[section + 1] ?? start;
  return start + (end - start) * pos.fraction;
}

/** Wraps heading offsets with the content start and end, clamped ascending. */
export function buildAnchors(headingOffsets: readonly number[], total: number): number[] {
  const anchors = [0];
  for (const offset of headingOffsets) {
    anchors.push(Math.max(anchors[anchors.length - 1] ?? 0, Math.min(offset, total)));
  }
  anchors.push(Math.max(anchors[anchors.length - 1] ?? 0, total));
  return anchors;
}
