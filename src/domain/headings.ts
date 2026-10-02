/**
 * Top-level heading detection on raw Markdown, line by line.
 *
 * Linked scroll pairs the N-th heading in the text pane with the N-th
 * top-level heading element the visual pane renders, so this has to agree
 * with what a CommonMark renderer turns into an `<h1>`–`<h6>` at the root:
 * ATX and setext headings, but nothing inside fenced code, indented code,
 * block quotes, or lists.
 */

export type Heading = {
  /** 0-based line index of the heading text. */
  line: number;
  level: number;
  text: string;
};

const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const ATX = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/;
const SETEXT_1 = /^ {0,3}=+[ \t]*$/;
const SETEXT_2 = /^ {0,3}-+[ \t]*$/;
const NOT_PARAGRAPH = /^ {0,3}(?:[>*+-]|\d+[.)]|#|`{3,}|~{3,})|^(?: {4}|\t)/;

export function findHeadings(markdown: string): Heading[] {
  const lines = markdown.split(/\r?\n/);
  const headings: Heading[] = [];
  let fence: string | null = null;
  // Line index where the paragraph currently being read began, if any.
  // A setext underline turns that whole paragraph into one heading.
  let paragraphStart = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';

    const fenceMatch = FENCE.exec(line);
    if (fence) {
      if (fenceMatch?.[1]?.startsWith(fence)) fence = null;
      continue;
    }
    if (fenceMatch?.[1]) {
      fence = fenceMatch[1];
      paragraphStart = -1;
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

    if (line.trim() === '') paragraphStart = -1;
    else if (paragraphStart < 0 && !NOT_PARAGRAPH.test(line)) paragraphStart = i;
  }
  return headings;
}
