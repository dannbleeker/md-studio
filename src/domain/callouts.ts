/**
 * Obsidian callouts: a blockquote whose first line is `[!type]`, optionally
 * followed by `+` or `-` (foldable in Obsidian) and a title.
 *
 *     > [!warning] Careful
 *     > The text of the callout.
 */

export type CalloutKind =
  | 'note'
  | 'tip'
  | 'success'
  | 'question'
  | 'warning'
  | 'danger'
  | 'example'
  | 'quote'
  | 'abstract';

export type Callout = {
  /** As written, lower case. */
  type: string;
  /** What the callout looks like: its colour family. */
  kind: CalloutKind;
  /** The title shown when the author wrote none: the type, capitalised. */
  label: string;
  /** The title the author wrote after the marker, if any. */
  title: string | null;
  /** Characters at the start to hide: the marker, its spaces and, for a bare marker, the line break. */
  hideLength: number;
  /** Where the title ends (the first line break, or the end of the text). */
  titleEnd: number;
};

const KINDS: Record<string, CalloutKind> = {
  note: 'note',
  info: 'note',
  todo: 'note',
  tip: 'tip',
  hint: 'tip',
  important: 'tip',
  success: 'success',
  check: 'success',
  done: 'success',
  question: 'question',
  help: 'question',
  faq: 'question',
  warning: 'warning',
  caution: 'warning',
  attention: 'warning',
  failure: 'danger',
  fail: 'danger',
  missing: 'danger',
  danger: 'danger',
  error: 'danger',
  bug: 'danger',
  example: 'example',
  quote: 'quote',
  cite: 'quote',
  abstract: 'abstract',
  summary: 'abstract',
  tldr: 'abstract',
};

const MARKER = /^\[!([A-Za-z][A-Za-z0-9_-]{0,29})\][+-]?[ \t]*/;

/** The callout a blockquote's first text opens with, or null when it is an ordinary quote. */
export function parseCallout(text: string): Callout | null {
  const match = MARKER.exec(text);
  const name = match?.[1];
  if (!match || !name) return null;
  const type = name.toLowerCase();
  const newline = text.indexOf('\n', match[0].length);
  const titleEnd = newline < 0 ? text.length : newline;
  const title = text.slice(match[0].length, titleEnd).trim();
  return {
    type,
    kind: KINDS[type] ?? 'note',
    label: type.charAt(0).toUpperCase() + type.slice(1),
    title: title === '' ? null : title,
    // A marker alone on its line takes the line break with it, so the body starts at the top.
    hideLength: match[0].length + (title === '' && newline >= 0 ? 1 : 0),
    titleEnd,
  };
}
