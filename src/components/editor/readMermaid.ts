import type { Node as PmNode } from '@milkdown/kit/prose/model';
import { Decoration } from '@milkdown/kit/prose/view';
import { textHash } from '@/domain/textHash';
import { MAX_DIAGRAM_CHARS } from '@/services/mermaid';
import { diagramElement, pageIsDark } from './diagramBox';

/**
 * Read view draws a fenced ```mermaid block as a diagram, above the code
 * block, which stays in the document (and is hidden only once the drawing
 * is there). Other views show the code as written.
 */
export function mermaidDecorations(doc: PmNode): Decoration[] {
  const out: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== 'code_block') return true;
    const language = String(node.attrs.language ?? '')
      .trim()
      .toLowerCase();
    const source = node.textContent;
    if (language !== 'mermaid' || source.trim() === '' || source.length > MAX_DIAGRAM_CHARS)
      return false;
    out.push(
      Decoration.widget(pos, () => diagramElement(source), {
        side: -1,
        key: `diagram-${textHash(source)}-${pageIsDark() ? 'd' : 'l'}`,
        ignoreSelection: true,
      })
    );
    return false;
  });
  return out;
}

/**
 * A diagram is drawn for the page's colours (its key holds them), but
 * decorations are rebuilt only on an editor update: `redraw` runs when the
 * theme, the reading theme or the system colour scheme changes. It watches
 * the attributes, not the settings, as they are applied after the settings
 * change and pageIsDark reads them.
 */
export function onPageThemeChange(redraw: () => void): () => void {
  const observer = new MutationObserver(redraw);
  observer.observe(document.documentElement, {
    attributes: true,
    subtree: true,
    attributeFilter: ['data-theme', 'data-read-theme'],
  });
  const scheme = window.matchMedia?.('(prefers-color-scheme: dark)');
  scheme?.addEventListener('change', redraw);
  return () => {
    observer.disconnect();
    scheme?.removeEventListener('change', redraw);
  };
}
