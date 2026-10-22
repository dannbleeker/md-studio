import { codeRanges, inCode } from './codeRegions';
import { findWikiRefs } from './embeds';
import { frontMatterEnd } from './frontMatter';
import { linkTarget } from './linkTarget';

/**
 * The notes a note links to, as written, so "linked from" can ask which
 * notes link to this one. Wikilinks and embeds of notes (`[[Note]]`,
 * `![[Note#Heading]]`) and Markdown links to a Markdown file
 * (`[text](Other.md#part)`). Code, and front matter, hold no links.
 */
export type NoteLink = { target: string; markdown: boolean };

const MAX_DESTINATION = 500;

/** The destination of the link whose `(` is at `open`, and where it ends; null when it is not a plain one. */
function destination(text: string, open: number): { dest: string; end: number } | null {
  let at = open + 1;
  if (text[at] === '<') {
    const close = text.indexOf('>', at);
    if (close < 0 || close - at > MAX_DESTINATION || text.slice(at, close).includes('\n'))
      return null;
    return { dest: text.slice(at + 1, close), end: close + 1 };
  }
  const start = at;
  let depth = 0;
  for (; at < text.length && at - start <= MAX_DESTINATION; at++) {
    const ch = text[at];
    if (ch === '(') depth++;
    else if (ch === ')') {
      if (depth === 0) return { dest: text.slice(start, at), end: at + 1 };
      depth--;
    } else if (ch === ' ' || ch === '\n' || ch === '\t') {
      // A title may follow the destination: `(page.md "Title")`.
      return { dest: text.slice(start, at), end: at };
    }
  }
  return null;
}

export function extractNoteLinks(markdown: string): NoteLink[] {
  const links: NoteLink[] = [];
  for (const ref of findWikiRefs(markdown, { code: 'skip', frontMatter: 'skip' })) {
    if (ref.kind === 'note' && ref.target !== '')
      links.push({ target: ref.target, markdown: false });
  }
  if (!markdown.includes('](')) return links;
  const fm = frontMatterEnd(markdown);
  const code = codeRanges(markdown, fm < 0 ? 0 : fm + 1);
  for (let at = markdown.indexOf(']('); at >= 0; at = markdown.indexOf('](', at + 2)) {
    if (at <= fm || inCode(code, at)) continue;
    const found = destination(markdown, at + 1);
    if (!found) continue;
    const target = linkTarget(found.dest);
    if (target.kind === 'note') links.push({ target: target.path, markdown: true });
  }
  return links;
}
