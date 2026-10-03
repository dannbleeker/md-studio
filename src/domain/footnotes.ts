/**
 * Footnotes for export. The visual pane renders GFM footnotes, but the
 * exporters (marked with gfm) have no footnote support and would print
 * `[^1]` literally. This rewrites them into plain Markdown every exporter
 * already handles: references become "[1]" in order of first use, and the
 * notes become a numbered list after a rule at the end. Definitions that
 * are never referenced are dropped, as GFM renderers do.
 */

const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const DEFINITION = /^ {0,3}\[\^([^\]\s]+)\]:[ \t]?(.*)$/;
const CONTINUATION = /^(?: {4}|\t)/;
const REFERENCE = /\[\^([^\]\s]+)\]/g;

const OPEN_FENCE = /^ *(`{3,}|~{3,})/;
const LIST_ITEM = /^( *)([-*+]|\d{1,9}[.)])( *)/;

/** A line's leading whitespace in columns, tabs to the next multiple of four. */
function indentOf(line: string): number {
  let col = 0;
  for (const ch of line) {
    if (ch === ' ') col++;
    else if (ch === '\t') col += 4 - (col % 4);
    else break;
  }
  return col;
}

/**
 * Which lines are code: fenced blocks (a fence may sit indented inside a
 * list item) and indented code blocks. Indented code is four columns past
 * the content of the list item it sits in, after a blank line, so a
 * paragraph's continuation lines and a list item's further paragraphs are
 * not mistaken for it.
 */
function codeLines(lines: string[]): boolean[] {
  const code = lines.map(() => false);
  // Content columns of the list items the current line may belong to.
  const columns: number[] = [];
  let fence: string | null = null;
  let prevBlank = true;
  let prevCode = false;
  lines.forEach((line, i) => {
    if (fence) {
      code[i] = true;
      if (OPEN_FENCE.exec(line)?.[1]?.startsWith(fence)) fence = null;
      return;
    }
    if (line.trim() === '') {
      prevBlank = true;
      return;
    }
    const indent = indentOf(line);
    const popTo = (col: number) => {
      while (columns.length > 0 && col < (columns.at(-1) ?? 0)) columns.pop();
    };
    // After a blank line, text less indented than an item's content has left that item.
    if (prevBlank) popTo(indent);
    const base = columns.at(-1) ?? 0;
    const blankBefore = prevBlank;
    prevBlank = false;
    if (indent >= base + 4 && (blankBefore || prevCode)) {
      code[i] = true;
      prevCode = true;
      return;
    }
    prevCode = false;
    const fenceMatch = OPEN_FENCE.exec(line);
    if (fenceMatch?.[1]) {
      fence = fenceMatch[1];
      code[i] = true;
      return;
    }
    const item = LIST_ITEM.exec(line);
    if (item && (item[3] !== '' || line.length === item[0].length)) {
      popTo(indent);
      const gap = item[3]?.length ?? 0;
      // An empty item, or one whose text starts five or more spaces in
      // (indented code), has its content one column past the marker.
      columns.push(indent + (item[2]?.length ?? 1) + (gap === 0 || gap > 4 ? 1 : gap));
    }
  });
  return code;
}

/** Applies `fn` to the parts of a line outside inline code spans. */
function outsideCode(line: string, fn: (text: string) => string): string {
  return line
    .split(/(`+[^`]*`+)/)
    .map((part, i) => (i % 2 === 1 ? part : fn(part)))
    .join('');
}

export function inlineFootnotes(markdown: string): string {
  if (!markdown.includes('[^')) return markdown;
  const lines = markdown.split(/\r?\n/);
  const definitions = new Map<string, string[]>();
  const body: string[] = [];
  let fence: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const fenceMatch = FENCE.exec(line);
    if (fence) {
      if (fenceMatch?.[1]?.startsWith(fence)) fence = null;
      body.push(line);
      continue;
    }
    if (fenceMatch?.[1]) {
      fence = fenceMatch[1];
      body.push(line);
      continue;
    }
    const def = DEFINITION.exec(line);
    if (!def?.[1]) {
      body.push(line);
      continue;
    }
    // A definition runs on through indented lines, blank lines included
    // when more indented text follows them.
    const content = [def[2] ?? ''];
    let j = i + 1;
    while (j < lines.length) {
      const next = lines[j] ?? '';
      if (CONTINUATION.test(next)) content.push(next.replace(CONTINUATION, ''));
      else if (next.trim() === '' && CONTINUATION.test(lines[j + 1] ?? '')) content.push('');
      else break;
      j++;
    }
    // Labels match case-insensitively, as in GFM: [^Note] refers to [^note].
    const label = def[1].toLowerCase();
    if (!definitions.has(label)) definitions.set(label, content);
    i = j - 1;
  }

  const order: string[] = [];
  const number = (ref: string) => {
    const id = ref.toLowerCase();
    if (!definitions.has(id)) return null;
    if (!order.includes(id)) order.push(id);
    return order.indexOf(id) + 1;
  };
  const refs = (text: string) =>
    text.replace(REFERENCE, (match, id: string) => {
      const n = number(id);
      return n === null ? match : `\\[${n}\\]`;
    });

  const code = codeLines(body);
  const out = body.map((line, i) => (code[i] ? line : outsideCode(line, refs)));
  if (order.length === 0) return out.join('\n');

  // Notes may reference other notes; number those too, in order of use.
  const notes: string[] = [];
  for (let k = 0; k < order.length; k++) {
    const id = order[k] as string;
    const [first = '', ...rest] = definitions.get(id) ?? [];
    const item = [first, ...rest].map((l) => outsideCode(l, refs));
    notes.push(
      `${k + 1}. ${item[0]}${item
        .slice(1)
        .map((l) => (l ? `\n   ${l}` : '\n'))
        .join('')}`
    );
  }
  const text = out.join('\n').replace(/\s+$/, '');
  return `${text}\n\n---\n\n${notes.join('\n')}\n`;
}
