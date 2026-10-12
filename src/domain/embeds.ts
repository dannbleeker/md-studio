/**
 * Obsidian-style wiki tokens: `[[Note]]`, `![[image.png|300]]`. This is the
 * core scanner only (it lands in the eager bundle), so it keeps to string
 * work and imports nothing but the front matter and fence helpers. Targets
 * are not resolved here: that is the vault index's job.
 */

import { closesFence, openFence } from './fences';
import { codeLines } from './footnotes';
import { frontMatterEnd } from './frontMatter';

export const EMBED_NODE_NAME = 'embed';

export type EmbedKind = 'image' | 'pdf' | 'audio' | 'video' | 'note' | 'other';

/** Kinds written with a bang (`![..](..)`); notes and other files get a plain link. */
export const MEDIA_KINDS: ReadonlySet<EmbedKind> = new Set<EmbedKind>([
  'image',
  'pdf',
  'audio',
  'video',
]);

export interface EmbedSize {
  width: number;
  /** null = auto. */
  height: number | null;
}

export interface WikiRef {
  embed: boolean;
  start: number;
  end: number;
  raw: string;
  target: string;
  fragment: string | null;
  options: string[];
  kind: EmbedKind;
  size: EmbedSize | null;
  alt: string | null;
  pdf: { page: number | null; height: number | null } | null;
}

const IMAGE = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif'];
const AUDIO = ['mp3', 'wav', 'm4a', 'ogg', 'oga', 'opus', 'aac', '3gp', 'flac'];
const VIDEO = ['mp4', 'webm', 'ogv', 'mov', 'mkv'];

/** Longest token body we accept; keeps a stray `[[` from scanning a whole line. */
const MAX_BODY = 1024;
const MAX_DIMENSION = 10000;
const SIZE = /^(\d{1,5})(?:x(\d{1,5}))?$/;

function kindOfExtension(ext: string): EmbedKind {
  if (IMAGE.includes(ext)) return 'image';
  if (ext === 'pdf') return 'pdf';
  if (AUDIO.includes(ext)) return 'audio';
  if (VIDEO.includes(ext)) return 'video';
  if (ext === 'md' || ext === '') return 'note';
  return 'other';
}

export function classifyTarget(target: string): EmbedKind {
  const name = target.slice(target.lastIndexOf('/') + 1);
  const dot = name.lastIndexOf('.');
  return kindOfExtension(dot < 0 ? '' : name.slice(dot + 1).toLowerCase());
}

export function isAttachmentExtension(ext: string): boolean {
  const kind = kindOfExtension(ext);
  return kind === 'image' || kind === 'pdf' || kind === 'audio' || kind === 'video';
}

function parseSize(text: string): EmbedSize | null {
  const m = SIZE.exec(text);
  if (!m?.[1]) return null;
  const width = Number(m[1]);
  const height = m[2] === undefined ? null : Number(m[2]);
  if (width < 1 || width > MAX_DIMENSION) return null;
  if (height !== null && (height < 1 || height > MAX_DIMENSION)) return null;
  return { width, height };
}

export function formatSize(size: EmbedSize): string {
  return size.height === null ? `${size.width}` : `${size.width}x${size.height}`;
}

export function parseAltSize(alt: string): { alt: string; size: EmbedSize | null } {
  const bar = alt.lastIndexOf('|');
  if (bar < 0) return { alt, size: null };
  const size = parseSize(alt.slice(bar + 1).trim());
  return size ? { alt: alt.slice(0, bar).trimEnd(), size } : { alt, size: null };
}

/**
 * Splits on pipes. A backslash-pipe is how a table cell spells the separator,
 * so it splits too; raw keeps the backslash, only option parsing sees plain pipes.
 */
function splitOptions(body: string): string[] {
  return body.split(/\\?\|/);
}

function parsePdfFragment(fragment: string | null): { page: number | null; height: number | null } {
  const out: { page: number | null; height: number | null } = { page: null, height: null };
  for (const part of (fragment ?? '').split('&')) {
    const [key, value] = part.split('=');
    if (value === undefined || !/^\d{1,5}$/.test(value) || Number(value) < 1) continue;
    if (key === 'page') out.page = Number(value);
    else if (key === 'height') out.height = Number(value);
  }
  return out;
}

function build(raw: string, embed: boolean, start: number, body: string): WikiRef | null {
  if (body.trim() === '' || body.length > MAX_BODY) return null;
  const [first = '', ...rest] = splitOptions(body);
  const hash = first.indexOf('#');
  const target = (hash < 0 ? first : first.slice(0, hash)).trim();
  const frag = hash < 0 ? '' : first.slice(hash + 1).trim();
  const fragment = frag === '' ? null : frag;
  const options = rest.map((o) => o.trim()).filter((o) => o !== '');
  const kind = classifyTarget(target);
  let size: EmbedSize | null = null;
  let altParts = options;
  if (embed && (kind === 'image' || kind === 'pdf' || kind === 'video')) {
    const at = options.findLastIndex((o) => parseSize(o) !== null);
    if (at >= 0) {
      size = parseSize(options[at] ?? '');
      altParts = options.filter((_, i) => i !== at);
    }
  }
  return {
    embed,
    start,
    end: start + raw.length,
    raw,
    target,
    fragment,
    options,
    kind,
    size,
    alt: altParts.length > 0 ? altParts.join('|') : null,
    pdf: kind === 'pdf' ? parsePdfFragment(fragment) : null,
  };
}

export function parseWikiRef(raw: string): WikiRef | null {
  const embed = raw.startsWith('![[');
  const open = embed ? 3 : 2;
  if (!embed && !raw.startsWith('[[')) return null;
  if (raw.length < open + 3 || !raw.endsWith(']]')) return null;
  const body = raw.slice(open, -2);
  return /[[\]\r\n]/.test(body) ? null : build(raw, embed, 0, body);
}

/** Index just past the `]]` closing a token whose body starts at `from`, or -1. */
function tokenEnd(line: string, from: number): number {
  const limit = Math.min(line.length, from + MAX_BODY + 2);
  for (let i = from; i < limit; i++) {
    const ch = line[i];
    if (ch === '[' || ch === '\r') return -1;
    if (ch === ']') return line[i + 1] === ']' ? i + 2 : -1;
  }
  return -1;
}

function escaped(line: string, at: number): boolean {
  let n = 0;
  while (at - n - 1 >= 0 && line[at - n - 1] === '\\') n++;
  return n % 2 === 1;
}

/**
 * Inline code spans on one line by the CommonMark rule: a backtick run of
 * length n closes at the next run of exactly n, otherwise it is literal.
 * Runs are bucketed by length so pairing stays linear on huge lines.
 */
function codeSpans(line: string): [number, number][] {
  if (!line.includes('`')) return [];
  const runs: { pos: number; len: number }[] = [];
  for (let i = 0; i < line.length; i++) {
    if (line[i] !== '`') continue;
    let j = i;
    while (line[j] === '`') j++;
    runs.push({ pos: i, len: j - i });
    i = j - 1;
  }
  const byLength = new Map<number, number[]>();
  runs.forEach((run, idx) => {
    const list = byLength.get(run.len);
    if (list) list.push(idx);
    else byLength.set(run.len, [idx]);
  });
  const spans: [number, number][] = [];
  for (let i = 0; i < runs.length; i++) {
    const open = runs[i];
    if (!open) continue;
    // A backslash makes the first backtick of an opener literal.
    const esc = escaped(line, open.pos);
    const n = open.len - (esc ? 1 : 0);
    if (n < 1) continue;
    const list = byLength.get(n) ?? [];
    let lo = 0;
    let hi = list.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if ((list[mid] ?? 0) > i) hi = mid;
      else lo = mid + 1;
    }
    const closeIdx = list[lo];
    const close = closeIdx === undefined ? undefined : runs[closeIdx];
    if (!close || closeIdx === undefined) continue;
    spans.push([open.pos + (esc ? 1 : 0), close.pos + close.len]);
    i = closeIdx;
  }
  return spans;
}

export function findWikiRefs(
  text: string,
  opts: { code?: 'skip' | 'ignore'; frontMatter?: 'skip' | 'ignore' } = {}
): WikiRef[] {
  if (!text.includes('[[')) return [];
  const skipCode = (opts.code ?? 'skip') === 'skip';
  const fmEnd = (opts.frontMatter ?? 'skip') === 'skip' ? frontMatterEnd(text) : -1;
  const lines: string[] = [];
  const starts: number[] = [];
  for (let pos = 0; pos <= text.length; ) {
    const nl = text.indexOf('\n', pos);
    const end = nl < 0 ? text.length : nl;
    starts.push(pos);
    lines.push(text.slice(pos, text[end - 1] === '\r' && end > pos ? end - 1 : end));
    pos = end + 1;
  }
  // Skipped lines are blanked for the indented-code pass, and a fence lookalike that
  // openFence rejected (inline code) is defused so footnotes.ts cannot open a fence on it.
  const skip = lines.map((_, i) => fmEnd >= 0 && (starts[i] ?? 0) <= fmEnd);
  if (skipCode) {
    let fence: string | null = null;
    lines.forEach((line, i) => {
      if (skip[i]) return;
      if (fence) {
        skip[i] = true;
        if (closesFence(line, fence)) fence = null;
      } else {
        fence = openFence(line);
        if (fence) skip[i] = true;
      }
    });
  }
  const indented = skipCode
    ? codeLines(lines.map((l, i) => (skip[i] ? '' : l.replace(/^( *)([`~])/, '$1x$2'))))
    : [];
  const refs: WikiRef[] = [];
  lines.forEach((line, i) => {
    if (skip[i] || indented[i] || !line.includes('[[')) return;
    const spans = skipCode ? codeSpans(line) : [];
    let span = 0;
    for (let at = line.indexOf('[['); at >= 0; at = line.indexOf('[[', at + 1)) {
      while (spans[span] && (spans[span]?.[1] ?? 0) <= at) span++;
      const current = spans[span];
      if (current && current[0] <= at) continue;
      if (escaped(line, at)) continue;
      const embed = line[at - 1] === '!';
      if (embed && escaped(line, at - 1)) continue;
      const end = tokenEnd(line, at + 2);
      if (end < 0) continue;
      const begin = embed ? at - 1 : at;
      const raw = line.slice(begin, end);
      const ref = build(raw, embed, (starts[i] ?? 0) + begin, line.slice(at + 2, end - 2));
      if (!ref) continue;
      refs.push(ref);
      at = end - 1;
    }
  });
  return refs;
}

const UNESCAPE = /\\([!-/:-@[-`{-~])|&(?:(amp|lt|gt|quot)|#(\d{1,7})|#[xX]([0-9a-fA-F]{1,6}));/g;
const NAMED: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"' };

function codePoint(n: number, whole: string): string {
  if (n === 0) return '�';
  return n > 0x10ffff ? whole : String.fromCodePoint(n);
}

export function unescapeMarkdownText(raw: string): string {
  if (!raw.includes('\\') && !raw.includes('&')) return raw;
  return raw.replace(UNESCAPE, (whole, punct, named, dec, hex) => {
    if (typeof punct === 'string') return punct;
    if (typeof named === 'string') return NAMED[named] ?? whole;
    if (typeof dec === 'string') return codePoint(Number(dec), whole);
    return codePoint(Number.parseInt(String(hex), 16), whole);
  });
}

// Lives here, not in embedLinks, so the eager image view can decide without loading it.
function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

export function splitLinkTarget(dest: string): {
  path: string;
  literal: string;
  fragment: string | null;
} {
  let s = dest.trim();
  if (s.startsWith('<') && s.endsWith('>')) s = s.slice(1, -1);
  const hash = s.indexOf('#');
  const frag = hash < 0 ? '' : s.slice(hash + 1);
  const beforeHash = hash < 0 ? s : s.slice(0, hash);
  const query = beforeHash.indexOf('?');
  const literal = query < 0 ? beforeHash : beforeHash.slice(0, query);
  return {
    path: literal.split('/').map(decodeSegment).join('/'),
    literal,
    fragment: frag === '' ? null : frag,
  };
}

/**
 * The wiki embed token that draws a Markdown image destination as a file embed.
 * Null when the path cannot be written as a token (empty, or holding `[`, `]`,
 * `|`, `#` or a line break once decoded), so the caller keeps its <img>.
 */
export function embedTokenFor(dest: string): string | null {
  const { path } = splitLinkTarget(dest);
  return path === '' || /[[\]|#\r\n]/.test(path) ? null : `![[${path}]]`;
}
