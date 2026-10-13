/**
 * Obsidian embeds for export. The exporters (HTML, Word, PDF, text) know
 * nothing about `![[...]]`, so before they run the text is rewritten on a
 * copy: images become `attachment:` links the image loader can read from the
 * vault, other files become labelled links, embedded notes become block
 * quotes, and anything unresolved becomes plain text. Pure: the vault is
 * reached through an injected environment, and labels are injected too, so
 * nothing here touches the DOM, services or translations.
 */

import { codeRanges, inCode } from './codeRegions';
import { findMarkdownImages, isLocalTarget, type MarkdownImageRef } from './embedLinks';
import { type EmbedKind, findWikiRefs, splitLinkTarget, type WikiRef } from './embeds';
import { inlineFootnotes } from './footnotes';
import { frontMatterEnd } from './frontMatter';
import { isWebImage } from './imagePaths';
import { descend, selectNoteContent, startChain, type TranscludeChain } from './transclusion';
import { encodeLinkPath } from './vaultConfig';
import { baseName, dirOf, relativePath } from './vaultIndex';

export const ATTACHMENT_SCHEME = 'attachment:';

export interface ExpandEnv {
  /**
   * `markdown` asks for the legacy Markdown order (note-relative first); it
   * is only set for Markdown image destinations.
   */
  resolve(
    target: string,
    fromNotePath: string | null,
    opts: { note: boolean; markdown?: boolean }
  ): Promise<{ path: string; kind: EmbedKind } | null>;
  readNote(path: string): Promise<string | null>;
  label(
    kind:
      | 'missing'
      | 'unavailable'
      | 'cycle'
      | 'depth'
      | 'limit'
      | 'pdf'
      | 'audio'
      | 'video'
      | 'other'
      | 'note'
      | 'note-missing',
    name: string
  ): string;
  unavailable: boolean;
  maxDepth: number;
}

/** Splits the `#size=WxH` an expanded image carries off its link target. */
export function parseSizeFragment(href: string): {
  href: string;
  displayWidth?: number;
  displayHeight?: number;
} {
  const m = /#size=(\d{1,5})(?:x(\d{1,5}))?$/.exec(href);
  if (!m) return { href };
  const width = Number(m[1]);
  const height = m[2] ? Number(m[2]) : 0;
  return {
    href: href.slice(0, m.index),
    ...(width > 0 ? { displayWidth: width } : {}),
    ...(height > 0 ? { displayHeight: height } : {}),
  };
}

/**
 * Depth alone does not bound the work: fan-out multiplies, so a few KB of
 * notes embedding each other many times over could expand to gigabytes. Past
 * either cap a note embed collapses to the labelled form. The text cap is
 * what the exporters have to chew through (a PDF of 15 MB took a minute), so
 * it sits near the size of a long book, not far above it.
 */
export const MAX_EXPANSIONS = 500;
export const MAX_EXPANDED_CHARS = 1_000_000;

interface Run {
  env: ExpandEnv;
  /** Note embeds expanded so far, across the whole export. */
  expansions: number;
  /** Characters of note text taken in by those expansions. */
  chars: number;
  /** The note being exported: relative links are written from its folder. */
  hostPath: string | null;
  rootText: string;
}

interface Level {
  notePath: string | null;
  /** What is being expanded: the whole note, or the part of it an embed selected. */
  text: string;
  /** The whole note, for an embed of the note itself. */
  source: string;
  chain: TranscludeChain;
}

export async function expandEmbeds(
  markdown: string,
  notePath: string | null,
  env: ExpandEnv
): Promise<string> {
  const run: Run = { env, expansions: 0, chars: 0, hostPath: notePath, rootText: markdown };
  return expand({ notePath, text: markdown, source: markdown, chain: startChain(notePath) }, run);
}

// ---------------------------------------------------------------------------
// Line structure
// ---------------------------------------------------------------------------

const QUOTE = /^ {0,3}> ?/;
const ITEM = /^ *(?:[-*+]|\d{1,9}[.)]) +/;
// Matched on a trimmed line: the edge whitespace is what made the old form backtrack.
const DELIMITER = /^\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?$/;

interface Lines {
  text: string[];
  starts: number[];
}

function splitLines(source: string): Lines {
  const text: string[] = [];
  const starts: number[] = [];
  for (let pos = 0; pos <= source.length; ) {
    const nl = source.indexOf('\n', pos);
    const end = nl < 0 ? source.length : nl;
    starts.push(pos);
    text.push(source.slice(pos, source[end - 1] === '\r' && end > pos ? end - 1 : end));
    pos = end + 1;
  }
  return { text, starts };
}

function lineIndexAt(starts: readonly number[], offset: number): number {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if ((starts[mid] ?? 0) <= offset) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/**
 * Containers nested deeper than this are not read (as in `codeRegions.ts`). Real documents
 * stay far below it; a crafted line of thousands of markers would otherwise be rescanned
 * for every token on it.
 */
const MAX_DEPTH = 64;
/**
 * The longest container prefix a note embed is quoted under. The prefix is copied onto
 * every line of the embedded note, so its length multiplies the output.
 */
const MAX_PREFIX = 64;

/** A line with its quote markers and list markers taken off. */
function stripContainers(line: string): { rest: string; contained: boolean } {
  let rest = line;
  let contained = false;
  for (let depth = 0; depth < MAX_DEPTH; depth++) {
    const m = QUOTE.exec(rest) ?? ITEM.exec(rest);
    if (!m) break;
    rest = rest.slice(m[0].length);
    contained = true;
  }
  return { rest, contained };
}

/**
 * Lines that belong to a code block, from the shared scanner so a fence left
 * open in a quote or list item ends with its container here too. Only the
 * block boundaries need it: the token scanners already skip code themselves.
 */
function codeBlockLines(text: string, lines: Lines): boolean[] {
  const mask: boolean[] = new Array<boolean>(lines.text.length).fill(false);
  for (const range of codeRanges(text)) {
    if (!range.block) continue;
    const to = lineIndexAt(lines.starts, Math.max(range.start, range.end - 1));
    mask.fill(true, lineIndexAt(lines.starts, range.start), to + 1);
  }
  return mask;
}

interface Prefix {
  prefix: string;
  item: boolean;
  odd: boolean;
  /** Too deep or too long to quote under: an embed here keeps its label. */
  deep: boolean;
}

/** The text before an embed that belongs to its container, with list markers as spaces. */
function containerPrefix(line: string): Prefix {
  let rest = line;
  let prefix = '';
  let item = false;
  let deep = false;
  for (let depth = 0; ; depth++) {
    const quote = QUOTE.exec(rest);
    const marker = quote ? null : ITEM.exec(rest);
    const indent = quote || marker ? null : /^ +/.exec(rest);
    const m = quote ?? marker ?? indent;
    if (!m) break;
    prefix += marker ? ' '.repeat(m[0].length) : m[0];
    if (marker) item = true;
    rest = rest.slice(m[0].length);
    if (depth + 1 >= MAX_DEPTH || prefix.length > MAX_PREFIX) {
      deep = true;
      break;
    }
  }
  return { prefix, item, odd: /^[ >]*\t/.test(line), deep };
}

/** A line with nothing but quote markers and spaces. */
const isBare = (line: string | undefined): boolean => line === undefined || /^[\s>]*$/.test(line);

const ATX = /^ {0,3}#{1,6}(?:[ \t]|$)/;
const BREAK = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const DASHES = /^ {0,3}-+[ \t]*$/;

/**
 * A line that closes its own block, so the line after it starts a new paragraph
 * even without a blank line between: a heading, a thematic break, the closing
 * fence of a block, or the end of the front matter.
 */
function endsOwnBlock(line: string | undefined, fenced: boolean, frontMatterEnds: boolean) {
  if (line === undefined) return true;
  const { rest } = stripContainers(line);
  return fenced || frontMatterEnds || ATX.test(rest) || BREAK.test(rest);
}

/**
 * A line that opens a block of its own, so the line before it ends a paragraph.
 * A dash line under text is a setext underline, which keeps the text a heading.
 */
function opensOwnBlock(line: string | undefined, fenced: boolean) {
  if (line === undefined) return true;
  const { rest } = stripContainers(line);
  return fenced || ATX.test(rest) || (BREAK.test(rest) && !DASHES.test(rest));
}

/**
 * Which lines are rows of a GFM table: a run of pipe lines holding a delimiter
 * row. One pass, so a table with an embed per row stays linear.
 */
function tableRows(lines: readonly string[]): boolean[] {
  const mask: boolean[] = new Array<boolean>(lines.length).fill(false);
  let from = -1;
  let delimited = false;
  const close = (to: number) => {
    if (from >= 0 && delimited) mask.fill(true, from, to);
    from = -1;
    delimited = false;
  };
  lines.forEach((line, i) => {
    const { rest } = stripContainers(line);
    if (!rest.includes('|')) {
      close(i);
      return;
    }
    if (from < 0) from = i;
    if (DELIMITER.test(rest.trim())) delimited = true;
  });
  close(lines.length);
  return mask;
}

function startsItem(line: string): boolean {
  let rest = line;
  for (let depth = 0; depth < MAX_DEPTH; depth++) {
    const m = QUOTE.exec(rest);
    if (!m) break;
    rest = rest.slice(m[0].length);
  }
  return ITEM.test(rest);
}

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

interface Token {
  start: number;
  end: number;
  wiki?: WikiRef;
  image?: MarkdownImageRef;
}

function findTokens(text: string, plainImages: boolean): Token[] {
  const fm = frontMatterEnd(text);
  const usable = (start: number) => start > fm;
  const tokens: Token[] = [
    ...findWikiRefs(text)
      .filter((ref) => usable(ref.start))
      .map((wiki) => ({ start: wiki.start, end: wiki.end, wiki })),
    ...findMarkdownImages(text)
      .filter((image) => (plainImages || image.size !== null) && usable(image.start))
      .map((image) => ({ start: image.start, end: image.end, image })),
  ];
  tokens.sort((a, b) => a.start - b.start);
  // An overlap would corrupt the text: the first token wins.
  const out: Token[] = [];
  for (const token of tokens) {
    const last = out[out.length - 1];
    if (!last || token.start >= last.end) out.push(token);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Expansion
// ---------------------------------------------------------------------------

/** Plain text that must not turn into formatting or HTML. */
const escapeText = (s: string): string =>
  s
    .replace(/\s+/g, ' ')
    .replace(/[\\`*_[\]<>#~&]/g, '\\$&')
    // A list marker, setext underline or numbered item at the start would open a block.
    .replace(/^[-+=]/, '\\$&')
    .replace(/^(\d+)([.)])/, '$1\\$2');

/**
 * Whether the `]]` ending at `to` closes the label of a link: `[[1]](url)`,
 * `[[1]][ref]`, or `[see [[1]]](url)`. The visual pane leaves such labels
 * alone, so export does too. Bounded so a long line of tokens stays linear.
 */
function isLinkLabel(line: string, to: number): boolean {
  if (line[to] === '(' || line[to] === '[') return true;
  const limit = Math.min(line.length, to + 512);
  let depth = 0;
  for (let i = to; i < limit; i++) {
    const ch = line[i];
    if (ch === '\\') i++;
    else if (ch === '[') depth++;
    else if (ch === ']') {
      if (depth === 0) return line[i + 1] === '(' || line[i + 1] === '[';
      depth--;
    }
  }
  return false;
}

const escapeAlt = (s: string): string =>
  s
    .replace(/\s+/g, ' ')
    .replace(/[\\[\]]/g, ' ')
    .trim();

const sizeFragment = (size: { width: number; height: number | null } | null): string =>
  size ? `#size=${size.width}${size.height === null ? '' : `x${size.height}`}` : '';

/** A relative link target; a colon in its first segment would read as a URL scheme. */
function linkTarget(hostPath: string | null, path: string): string {
  const href = encodeLinkPath(relativePath(dirOf(hostPath ?? ''), path));
  return /^[^/]*:/.test(href) ? `./${href}` : href;
}

/** A web address named by a wikilink embed, as a Markdown image. */
function webImage(ref: WikiRef): string {
  const last = ref.target.split(/[?#]/)[0]?.split('/').pop() ?? '';
  let name = last;
  try {
    name = decodeURIComponent(last);
  } catch {
    // A malformed escape: the name stays as written.
  }
  const alt = escapeAlt(ref.alt ?? name) || 'image';
  return `![${alt}](<${ref.target.replace(/[<>\s]/g, encodeURIComponent)}>)`;
}

const REF_DEFINITION =
  /^ {0,3}\[([^\]\n^][^\]\n]*)\]:[ \t]*(<[^>\n]*>|\S+)(?:[ \t]+("[^"\n]*"|'[^'\n]*'|\([^)\n]*\)))?[ \t]*$/;
const REF_USE = /(!?)\[((?:[^[\]\\]|\\.)*)\](?:\[((?:[^[\]\\]|\\.)*)\])?/g;
const refLabel = (s: string): string => s.trim().replace(/\s+/g, ' ').toLowerCase();

/**
 * Link reference definitions of an embedded note, written into its links. The
 * note lands inside the host's text, where a definition of the same label
 * would win and the note's own would print as a paragraph.
 */
function inlineReferenceLinks(text: string): string {
  if (!/^ {0,3}\[[^\]\n^][^\]\n]*\]:/m.test(text)) return text;
  const code = codeRanges(text);
  const definitions = new Map<string, string>();
  const kept: string[] = [];
  let pos = 0;
  for (const line of text.split('\n')) {
    const m = inCode(code, pos) ? null : REF_DEFINITION.exec(line.replace(/\r$/, ''));
    pos += line.length + 1;
    if (!m?.[1] || !m[2]) {
      kept.push(line);
      continue;
    }
    const label = refLabel(m[1]);
    const dest = m[2].startsWith('<') || !/[()]/.test(m[2]) ? m[2] : `<${m[2]}>`;
    if (!definitions.has(label)) definitions.set(label, m[3] ? `${dest} ${m[3]}` : dest);
  }
  if (definitions.size === 0) return text;
  const body = kept.join('\n');
  const bodyCode = codeRanges(body);
  return body.replace(
    REF_USE,
    (whole: string, bang: string, label: string, ref: string | undefined, at: number) => {
      const next = body[at + whole.length];
      // A footnote, a wikilink, an inline link or something in code stays as written.
      if (label.startsWith('^') || body[at - 1] === '[' || next === ']' || inCode(bodyCode, at))
        return whole;
      if (ref === undefined && next === '(') return whole;
      const target = definitions.get(refLabel(ref ? ref : label));
      return target === undefined ? whole : `${bang}[${label}](${target})`;
    }
  );
}

/** What an embedded note brings in: its own links and footnotes, kept apart from the host's. */
const isolateNote = (text: string): string => inlineFootnotes(inlineReferenceLinks(text));

interface Site {
  /** The token's line, container prefix and whether it fills the line. */
  prefix: string;
  alone: boolean;
  table: boolean;
}

async function expand(level: Level, run: Run): Promise<string> {
  const { text } = level;
  if (!text.includes('[[') && !text.includes('![')) return text;
  const lines = splitLines(text);
  // In an embedded note a plain image must be read from that note's folder too.
  const tokens = findTokens(text, level.notePath !== run.hostPath);
  if (tokens.length === 0) return text;
  const fenced = codeBlockLines(text, lines);
  const tables = tableRows(lines.text);
  const fm = frontMatterEnd(text);
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const pieces: string[] = [];
  // Many tokens on one line share its prefix: read it once.
  const prefixes = new Map<number, Prefix>();
  // Likewise the verdict on the lines around it: it reads the neighbours in full.
  const edges = new Map<number, { startsBlock: boolean; endsBlock: boolean }>();
  let cursor = 0;
  for (const token of tokens) {
    const index = lineIndexAt(lines.starts, token.start);
    const line = lines.text[index] ?? '';
    const lineStart = lines.starts[index] ?? 0;
    // The label of a Markdown link is not a wikilink, whatever its brackets look like.
    if (token.wiki && isLinkLabel(line, token.end - lineStart)) continue;
    let found = prefixes.get(index);
    if (!found) {
      found = containerPrefix(line);
      prefixes.set(index, found);
    }
    const { prefix, item, odd, deep } = found;
    const table = tables[index] === true;
    const fills =
      token.start - lineStart === prefix.length &&
      line.slice(token.end - lineStart).trim() === '' &&
      token.end - lineStart <= line.length;
    let edge = edges.get(index);
    if (!edge) {
      const nextRest = lines.text[index + 1];
      const before = index === 0 ? undefined : lines.text[index - 1];
      const closesFrontMatter = fm >= 0 && (lines.starts[index - 1] ?? 0) <= fm && lineStart > fm;
      edge = {
        startsBlock:
          index === 0 ||
          isBare(before) ||
          item ||
          endsOwnBlock(before, fenced[index - 1] === true, closesFrontMatter),
        endsBlock:
          isBare(nextRest) ||
          (nextRest !== undefined && startsItem(nextRest)) ||
          opensOwnBlock(nextRest, fenced[index + 1] === true),
      };
      edges.set(index, edge);
    }
    const site: Site = {
      prefix,
      alone: fills && edge.startsBlock && edge.endsBlock && !table && !odd && !deep,
      table,
    };
    const replacement = await replaceToken(token, site, level, run, eol);
    if (replacement === null) continue;
    pieces.push(text.slice(cursor, token.start), replacement);
    cursor = token.end;
  }
  pieces.push(text.slice(cursor));
  return pieces.join('');
}

async function replaceToken(
  token: Token,
  site: Site,
  level: Level,
  run: Run,
  eol: string
): Promise<string | null> {
  const out = token.wiki
    ? await replaceWiki(token.wiki, site, level, run, eol)
    : token.image
      ? await replaceImage(token.image, level, run)
      : null;
  if (out === null) return null;
  // A table row is one line, and a raw pipe would end the cell.
  // (One pass over each whitespace run: a pattern with `\s*` on both sides of the break is
  // quadratic on a long run of blanks.)
  return site.table
    ? out.replace(/\s+/g, (ws) => (ws.includes('\n') ? ' ' : ws)).replace(/\|/g, '\\|')
    : out;
}

async function replaceWiki(
  scanned: WikiRef,
  site: Site,
  level: Level,
  run: Run,
  eol: string
): Promise<string> {
  const { env } = run;
  const ref = scanned;
  if (!ref.embed)
    return escapeText(ref.alt ?? (ref.target || ref.fragment || ref.raw.slice(2, -2)));
  const name = ref.target || ref.fragment || ref.raw.slice(3, -2);
  if (ref.target === '') return noteEmbed(ref, level.notePath ?? '', true, site, level, run, eol);
  // A web address needs no vault: the exporters decide whether web images are shown.
  if (isWebImage(ref.target)) return webImage(ref);
  if (env.unavailable) return escapeText(env.label('unavailable', name));
  const resolved = await env.resolve(ref.target, level.notePath, {
    note: ref.kind === 'note' || ref.kind === 'other',
  });
  if (!resolved) {
    return escapeText(env.label(ref.kind === 'note' ? 'note-missing' : 'missing', name));
  }
  switch (resolved.kind) {
    case 'image': {
      const alt = escapeAlt(ref.alt ?? baseName(resolved.path)) || baseName(resolved.path);
      return `![${alt}](${ATTACHMENT_SCHEME}${encodeLinkPath(resolved.path)}${sizeFragment(ref.size)})`;
    }
    case 'note':
      return noteEmbed(ref, resolved.path, false, site, level, run, eol);
    default: {
      const file = baseName(resolved.path);
      return `[${escapeText(env.label(resolved.kind, file))}](${linkTarget(run.hostPath, resolved.path)})`;
    }
  }
}

async function noteEmbed(
  ref: WikiRef,
  path: string,
  self: boolean,
  site: Site,
  level: Level,
  run: Run,
  eol: string
): Promise<string> {
  const { env } = run;
  const name = ref.target || ref.fragment || path;
  // Only a paragraph of its own can become a block quote without taking its neighbours with it.
  if (!site.alone) return escapeText(env.label('note', name));
  const entered = descend(level.chain, path, ref.fragment);
  if (!entered.ok || level.chain.depth + 1 > env.maxDepth) {
    return escapeText(env.label(entered.ok ? 'depth' : entered.reason, name));
  }
  if (run.expansions >= MAX_EXPANSIONS || run.chars >= MAX_EXPANDED_CHARS) {
    return escapeText(env.label('limit', name));
  }
  run.expansions++;
  // The host is never read from disk: its live text is what is being exported.
  const source = self
    ? level.source
    : path === run.hostPath
      ? run.rootText
      : await env.readNote(path);
  const selected = source === null ? null : selectNoteContent(source, ref.fragment);
  if (!selected) return escapeText(env.label('note-missing', name));
  run.chars += selected.markdown.length;
  const inner = await expand(
    {
      notePath: path,
      text: isolateNote(selected.markdown),
      source: source ?? '',
      chain: entered.chain,
    },
    run
  );
  const body = inner
    .replace(/\r\n/g, '\n')
    .replace(/^(?:[ \t]*\n)+/, '')
    .trimEnd()
    .split('\n');
  const quote = (line: string) => (line.trim() === '' ? '>' : `> ${line}`);
  const quoted = body.map((line, i) => {
    const q = quote(line);
    if (i === 0) return q;
    return `${site.prefix}${q}`;
  });
  // The prefix is copied onto every line, so it is output the exporters have to handle too.
  run.chars += site.prefix.length * (body.length - 1);
  return quoted.join(eol);
}

async function replaceImage(ref: MarkdownImageRef, level: Level, run: Run): Promise<string | null> {
  const { env } = run;
  // Only the size is taken out of the alt; the rest of the link is kept as written.
  const stripped = ref.raw.startsWith(`![${ref.alt}]`)
    ? `![${ref.altText}]${ref.raw.slice(ref.alt.length + 3)}`
    : null;
  if (stripped === null) return null;
  // A plain image is only rewritten when it resolves; the size is what made the others change.
  const unchanged = ref.size === null ? null : stripped;
  if (!isLocalTarget(ref.dest) || env.unavailable) return unchanged;
  const { path, literal } = splitLinkTarget(ref.dest);
  const opts = { note: false, markdown: true } as const;
  const resolved =
    (await env.resolve(path, level.notePath, opts)) ??
    (literal === path ? null : await env.resolve(literal, level.notePath, opts));
  if (!resolved) return unchanged;
  if (resolved.kind !== 'image') {
    const label = escapeText(env.label(resolved.kind, baseName(resolved.path)));
    return `[${label}](${linkTarget(run.hostPath, resolved.path)})`;
  }
  const alt = escapeAlt(ref.altText) || baseName(resolved.path);
  return `![${alt}](${ATTACHMENT_SCHEME}${encodeLinkPath(resolved.path)}${sizeFragment(ref.size)})`;
}
