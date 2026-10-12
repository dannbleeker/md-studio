/**
 * Markdown that is small enough to render but slow to parse. The visual pane's parser
 * (micromark) is quadratic on a paragraph full of unmatched emphasis delimiters and
 * slow on lists nested hundreds deep and on tables hundreds of columns wide: 10,000
 * characters of `*a` take over a second, 20,000 over three. nesting.ts catches runs of
 * brackets and quotes; this catches the rest. A transcluded note may come from anywhere
 * and is parsed on its own as soon as it is shown, so it is kept to a plain-text
 * placeholder instead. No real note comes near these limits.
 */

/** `*`, `_` and `~` in one paragraph. */
export const DELIMITER_LIMIT = 1000;
/** Columns of indent before a list marker, 32 levels at two columns each. */
export const LIST_INDENT_LIMIT = 64;
/** `|` on one line, which is a table row's cells. */
export const TABLE_PIPE_LIMIT = 256;

const LIST_MARKER = /^(?:[-*+]|\d{1,9}[.)])(?:[ \t]|$)/;

export function tooCostlyToRender(text: string): boolean {
  let delimiters = 0;
  for (let pos = 0; pos <= text.length; ) {
    const nl = text.indexOf('\n', pos);
    const end = nl < 0 ? text.length : nl;
    let indent = 0;
    let start = pos;
    for (; start < end; start++) {
      const ch = text[start];
      if (ch === ' ') indent += 1;
      else if (ch === '\t') indent += 4;
      else break;
    }
    pos = end + 1;
    if (start === end || (end - start === 1 && text[start] === '\r')) {
      delimiters = 0;
      continue;
    }
    // A list item or heading starts a paragraph of its own.
    const isMarker = LIST_MARKER.test(text.slice(start, Math.min(end, start + 12)));
    if (isMarker) {
      if (indent >= LIST_INDENT_LIMIT) return true;
      delimiters = 0;
    } else if (text[start] === '#') delimiters = 0;
    let pipes = 0;
    for (let i = start; i < end; i++) {
      const ch = text.charCodeAt(i);
      // `*` 42, `_` 95, `~` 126, `|` 124
      if (ch === 42 || ch === 95 || ch === 126) delimiters++;
      else if (ch === 124) pipes++;
    }
    if (delimiters > DELIMITER_LIMIT || pipes > TABLE_PIPE_LIMIT) return true;
  }
  return false;
}
