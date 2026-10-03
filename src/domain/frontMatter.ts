/**
 * YAML front matter: a metadata block that opens the document with a `---`
 * line and closes with the next `---` line, as static site generators,
 * Obsidian and Pandoc read it. The visual pane parses it with
 * `remark-frontmatter`, so this follows the same rules: the opening fence
 * must be the very first line, both fences may carry trailing whitespace
 * but not leading, and nothing else (not `...`, not `----`) closes it.
 * The raw-text helpers (headings, block split) skip it with this, or they
 * would read the closing fence as a setext underline.
 */

const FENCE = /^---[ \t]*\r?$/;

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
    if (FENCE.test(markdown.slice(pos, lineEnd))) return lineEnd;
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

/** The `title:` field of the front matter, if it has a plain one. */
export function frontMatterTitle(markdown: string): string {
  const end = frontMatterEnd(markdown);
  if (end < 0) return '';
  const match = /^title:[ \t]*(.*?)[ \t]*\r?$/m.exec(markdown.slice(0, end));
  const value = match?.[1] ?? '';
  const quoted = /^(["'])(.*)\1$/.exec(value);
  return (quoted ? (quoted[2] ?? '') : value).trim();
}
