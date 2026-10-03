/**
 * YAML front matter: a metadata block that opens the document with a `---`
 * line and closes with the next `---` or `...` line, as static site
 * generators, Obsidian and Pandoc read it. Following Pandoc, an opening
 * fence followed by a blank line is a rule, not front matter. The opening
 * fence must be the very first line, and fences may carry trailing
 * whitespace but not leading (`----` doesn't count). The visual pane parses
 * with `remark-frontmatter` and corrects its result with this, so both
 * panes agree. The raw-text helpers (headings, block split) skip it with
 * this, or they would read the closing fence as a setext underline.
 */

const FENCE = /^---[ \t]*\r?$/;
const CLOSE = /^(?:---|\.\.\.)[ \t]*\r?$/;
const BLANK = /^[ \t]*\r?$/;

/**
 * End offset of the closing fence line (before its line break), or -1 when
 * the document doesn't open with front matter.
 */
export function frontMatterEnd(markdown: string): number {
  const firstBreak = markdown.indexOf('\n');
  if (firstBreak < 0 || !FENCE.test(markdown.slice(0, firstBreak))) return -1;
  let pos = firstBreak + 1;
  while (pos <= markdown.length) {
    const next = markdown.indexOf('\n', pos);
    const lineEnd = next < 0 ? markdown.length : next;
    const line = markdown.slice(pos, lineEnd);
    if (CLOSE.test(line)) return lineEnd;
    if (pos === firstBreak + 1 && BLANK.test(line)) return -1;
    if (next < 0) return -1;
    pos = next + 1;
  }
  return -1;
}

/** Number of lines the front matter spans, fences included (0 when there is none). */
export function frontMatterLines(markdown: string): number {
  const end = frontMatterEnd(markdown);
  if (end < 0) return 0;
  let lines = 1;
  for (let i = 0; i < end; i++) if (markdown.charCodeAt(i) === 10) lines++;
  return lines;
}

/**
 * The Markdown handed to an exporter. Front matter is metadata for other
 * tools, and every exporter would render it as a rule and a heading: it is
 * dropped, or with `include`, turned into a YAML code block so it shows as
 * the visual pane shows it.
 */
export function frontMatterForExport(markdown: string, include: boolean): string {
  const end = frontMatterEnd(markdown);
  if (end < 0) return markdown;
  const rest = markdown.slice(end + 1).replace(/^(?:[ \t]*\r?\n)+/, '');
  const yaml = markdown
    .slice(markdown.indexOf('\n') + 1, markdown.lastIndexOf('\n', end - 1) + 1)
    .replace(/\r?\n$/, '');
  if (!include || yaml.trim() === '') return rest;
  // Longer than any backtick run inside, so nothing in the YAML closes it.
  const longest = Math.max(0, ...(yaml.match(/`+/g) ?? []).map((run) => run.length));
  const fence = '`'.repeat(Math.max(3, longest + 1));
  return `${fence}yaml\n${yaml}\n${fence}\n\n${rest}`;
}

/**
 * The `title:` field of the front matter, if it has a one-line one: plain,
 * or quoted with YAML's escapes (`''` in single quotes, `\"` and `\\` in
 * double), less a trailing ` # comment`. A block scalar (`|`, `>-`, …) is
 * left out: its text is on the lines below.
 */
export function frontMatterTitle(markdown: string): string {
  const end = frontMatterEnd(markdown);
  if (end < 0) return '';
  const match = /^title:[ \t]*(.*?)[ \t]*\r?$/m.exec(markdown.slice(0, end));
  const value = match?.[1] ?? '';
  if (value.startsWith('#') || /^[|>][-+0-9]*(?:[ \t]+#.*)?$/.test(value)) return '';
  const double = /^"((?:[^"\\]|\\.)*)"/.exec(value);
  if (double) return (double[1] ?? '').replace(/\\(["\\/])/g, '$1').trim();
  const single = /^'((?:[^']|'')*)'/.exec(value);
  if (single) return (single[1] ?? '').replace(/''/g, "'").trim();
  return value.replace(/[ \t]+#.*$/, '').trim();
}
