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
    if (!definitions.has(def[1])) definitions.set(def[1], content);
    i = j - 1;
  }

  const order: string[] = [];
  const number = (id: string) => {
    if (!definitions.has(id)) return null;
    if (!order.includes(id)) order.push(id);
    return order.indexOf(id) + 1;
  };
  const refs = (text: string) =>
    text.replace(REFERENCE, (match, id: string) => {
      const n = number(id);
      return n === null ? match : `\\[${n}\\]`;
    });

  fence = null;
  const out = body.map((line) => {
    const fenceMatch = FENCE.exec(line);
    if (fence) {
      if (fenceMatch?.[1]?.startsWith(fence)) fence = null;
      return line;
    }
    if (fenceMatch?.[1]) {
      fence = fenceMatch[1];
      return line;
    }
    return outsideCode(line, refs);
  });
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
