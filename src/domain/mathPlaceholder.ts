import { findMath } from './math';

/**
 * How math gets past the Markdown parser unharmed. In the visual pane's
 * parse, every math span is first replaced by one inert word that carries
 * the span itself, so the parser never sees its `*`, `_`, `\` or line
 * breaks; a remark step (`remarkMath`) then turns each word back into a math
 * node holding the exact source text. Nothing is looked up afterwards: the
 * word spells out what it stands for.
 *
 *       i | d  hex digits  
 *             inline / display   (UTF-16 code units, four digits each)
 *
 * The marks are private-use characters. A document that already contains
 * either is left alone, so a placeholder always came from here.
 */
const OPEN = '';
const CLOSE = '';

const toHex = (text: string): string => {
  let out = '';
  for (let i = 0; i < text.length; i++) out += text.charCodeAt(i).toString(16).padStart(4, '0');
  return out;
};

const fromHex = (hex: string): string | null => {
  if (hex.length % 4 !== 0) return null;
  let out = '';
  for (let i = 0; i < hex.length; i += 4)
    out += String.fromCharCode(Number.parseInt(hex.slice(i, i + 4), 16));
  return out;
};

/** The Markdown with every math span replaced by its placeholder; the same text when there is none. */
export function withMathPlaceholders(markdown: string): string {
  if (!markdown.includes('$') || markdown.includes(OPEN) || markdown.includes(CLOSE))
    return markdown;
  const spans = findMath(markdown);
  if (spans.length === 0) return markdown;
  let out = '';
  let from = 0;
  for (const span of spans) {
    out += markdown.slice(from, span.start);
    out += `${OPEN}${span.display ? 'd' : 'i'}${toHex(span.raw)}${CLOSE}`;
    from = span.end;
  }
  return out + markdown.slice(from);
}

export type Piece = { text: string } | { math: string };

const PATTERN = /[id]((?:[0-9a-f]{4}){1,5000})/g;

/** Whether `text` holds a placeholder. */
export const hasPlaceholder = (text: string): boolean => text.includes(OPEN);

/**
 * `text` as plain pieces and math sources, in order. A placeholder that
 * does not decode is left as the text it is.
 */
export function splitPlaceholders(text: string): Piece[] {
  const pieces: Piece[] = [];
  let cursor = 0;
  for (const match of text.matchAll(PATTERN)) {
    const raw = fromHex(match[1] ?? '');
    if (raw === null) continue;
    if (match.index > cursor) pieces.push({ text: text.slice(cursor, match.index) });
    pieces.push({ math: raw });
    cursor = match.index + match[0].length;
  }
  if (cursor < text.length) pieces.push({ text: text.slice(cursor) });
  return pieces;
}

/** `text` with every placeholder written back as the source it stands for. */
export function restorePlaceholders(text: string): string {
  if (!hasPlaceholder(text)) return text;
  return splitPlaceholders(text)
    .map((piece) => ('math' in piece ? piece.math : piece.text))
    .join('');
}
