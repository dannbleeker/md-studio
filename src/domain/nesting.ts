/**
 * Markdown nested deeply enough to stall or crash the editors' parsers.
 *
 * Both parsers handle nesting by recursion, and two of them are quadratic
 * on nested brackets: 20,000 nested `[` take micromark (the visual pane)
 * over a second and Lezer (the Markdown pane) half a second, on every
 * load, and 10,000 nested `![` overflow Lezer's stack. Thousands of `>` or
 * `*` overflow Milkdown's. No real document comes near the limits below,
 * so a document past them is shown as plain text instead of parsed.
 *
 * Code is not told apart from prose: a code block with hundreds of nested
 * brackets also counts. That only costs highlighting, never text.
 */

/** Brackets open at once within one paragraph, or `>` on one line. */
export const NESTING_LIMIT = 256;
/** `*` or `_` in a row (a long `****` rule stays well below this). */
export const EMPHASIS_RUN_LIMIT = 500;

/**
 * True when the text nests brackets or quotes, or runs emphasis markers,
 * past the limits. Takes the text in chunks (CodeMirror's `Text.iter()`
 * yields lines), so a large document is scanned without copying it.
 */
export function tooDeeplyNested(chunks: Iterable<string>): boolean {
  let brackets = 0;
  let quotes = 0;
  let atLineStart = true;
  // A line with only whitespace so far: a blank line ends the paragraph.
  let blankSoFar = true;
  let runChar = '';
  let run = 0;
  let escaped = false;
  for (const chunk of chunks) {
    for (let i = 0; i < chunk.length; i++) {
      const ch = chunk[i] as string;
      if (ch === '\n') {
        if (blankSoFar) brackets = 0;
        atLineStart = true;
        blankSoFar = true;
        quotes = 0;
        run = 0;
        escaped = false;
        continue;
      }
      if (ch !== ' ' && ch !== '\t') blankSoFar = false;
      if (atLineStart) {
        if (ch === '>') {
          if (++quotes > NESTING_LIMIT) return true;
          continue;
        }
        if (ch !== ' ' && ch !== '\t') atLineStart = false;
      }
      if (ch === '*' || ch === '_') {
        run = ch === runChar ? run + 1 : 1;
        runChar = ch;
        if (run > EMPHASIS_RUN_LIMIT) return true;
      } else {
        run = 0;
        runChar = '';
      }
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\') escaped = true;
      else if (ch === '[') {
        if (++brackets > NESTING_LIMIT) return true;
      } else if (ch === ']' && brackets > 0) brackets--;
    }
  }
  return false;
}
