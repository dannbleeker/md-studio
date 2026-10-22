import { parseWikiRef } from './embeds';
import { extOf } from './vaultIndex';

export type LinkTarget =
  | { kind: 'external'; url: string }
  | { kind: 'anchor'; slug: string }
  /** Another Markdown note, by the path or name written in the link. */
  | { kind: 'note'; path: string; fragment: string | null; markdown: boolean }
  | { kind: 'none' };

const EXTERNAL = /^(https?:|mailto:|tel:)/i;
const SCHEME = /^[a-z][a-z0-9+.-]*:/i;
const NOTE_EXTENSIONS: ReadonlySet<string> = new Set(['md', 'markdown', 'mdown', 'mkd']);

const decode = (s: string): string => {
  try {
    return decodeURIComponent(s);
  } catch {
    // keep the raw text: a stray % is still a valid character in a name
    return s;
  }
};

/**
 * What following a link in the visual pane should do. Absolute web, mail
 * and phone links leave the app, `#heading` links scroll within the
 * document, and a relative path to a Markdown note opens that note.
 * Anything else (other files, `javascript:`, `data:`) does nothing: the
 * rest must never run.
 */
export function linkTarget(href: string): LinkTarget {
  const trimmed = href.trim();
  if (EXTERNAL.test(trimmed)) return { kind: 'external', url: trimmed };
  if (trimmed.startsWith('#')) {
    return trimmed.length > 1
      ? { kind: 'anchor', slug: decode(trimmed.slice(1)) }
      : { kind: 'none' };
  }
  if (SCHEME.test(trimmed) || trimmed.startsWith('//') || trimmed === '') return { kind: 'none' };
  const hash = trimmed.indexOf('#');
  const withoutHash = hash < 0 ? trimmed : trimmed.slice(0, hash);
  const query = withoutHash.indexOf('?');
  const path = decode(query < 0 ? withoutHash : withoutHash.slice(0, query)).replace(/^<|>$/g, '');
  if (path === '' || !NOTE_EXTENSIONS.has(extOf(path))) return { kind: 'none' };
  const fragment = hash < 0 || hash === trimmed.length - 1 ? null : decode(trimmed.slice(hash + 1));
  return { kind: 'note', path, fragment, markdown: true };
}

/** What following a plain `[[wikilink]]` should do (its raw token text). */
export function wikilinkTarget(raw: string): LinkTarget {
  const ref = parseWikiRef(raw);
  if (!ref || ref.embed) return { kind: 'none' };
  if (ref.target === '')
    return ref.fragment ? { kind: 'anchor', slug: headingSlug(ref.fragment) } : { kind: 'none' };
  return { kind: 'note', path: ref.target, fragment: ref.fragment, markdown: false };
}

/** GitHub-style heading slug: the form `[text](#slug)` links are written in. */
export function headingSlug(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s/g, '-');
}

/**
 * A Markdown link to a section, to paste into another note:
 * `[Heading](My%20note.md#heading)`, or just `#heading` for a document that
 * is not a Markdown file yet.
 */
export function headingLink(fileName: string, heading: string): string {
  const slug = headingSlug(heading);
  const file = /\.(?:md|markdown|mdown|mkd)$/i.test(fileName)
    ? encodeURIComponent(fileName).replace(/[()]/g, (c) => (c === '(' ? '%28' : '%29'))
    : '';
  const text = heading.replace(/[[\]\\]/g, '').trim() || slug;
  return `[${text}](${file}#${slug})`;
}
