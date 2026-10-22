import { findMath } from './math';
import { findMermaidBlocks } from './mermaidBlocks';

/**
 * What an export has to draw: the math spans and Mermaid blocks of a
 * document, each replaced in the Markdown by an image link
 * (`![x^2](typeset:3)`) that the exporter fills with a picture, or with
 * MathML for a web page. The rest of the text is left exactly as it is.
 */
export type TypesetItem =
  | { id: string; kind: 'math'; tex: string; display: boolean; raw: string }
  | { id: string; kind: 'diagram'; source: string; raw: string };

export const TYPESET_SCHEME = 'typeset:';

export type TypesetWants = {
  inlineMath: boolean;
  displayMath: boolean;
  diagrams: boolean;
};

/** The words that stand in for the picture where it cannot be shown: the formula, or "diagram". */
function altText(text: string): string {
  return text
    .replace(/[[\]\\\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

export function planTypeset(
  markdown: string,
  wants: TypesetWants,
  limit = 60
): { markdown: string; items: TypesetItem[] } {
  type Without<T> = T extends unknown ? Omit<T, 'id'> : never;
  type Found = { start: number; end: number; item: Without<TypesetItem> };
  const found: Found[] = [];
  if (wants.diagrams) {
    for (const block of findMermaidBlocks(markdown)) {
      if (block.source.trim() === '') continue;
      found.push({
        start: block.start,
        end: block.end,
        item: {
          kind: 'diagram',
          source: block.source,
          raw: markdown.slice(block.start, block.end),
        },
      });
    }
  }
  if (wants.inlineMath || wants.displayMath) {
    for (const span of findMath(markdown)) {
      if (span.display ? !wants.displayMath : !wants.inlineMath) continue;
      found.push({
        start: span.start,
        end: span.end,
        item: { kind: 'math', tex: span.tex, display: span.display, raw: span.raw },
      });
    }
  }
  if (found.length === 0) return { markdown, items: [] };
  found.sort((a, b) => a.start - b.start);
  let out = '';
  let from = 0;
  const items: TypesetItem[] = [];
  for (const f of found) {
    // Spans never overlap (math skips code), but a fence found twice must not be replaced twice.
    if (f.start < from || items.length >= limit) continue;
    const id = `${TYPESET_SCHEME}${items.length + 1}`;
    const item = { ...f.item, id } as TypesetItem;
    items.push(item);
    out += markdown.slice(from, f.start);
    const alt = item.kind === 'math' ? altText(item.tex) : 'Diagram';
    // A diagram stands on its own paragraph; a formula stays where it was written.
    out += `![${alt}](${id})`;
    from = f.end;
  }
  return { markdown: out + markdown.slice(from), items };
}
