/**
 * Obsidian embeds for export. The exporters (HTML, Word, PDF, text) know
 * nothing about `![[...]]`, so before they run the text is rewritten on a
 * copy: images become `attachment:` links the image loader can read from the
 * vault, other files become labelled links, embedded notes become block
 * quotes, and anything unresolved becomes plain text. Pure: the vault is
 * reached through an injected environment, and labels are injected too, so
 * nothing here touches the DOM, services or translations.
 */

import { findMarkdownImages, isLocalTarget, type MarkdownImageRef } from './embedLinks';
import { type EmbedKind, findWikiRefs, splitLinkTarget, type WikiRef } from './embeds';
import { closesFence, openFence } from './fences';
import { frontMatterEnd } from './frontMatter';
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
 * either cap a note embed collapses to the labelled form.
 */
export const MAX_EXPANSIONS = 500;
export const MAX_EXPANDED_CHARS = 5_000_000;

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
const DELIMITER = /^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?\s*$/;

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

/** A line with its quote markers and list markers taken off. */
function stripContainers(line: string): { rest: string; contained: boolean } {
  let rest = line;
  let contained = false;
  for (;;) {
    const m = QUOTE.exec(rest) ?? ITEM.exec(rest);
    if (!m) return { rest, contained };
    rest = rest.slice(m[0].length);
    contained = true;
  }
}

/**
 * Lines that sit inside a fenced block, however deeply it is quoted or
 * listed. findWikiRefs only sees fences at the top level, so a token inside
 * a fence inside a quote or list must be filtered out here.
 */
function fencedLines(lines: readonly string[]): boolean[] {
  const mask: boolean[] = [];
  let fence: string | null = null;
  let listed = false;
  for (const line of lines) {
    const { rest, contained } = stripContainers(line);
    const blank = line.trim() === '';
    listed = contained || (listed && (blank || /^\s/.test(line)));
    // Inside a list item the fence may be indented past the three spaces a top-level one allows.
    const candidate = listed ? rest.trimStart() : rest;
    if (fence) {
      mask.push(true);
      if (closesFence(candidate, fence)) fence = null;
    } else {
      fence = openFence(candidate);
      mask.push(fence !== null);
    }
  }
  return mask;
}

/** The text before an embed that belongs to its container, with list markers as spaces. */
function containerPrefix(line: string): { prefix: string; item: boolean; odd: boolean } {
  let rest = line;
  let prefix = '';
  let item = false;
  for (;;) {
    const quote = QUOTE.exec(rest);
    const marker = quote ? null : ITEM.exec(rest);
    const indent = quote || marker ? null : /^ +/.exec(rest);
    const m = quote ?? marker ?? indent;
    if (!m) break;
    prefix += marker ? ' '.repeat(m[0].length) : m[0];
    if (marker) item = true;
    rest = rest.slice(m[0].length);
  }
  return { prefix, item, odd: /^[ >]*\t/.test(line) };
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

/** True when the line is a row of a GFM table: a run of pipe lines around it holds the delimiter row. */
function inTable(lines: readonly string[], index: number): boolean {
  const cell = (i: number) => stripContainers(lines[i] ?? '').rest;
  if (!cell(index).includes('|')) return false;
  for (const step of [-1, 1]) {
    for (let i = index; i >= 0 && i < lines.length && cell(i).includes('|'); i += step) {
      if (DELIMITER.test(cell(i))) return true;
    }
  }
  return false;
}

function startsItem(line: string): boolean {
  let rest = line;
  for (let m = QUOTE.exec(rest); m; m = QUOTE.exec(rest)) rest = rest.slice(m[0].length);
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

function findTokens(text: string, lines: Lines, fenced: readonly boolean[]): Token[] {
  const fm = frontMatterEnd(text);
  const usable = (start: number) => start > fm && !fenced[lineIndexAt(lines.starts, start)];
  const tokens: Token[] = [
    ...findWikiRefs(text)
      .filter((ref) => usable(ref.start))
      .map((wiki) => ({ start: wiki.start, end: wiki.end, wiki })),
    ...findMarkdownImages(text)
      .filter((image) => image.size !== null && usable(image.start))
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
const escapeText = (s: string): string => s.replace(/\s+/g, ' ').replace(/[\\`*_[\]<>]/g, '\\$&');

const escapeAlt = (s: string): string =>
  s
    .replace(/\s+/g, ' ')
    .replace(/[\\[\]]/g, ' ')
    .trim();

const sizeFragment = (size: { width: number; height: number | null } | null): string =>
  size ? `#size=${size.width}${size.height === null ? '' : `x${size.height}`}` : '';

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
  const fenced = fencedLines(lines.text);
  const tokens = findTokens(text, lines, fenced);
  if (tokens.length === 0) return text;
  const fm = frontMatterEnd(text);
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const pieces: string[] = [];
  let cursor = 0;
  for (const token of tokens) {
    const index = lineIndexAt(lines.starts, token.start);
    const line = lines.text[index] ?? '';
    const lineStart = lines.starts[index] ?? 0;
    const { prefix, item, odd } = containerPrefix(line);
    const table = inTable(lines.text, index);
    const fills =
      token.start - lineStart === prefix.length &&
      line.slice(token.end - lineStart).trim() === '' &&
      token.end - lineStart <= line.length;
    const nextRest = lines.text[index + 1];
    const before = index === 0 ? undefined : lines.text[index - 1];
    const closesFrontMatter = fm >= 0 && (lines.starts[index - 1] ?? 0) <= fm && lineStart > fm;
    const startsBlock =
      index === 0 ||
      isBare(before) ||
      item ||
      endsOwnBlock(before, fenced[index - 1] === true, closesFrontMatter);
    const endsBlock =
      isBare(nextRest) ||
      (nextRest !== undefined && startsItem(nextRest)) ||
      opensOwnBlock(nextRest, fenced[index + 1] === true);
    const site: Site = {
      prefix,
      alone: fills && startsBlock && endsBlock && !table && !odd,
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
  return site.table ? out.replace(/\s*\r?\n\s*/g, ' ').replace(/\|/g, '\\|') : out;
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
  if (env.unavailable) return escapeText(env.label('unavailable', name));
  const resolved = await env.resolve(ref.target, level.notePath, {
    note: ref.kind === 'note' || ref.kind === 'other',
  });
  if (!resolved) return escapeText(env.label('missing', name));
  switch (resolved.kind) {
    case 'image': {
      const alt = escapeAlt(ref.alt ?? baseName(resolved.path)) || baseName(resolved.path);
      return `![${alt}](${ATTACHMENT_SCHEME}${encodeLinkPath(resolved.path)}${sizeFragment(ref.size)})`;
    }
    case 'note':
      return noteEmbed(ref, resolved.path, false, site, level, run, eol);
    default: {
      const file = baseName(resolved.path);
      const href = encodeLinkPath(relativePath(dirOf(run.hostPath ?? ''), resolved.path));
      return `[${escapeText(env.label(resolved.kind, file))}](${href})`;
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
    return escapeText(env.label('depth', name));
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
    { notePath: path, text: selected.markdown, source: source ?? '', chain: entered.chain },
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
  return quoted.join(eol);
}

async function replaceImage(ref: MarkdownImageRef, level: Level, run: Run): Promise<string | null> {
  const { env } = run;
  // Only the size is taken out of the alt; the rest of the link is kept as written.
  const stripped = ref.raw.startsWith(`![${ref.alt}]`)
    ? `![${ref.altText}]${ref.raw.slice(ref.alt.length + 3)}`
    : null;
  if (stripped === null) return null;
  if (!isLocalTarget(ref.dest) || env.unavailable) return stripped;
  const { path, literal } = splitLinkTarget(ref.dest);
  const opts = { note: false, markdown: true } as const;
  const resolved =
    (await env.resolve(path, level.notePath, opts)) ??
    (literal === path ? null : await env.resolve(literal, level.notePath, opts));
  if (!resolved) return stripped;
  if (resolved.kind !== 'image') {
    const href = encodeLinkPath(relativePath(dirOf(run.hostPath ?? ''), resolved.path));
    return `[${escapeText(env.label(resolved.kind, baseName(resolved.path)))}](${href})`;
  }
  const alt = escapeAlt(ref.altText) || baseName(resolved.path);
  return `![${alt}](${ATTACHMENT_SCHEME}${encodeLinkPath(resolved.path)}${sizeFragment(ref.size)})`;
}
