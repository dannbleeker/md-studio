import { codeRanges, inCode } from './codeRegions';
import { frontMatterEnd } from './frontMatter';

/**
 * TeX math in Markdown, `$x^2$` inline and `$$ ... $$` for display, with the
 * rules Pandoc and Obsidian share so that prices stay prices: an opening `$`
 * is not followed by a space, a closing one is not preceded by one or
 * followed by a digit, and a backslash makes a dollar sign literal. Code and
 * front matter hold no math.
 *
 * Every function is a single pass over the text, and the one search that
 * could repeat (the closing `$` of an inline span) is answered from a list
 * built once, so a long text of stray dollar signs costs no more than any
 * other long text.
 */

export type MathSpan = {
  start: number;
  end: number;
  /** The span as written, delimiters included. */
  raw: string;
  display: boolean;
  /** The TeX between the delimiters, trimmed. */
  tex: string;
};

const MAX_INLINE = 1000;
const MAX_DISPLAY = 20_000;

/** A backslash before `at` that is not itself escaped makes the character at `at` literal. */
function escapedAt(text: string, at: number): boolean {
  let n = 0;
  while (at - n - 1 >= 0 && text[at - n - 1] === '\\') n++;
  return n % 2 === 1;
}

const isSpace = (ch: string | undefined): boolean => ch === undefined || /\s/.test(ch);
const isDigit = (ch: string | undefined): boolean => ch !== undefined && ch >= '0' && ch <= '9';

/** What a token written as `raw` is, when it is exactly one math span. */
export function parseMathToken(raw: string): { display: boolean; tex: string } | null {
  const spans = findMath(raw);
  const only = spans[0];
  return spans.length === 1 && only?.start === 0 && only.end === raw.length
    ? { display: only.display, tex: only.tex }
    : null;
}

export function findMath(text: string): MathSpan[] {
  if (!text.includes('$')) return [];
  const fm = frontMatterEnd(text);
  const code = codeRanges(text, fm < 0 ? 0 : fm + 1);
  const skipped = (at: number) => at <= fm || inCode(code, at);

  // Closers an inline span could end on, found once.
  const closers: number[] = [];
  for (let at = text.indexOf('$'); at >= 0; at = text.indexOf('$', at + 1)) {
    if (text[at + 1] === '$' || text[at - 1] === '$') continue;
    if (escapedAt(text, at) || skipped(at)) continue;
    if (isSpace(text[at - 1]) || isDigit(text[at + 1])) continue;
    closers.push(at);
  }
  // Blank lines end a paragraph, and inline math does not cross one.
  const blank = /\n[ \t]*\n/g;
  let nextBlank = (blank.exec(text)?.index ?? Infinity) as number;

  const spans: MathSpan[] = [];
  let nextCloser = 0;
  for (let at = text.indexOf('$'); at >= 0; ) {
    if (escapedAt(text, at) || skipped(at)) {
      at = text.indexOf('$', at + 1);
      continue;
    }
    if (text[at + 1] === '$') {
      // Display math: up to the next unescaped `$$`.
      let close = text.indexOf('$$', at + 2);
      while (close >= 0 && (escapedAt(text, close) || skipped(close)))
        close = text.indexOf('$$', close + 1);
      if (close < 0 || close - at > MAX_DISPLAY) {
        at = text.indexOf('$', at + 2);
        continue;
      }
      const tex = text.slice(at + 2, close).trim();
      // An empty pair is consumed too, so it cannot pair with a later `$$`.
      if (tex !== '')
        spans.push({
          start: at,
          end: close + 2,
          raw: text.slice(at, close + 2),
          display: true,
          tex,
        });
      at = text.indexOf('$', close + 2);
      continue;
    }
    if (isSpace(text[at + 1])) {
      at = text.indexOf('$', at + 1);
      continue;
    }
    while (nextCloser < closers.length && (closers[nextCloser] as number) <= at) nextCloser++;
    const close = closers[nextCloser];
    while (nextBlank < at) nextBlank = blank.exec(text)?.index ?? Infinity;
    if (close !== undefined && close - at <= MAX_INLINE && nextBlank > close) {
      spans.push({
        start: at,
        end: close + 1,
        raw: text.slice(at, close + 1),
        display: false,
        tex: text.slice(at + 1, close).trim(),
      });
      at = text.indexOf('$', close + 1);
    } else {
      at = text.indexOf('$', at + 1);
    }
  }
  return spans;
}
