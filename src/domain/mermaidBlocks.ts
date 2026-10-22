/**
 * Fenced ```mermaid blocks in a Markdown text. One pass over the lines, so
 * a long document costs no more per line than a short one. A fence inside
 * another fence (a guide that shows the syntax) is not a block, and an
 * unclosed one runs to the end, as CommonMark reads it.
 */
export type MermaidBlock = {
  /** Offset of the opening fence line. */
  start: number;
  /** Offset just past the closing fence line (before its line break), or the text's end. */
  end: number;
  source: string;
};

const FENCE = /^ {0,3}(`{3,}|~{3,})(.*)$/;

export function findMermaidBlocks(text: string): MermaidBlock[] {
  if (!text.includes('mermaid')) return [];
  const blocks: MermaidBlock[] = [];
  let open: { char: string; length: number; mermaid: boolean; start: number; from: number } | null =
    null;
  for (let pos = 0; pos <= text.length; ) {
    const nl = text.indexOf('\n', pos);
    const lineEnd = nl < 0 ? text.length : nl;
    const line = text.slice(pos, text[lineEnd - 1] === '\r' ? lineEnd - 1 : lineEnd);
    const fence = FENCE.exec(line);
    if (open) {
      const run = fence?.[1];
      // A closing fence: same character, at least as long, and nothing after it.
      if (
        run &&
        run[0] === open.char &&
        run.length >= open.length &&
        (fence?.[2] ?? '').trim() === ''
      ) {
        if (open.mermaid)
          blocks.push({
            start: open.start,
            end: lineEnd,
            source: text.slice(open.from, Math.max(open.from, pos - 1)).replace(/\r$/, ''),
          });
        open = null;
      }
    } else if (fence?.[1]) {
      const run = fence[1];
      const info = (fence[2] ?? '').trim();
      // A backtick fence's info string has no backticks (that would be inline code).
      if (!(run[0] === '`' && info.includes('`')))
        open = {
          char: run[0] as string,
          length: run.length,
          mermaid: /^mermaid(?:\s|$)/i.test(info),
          start: pos,
          from: nl < 0 ? text.length : nl + 1,
        };
    }
    pos = lineEnd + 1;
  }
  // Unclosed: it runs to the end of the text.
  if (open?.mermaid)
    blocks.push({
      start: open.start,
      end: text.length,
      source: text.slice(open.from).replace(/\r?\n$/, ''),
    });
  return blocks;
}
