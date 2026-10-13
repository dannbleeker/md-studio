/**
 * Markdown-image and link helpers for the Obsidian embed support. Kept apart
 * from the core scanner in embeds.ts so the eager bundle does not carry it.
 */

import { codeRanges, inCode } from './codeRegions';
import { type EmbedSize, formatSize, parseAltSize } from './embeds';
import { frontMatterEnd } from './frontMatter';
import { isRelativeUrl } from './imagePaths';

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
// The span cap alone still lets every start rescan up to 2048 characters of destination or
// title, so a long line of `![a](` cost 2048 times its length. A line also gets a total budget
// for those scans; once it is spent the rest of that line is left alone. Short lines never
// reach it.
const BUDGET_PER_CHAR = 16;
const MIN_BUDGET = 8192;

/** Characters one line may still be scanned for. */
interface Budget {
  left: number;
}

/** The end of a scan from `from`: the span cap, the line and what is left of the budget. */
function scanLimit(line: string, from: number, budget: Budget): number {
  return Math.min(line.length, from + MAX_SPAN, from + budget.left);
}

/** Charge the characters a scan from `from` covered up to `to`. */
function spend(budget: Budget, from: number, to: number): void {
  budget.left -= Math.max(1, to - from);
}

/**
 * For every `[` that follows a `!`, the index of its balanced `]` (a backslash escapes the next
 * character); `[` without a partner is left out. One pass with a stack, so a line of unclosed
 * `![` costs its length and not its length times the scan cap.
 */
function altCloses(line: string): Map<number, number> {
  const closes = new Map<number, number>();
  const open: number[] = [];
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '\\') i++;
    else if (ch === '[') open.push(i);
    else if (ch === ']') {
      const start = open.pop();
      if (start !== undefined && line[start - 1] === '!') closes.set(start, i);
    }
  }
  return closes;
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
  from: number,
  budget: Budget
): { dest: string; angle: boolean; next: number } | null {
  const limit = scanLimit(line, from, budget);
  let i = from;
  try {
    if (line[from] === '<') {
      for (i = from + 1; i < limit; i++) {
        const ch = line[i];
        if (ch === '\\') i++;
        else if (ch === '<') return null;
        else if (ch === '>') return { dest: line.slice(from + 1, i), angle: true, next: i + 1 };
      }
      return null;
    }
    let depth = 0;
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
  } finally {
    spend(budget, from, i);
  }
}

function readTitle(
  line: string,
  from: number,
  budget: Budget
): { title: string; next: number } | null {
  const open = line[from];
  const close = open === '(' ? ')' : open;
  if (open !== '"' && open !== "'" && open !== '(') return null;
  const limit = scanLimit(line, from, budget);
  let i = from + 1;
  try {
    for (; i < limit; i++) {
      const ch = line[i];
      if (ch === '\\') i++;
      else if (ch === close) return { title: line.slice(from + 1, i), next: i + 1 };
    }
    return null;
  } finally {
    spend(budget, from, i);
  }
}

/** Parses `![alt](dest "title")` starting at the `!` at `at`; returns the end offset in the line. */
function parseImage(
  line: string,
  at: number,
  closes: ReadonlyMap<number, number>,
  budget: Budget
): (Omit<MarkdownImageRef, 'start' | 'end' | 'raw'> & { next: number }) | null {
  const close = closes.get(at + 1) ?? -1;
  // Nothing past the span cap counts, as before.
  if (close < 0 || close >= at + 2 + MAX_SPAN || line[close + 1] !== '(') return null;
  const destStart = skipBlanks(line, close + 2);
  const dest = readDestination(line, destStart, budget);
  if (!dest) return null;
  let i = skipBlanks(line, dest.next);
  let title: string | null = null;
  if (i > dest.next) {
    const read = readTitle(line, i, budget);
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

export function findMarkdownImages(
  text: string,
  opts: { code?: 'skip' | 'ignore' } = {}
): MarkdownImageRef[] {
  if (!text.includes('![')) return [];
  const skipCode = (opts.code ?? 'skip') === 'skip';
  const fmEnd = skipCode ? frontMatterEnd(text) : -1;
  const out: MarkdownImageRef[] = [];
  for (let pos = 0; pos <= text.length; ) {
    const nl = text.indexOf('\n', pos);
    const lineEnd = nl < 0 ? text.length : nl;
    const lineStart = pos;
    pos = lineEnd + 1;
    if (lineStart <= fmEnd) continue;
    const line = text.slice(
      lineStart,
      text[lineEnd - 1] === '\r' && lineEnd > lineStart ? lineEnd - 1 : lineEnd
    );
    if (!line.includes('![')) continue;
    const budget: Budget = { left: Math.max(MIN_BUDGET, line.length * BUDGET_PER_CHAR) };
    const closes = altCloses(line);
    for (let at = line.indexOf('!['); at >= 0; at = line.indexOf('![', at + 1)) {
      if (budget.left <= 0) break;
      if (line[at + 2] === '[' || escaped(line, at)) continue;
      const parsed = parseImage(line, at, closes, budget);
      if (!parsed) continue;
      const { next, ...rest } = parsed;
      out.push({
        ...rest,
        start: lineStart + at,
        end: lineStart + next,
        raw: line.slice(at, next),
      });
      at = next - 1;
    }
  }
  if (!skipCode || out.length === 0) return out;
  const code = codeRanges(text, fmEnd < 0 ? 0 : fmEnd + 1);
  return out.filter((ref) => !inCode(code, ref.start));
}

/**
 * Whether a destination names a file next to the note or in the vault. Only
 * what the image view and the resolver can serve counts: a root-absolute
 * path, a backslash or UNC form, an anchor and an empty destination are not
 * files they would ever load, so choosing a folder cannot make them show.
 */
export function isLocalTarget(dest: string): boolean {
  let s = dest.trim();
  if (s.startsWith('<') && s.endsWith('>')) s = s.slice(1, -1).trim();
  return isRelativeUrl(s);
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
