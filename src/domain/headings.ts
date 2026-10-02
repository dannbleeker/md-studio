/**
 * Top-level heading detection on raw Markdown, line by line.
 *
 * Linked scroll pairs the N-th heading in the text pane with the N-th
 * top-level heading element the visual pane renders, so this has to agree
 * with what a CommonMark renderer turns into an `<h1>`–`<h6>` at the root:
 * ATX and setext headings, but nothing inside fenced code, indented code,
 * block quotes, or lists.
 */

import { closesFence, openFence } from './fences';

export type Heading = {
  /** 0-based line index of the heading text. */
  line: number;
  level: number;
  text: string;
};

const ATX = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/;
const SETEXT_1 = /^ {0,3}=+[ \t]*$/;
const SETEXT_2 = /^ {0,3}-+[ \t]*$/;
/** Starts a list item or block quote: headings inside those aren't top-level. */
const CONTAINER = /^ {0,3}(?:(?:[*+-]|\d{1,9}[.)])(?:[ \t]|$)|>)/;
/** Starts an HTML block (CommonMark types 1, 2 and 6): its lines aren't Markdown. */
const HTML_BLOCK =
  /^ {0,3}<(?:!--|\/?(?:address|article|aside|blockquote|details|dialog|div|dl|fieldset|figcaption|figure|footer|form|h[1-6]|header|hr|li|main|nav|ol|p|pre|script|section|style|summary|table|tbody|td|tfoot|th|thead|tr|ul)(?:[\s/>]|$))/i;
/**
 * Lines that can't start a paragraph, once containers, fences, HTML and ATX
 * headings are ruled out: a thematic break, or indented code. A line merely
 * starting with `*`, `#` or a number (`*Intro* text`, `#tag`, `1.5 m`) is
 * prose, and a setext underline below it makes it a heading.
 */
const NOT_PARAGRAPH = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$|^(?: {4}|\t)/;

export function findHeadings(markdown: string): Heading[] {
  const lines = markdown.split(/\r?\n/);
  const headings: Heading[] = [];
  let fence: string | null = null;
  // Line index where the paragraph currently being read began, if any.
  // A setext underline turns that whole paragraph into one heading.
  let paragraphStart = -1;
  // Inside a list item or block quote: its lines (indented, or lazy
  // continuations) hold no top-level headings. Ends at an unindented line
  // after a blank one, or at an ATX heading, which interrupts anything.
  let container = false;
  let blankBefore = false;
  // Inside an HTML block: until a blank line, or `-->` for a comment.
  let html: 'block' | 'comment' | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const blank = line.trim() === '';

    if (fence) {
      if (closesFence(line, fence)) fence = null;
      continue;
    }
    if (html) {
      if (html === 'comment' ? line.includes('-->') : blank) html = null;
      blankBefore = blank;
      continue;
    }
    if (blank) {
      paragraphStart = -1;
      blankBefore = true;
      continue;
    }

    const indented = /^[ \t]/.test(line);
    const interrupts = !indented && (ATX.test(line) || openFence(line) !== null);
    if (container && !CONTAINER.test(line) && (indented || !blankBefore) && !interrupts) {
      blankBefore = false;
      continue;
    }
    if (CONTAINER.test(line)) {
      container = true;
      paragraphStart = -1;
      blankBefore = false;
      continue;
    }
    container = false;
    blankBefore = false;

    const open = openFence(line);
    if (open) {
      fence = open;
      paragraphStart = -1;
      continue;
    }
    if (paragraphStart < 0 && HTML_BLOCK.test(line)) {
      html = /^ {0,3}<!--/.test(line) && !line.includes('-->') ? 'comment' : 'block';
      continue;
    }

    const atx = ATX.exec(line);
    if (atx?.[1]) {
      headings.push({ line: i, level: atx[1].length, text: (atx[2] ?? '').trim() });
      paragraphStart = -1;
      continue;
    }

    if (paragraphStart >= 0 && (SETEXT_1.test(line) || SETEXT_2.test(line))) {
      headings.push({
        line: paragraphStart,
        level: SETEXT_1.test(line) ? 1 : 2,
        text: lines
          .slice(paragraphStart, i)
          .map((l) => l.trim())
          .join(' '),
      });
      paragraphStart = -1;
      continue;
    }

    if (paragraphStart < 0 && !NOT_PARAGRAPH.test(line)) paragraphStart = i;
  }
  return headings;
}
