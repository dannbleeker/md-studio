import type { RemarkPlugin } from '@milkdown/kit/transformer';
import { parseMathToken } from '@/domain/math';
import {
  hasPlaceholder,
  restorePlaceholders,
  splitPlaceholders,
  withMathPlaceholders,
} from '@/domain/mathPlaceholder';
import { EMBED_MDAST_TYPE } from './embedNode';

/**
 * Math in the visual pane. The Markdown is first given placeholders for its
 * math spans (see domain/mathPlaceholder), which keeps the parser away from
 * them; this step turns each placeholder into the same inline atom the
 * Obsidian embeds use, holding the span's exact source text as its `raw`.
 * That atom is written back byte for byte (see embedNode), so a visual edit
 * can never change a formula, and a document without math is never touched.
 *
 * Where an atom may not go (link text, a heading's id, anything that is not
 * plain text) the placeholder becomes the source text again.
 */

type MdNode = {
  type: string;
  value?: string;
  url?: string;
  title?: string | null;
  alt?: string | null;
  children?: MdNode[];
};

/** Where a token may become an atom: ordinary text, as for embeds. */
const TEXT_PARENTS = new Set(['paragraph', 'heading', 'tableCell', 'emphasis', 'strong', 'delete']);

const STRINGS = ['value', 'url', 'title', 'alt'] as const;

function walk(node: MdNode): void {
  for (const key of STRINGS) {
    const value = node[key];
    if (typeof value === 'string' && hasPlaceholder(value) && node.type !== 'text')
      node[key] = restorePlaceholders(value);
  }
  const children = node.children;
  if (!children) return;
  const inText = TEXT_PARENTS.has(node.type);
  const out: MdNode[] = [];
  for (const child of children) {
    if (child.type !== 'text' || typeof child.value !== 'string' || !hasPlaceholder(child.value)) {
      walk(child);
      out.push(child);
      continue;
    }
    for (const piece of splitPlaceholders(child.value)) {
      if ('text' in piece) out.push({ type: 'text', value: piece.text });
      else if (inText && parseMathToken(piece.math))
        out.push({ type: EMBED_MDAST_TYPE, value: piece.math });
      else out.push({ type: 'text', value: piece.math });
    }
  }
  node.children = out;
}

export const remarkMath: RemarkPlugin = {
  plugin: () => (tree) => {
    walk(tree as unknown as MdNode);
  },
  options: {},
};

/** A parser that sees math as placeholders. The Markdown it is given is unchanged without math. */
export const parseWithMath =
  <T>(parse: (markdown: string) => T) =>
  (markdown: string): T =>
    parse(withMathPlaceholders(markdown));
