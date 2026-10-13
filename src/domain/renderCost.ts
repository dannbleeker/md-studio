/**
 * Markdown that is small enough to render but slow to parse. The visual pane's parser
 * (micromark) is quadratic on a paragraph full of unmatched emphasis delimiters and
 * slow on lists nested hundreds deep and on tables hundreds of columns wide: 10,000
 * characters of `*a` take over a second, 20,000 over three. nesting.ts catches runs of
 * brackets and quotes; this catches the rest, the structures that make a long run of
 * lines quadratic (setext underlines, quote and list lines inside one another, lazy
 * continuations: 50,000 characters of `- > a` take 15 seconds). A transcluded note may come from anywhere
 * and is parsed on its own as soon as it is shown, so it is kept to a plain-text
 * placeholder instead. No real note comes near these limits.
 */

/** `*`, `_` and `~` in one paragraph. */
export const DELIMITER_LIMIT = 1000;
/** Columns of indent before a list marker, 32 levels at two columns each. */
export const LIST_INDENT_LIMIT = 64;
/** `|` on one line, which is a table row's cells. */
export const TABLE_PIPE_LIMIT = 256;

/**
 * Lines of the kinds that nest or keep a container open (indented, quoted, a marker inside
 * another, a setext underline), counted from the last point where a blank line closed
 * everything. Plain lines, flat list items and table rows are not counted: they parse in
 * linear time however many there are. At 1,500 the slowest case takes about a second.
 */
const STRUCTURE_LIMIT = 1500;
/** Quote and list markers on one line, one inside the other. */
const LINE_CONTAINER_LIMIT = 32;

const LINE_CONTAINER = /(?:[-*+]|\d{1,9}[.)])[ \t]+|>[ \t]?/y;
const SETEXT_UNDERLINE = /^ {0,3}(?:=+|-+)[ \t]*\r?$/;
const LIST_MARKER = /^(?:[-*+]|\d{1,9}[.)])(?:[ \t]|$)/;

export function tooCostlyToRender(text: string): boolean {
  let delimiters = 0;
  let structure = 0;
  let afterBlank = true;
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
      afterBlank = true;
      continue;
    }
    const isMarker0 = LIST_MARKER.test(text.slice(start, Math.min(end, start + 12)));
    // Text at the margin after a blank line is outside every container.
    if (afterBlank && indent === 0 && !isMarker0) structure = 0;
    let nested = 0;
    LINE_CONTAINER.lastIndex = start;
    for (let m = LINE_CONTAINER.exec(text); m && m.index + m[0].length <= end; ) {
      nested++;
      if (nested > LINE_CONTAINER_LIMIT) return true;
      LINE_CONTAINER.lastIndex = m.index + m[0].length;
      m = LINE_CONTAINER.exec(text);
    }
    if (
      indent > 0 ||
      nested > 1 ||
      text[start] === '>' ||
      (!afterBlank && SETEXT_UNDERLINE.test(text.slice(start, end)))
    ) {
      if (++structure > STRUCTURE_LIMIT) return true;
    }
    afterBlank = false;
    // A list item or heading starts a paragraph of its own.
    if (isMarker0) {
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
