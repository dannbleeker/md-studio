import type { Node as PmNode } from '@milkdown/kit/prose/model';
import { Decoration } from '@milkdown/kit/prose/view';
import { MAX_DIAGRAM_CHARS } from '@/services/mermaid';
import { diagramElement, pageIsDark } from './diagramBox';

function hash(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

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
        key: `diagram-${hash(source)}-${pageIsDark() ? 'd' : 'l'}`,
        ignoreSelection: true,
      })
    );
    return false;
  });
  return out;
}
