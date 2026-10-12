/**
 * Markdown-image and link helpers for the Obsidian embed support. Kept apart
 * from the core scanner in embeds.ts so the eager bundle does not carry it.
 */

import { type EmbedSize, formatSize, parseAltSize } from './embeds';
import { closesFence, openFence } from './fences';
import { codeLines } from './footnotes';
import { frontMatterEnd } from './frontMatter';

export interface MarkdownImageRef {
  start: number;
  end: number;
  raw: string;
  /** As written, including any `|300`; altText is without the size. */
  alt: string;
  altText: string;
  size: EmbedSize | null;
  /** The destination with `<>` removed, not decoded. */
  dest: string;
  angle: boolean;
  title: string | null;
}

// Caps keep a line full of unclosed `![` from rescanning to its end each time.
const MAX_SPAN = 2048;

/** The first index of `[`-balanced `]` from `from`, or -1. Backslash escapes the next character. */
function altEnd(line: string, from: number): number {
  const limit = Math.min(line.length, from + MAX_SPAN);
  let depth = 0;
  for (let i = from; i < limit; i++) {
    const ch = line[i];
    if (ch === '\\') i++;
    else if (ch === '[') depth++;
    else if (ch === ']') {
      if (depth === 0) return i;
      depth--;
    }
  }
  return -1;
}

const BLANKS = /[ \t]*/y;

function skipBlanks(line: string, from: number): number {
  BLANKS.lastIndex = from;
  BLANKS.exec(line);
  return BLANKS.lastIndex;
}

/** Reads a destination at `from`: `<...>` (spaces allowed) or bare with balanced parentheses. */
function readDestination(
  line: string,
  from: number
): { dest: string; angle: boolean; next: number } | null {
  const limit = Math.min(line.length, from + MAX_SPAN);
  if (line[from] === '<') {
    for (let i = from + 1; i < limit; i++) {
      const ch = line[i];
      if (ch === '\\') i++;
      else if (ch === '<') return null;
      else if (ch === '>') return { dest: line.slice(from + 1, i), angle: true, next: i + 1 };
    }
    return null;
  }
  let depth = 0;
  let i = from;
  for (; i < limit; i++) {
    const ch = line[i];
    if (ch === '\\') i++;
    else if (ch === '(') depth++;
    else if (ch === ')') {
      if (depth === 0) break;
      depth--;
    } else if (ch === ' ' || ch === '\t') break;
  }
  if (i >= limit || depth !== 0) return null;
  return { dest: line.slice(from, i), angle: false, next: i };
}

function readTitle(line: string, from: number): { title: string; next: number } | null {
  const open = line[from];
  const close = open === '(' ? ')' : open;
  if (open !== '"' && open !== "'" && open !== '(') return null;
  const limit = Math.min(line.length, from + MAX_SPAN);
  for (let i = from + 1; i < limit; i++) {
    const ch = line[i];
    if (ch === '\\') i++;
    else if (ch === close) return { title: line.slice(from + 1, i), next: i + 1 };
  }
  return null;
}

/** Parses `![alt](dest "title")` starting at the `!` at `at`; returns the end offset in the line. */
function parseImage(
  line: string,
  at: number
): (Omit<MarkdownImageRef, 'start' | 'end' | 'raw'> & { next: number }) | null {
  const close = altEnd(line, at + 2);
  if (close < 0 || line[close + 1] !== '(') return null;
  const destStart = skipBlanks(line, close + 2);
  const dest = readDestination(line, destStart);
  if (!dest) return null;
  let i = skipBlanks(line, dest.next);
  let title: string | null = null;
  if (i > dest.next) {
    const read = readTitle(line, i);
    if (read) {
      title = read.title;
      i = skipBlanks(line, read.next);
    }
  }
  if (line[i] !== ')') return null;
  const alt = line.slice(at + 2, close);
  const { alt: altText, size } = parseAltSize(alt);
  return { alt, altText, size, dest: dest.dest, angle: dest.angle, title, next: i + 1 };
}

function escaped(line: string, at: number): boolean {
  let n = 0;
  while (line[at - n - 1] === '\\') n++;
  return n % 2 === 1;
}

/** Inline code spans: a backtick run closes at the next run of exactly its length. */
function codeSpans(line: string): [number, number][] {
  const runs = [...line.matchAll(/`+/g)].map((m) => ({ pos: m.index, len: m[0].length }));
  const spans: [number, number][] = [];
  const next = new Map<number, number>();
  const closer: number[] = [];
  // Backwards, so each run knows the next run of its own length in O(1).
  for (let i = runs.length - 1; i >= 0; i--) {
    const len = runs[i]?.len ?? 0;
    closer[i] = next.get(len) ?? -1;
    next.set(len, i);
  }
  for (let i = 0; i < runs.length; i++) {
    const open = runs[i];
    const c = closer[i] ?? -1;
    const end = runs[c];
    if (!open || !end) continue;
    spans.push([open.pos, end.pos + end.len]);
    i = c;
  }
  return spans;
}

export function findMarkdownImages(
  text: string,
  opts: { code?: 'skip' | 'ignore' } = {}
): MarkdownImageRef[] {
  if (!text.includes('![')) return [];
  const skipCode = (opts.code ?? 'skip') === 'skip';
  const fmEnd = skipCode ? frontMatterEnd(text) : -1;
  const lines = text.split('\n');
  const starts: number[] = [];
  let offset = 0;
  for (const [i, l] of lines.entries()) {
    starts.push(offset);
    offset += l.length + 1;
    lines[i] = l.endsWith('\r') ? l.slice(0, -1) : l;
  }
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
  const out: MarkdownImageRef[] = [];
  lines.forEach((line, i) => {
    if (skip[i] || indented[i] || !line.includes('![')) return;
    const spans = skipCode ? codeSpans(line) : [];
    for (let at = line.indexOf('!['); at >= 0; at = line.indexOf('![', at + 1)) {
      if (line[at + 2] === '[' || escaped(line, at)) continue;
      if (spans.some(([s, e]) => at >= s && at < e)) continue;
      const parsed = parseImage(line, at);
      if (!parsed) continue;
      const { next, ...rest } = parsed;
      out.push({
        ...rest,
        start: (starts[i] ?? 0) + at,
        end: (starts[i] ?? 0) + next,
        raw: line.slice(at, next),
      });
      at = next - 1;
    }
  });
  return out;
}

export function isLocalTarget(dest: string): boolean {
  let s = dest.trim();
  if (s.startsWith('<') && s.endsWith('>')) s = s.slice(1, -1).trim();
  return !(s.startsWith('//') || /^[a-z][a-z0-9+.-]*:/i.test(s));
}

export function formatWikiEmbed(p: {
  target: string;
  fragment?: string | null;
  alt?: string | null;
  size?: EmbedSize | null;
  inTable?: boolean;
}): string {
  let body = p.target;
  if (p.fragment) body += `#${p.fragment}`;
  if (p.alt) body += `|${p.alt}`;
  if (p.size) body += `|${formatSize(p.size)}`;
  return `![[${p.inTable ? body.replaceAll('|', '\\|') : body}]]`;
}
