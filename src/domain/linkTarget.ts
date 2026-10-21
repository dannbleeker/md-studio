export type LinkTarget =
  | { kind: 'external'; url: string }
  | { kind: 'anchor'; slug: string }
  | { kind: 'none' };

const EXTERNAL = /^(https?:|mailto:|tel:)/i;

/**
 * What following a link in the visual pane should do. Only absolute web,
 * mail and phone links leave the app, and `#heading` links scroll within the
 * document. Anything else (relative paths, `javascript:`, `data:`) does
 * nothing: a relative path has no meaning in a local-first editor, and the
 * rest must never run.
 */
export function linkTarget(href: string): LinkTarget {
  const trimmed = href.trim();
  if (EXTERNAL.test(trimmed)) return { kind: 'external', url: trimmed };
  if (trimmed.startsWith('#') && trimmed.length > 1) {
    let slug = trimmed.slice(1);
    try {
      slug = decodeURIComponent(slug);
    } catch {
      // keep the raw text: a stray % is still a valid heading character
    }
    return { kind: 'anchor', slug };
  }
  return { kind: 'none' };
}

/** GitHub-style heading slug: the form `[text](#slug)` links are written in. */
export function headingSlug(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s/g, '-');
}
