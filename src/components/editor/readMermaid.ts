import type { Node as PmNode } from '@milkdown/kit/prose/model';
import { Decoration } from '@milkdown/kit/prose/view';
import { t } from '@/i18n';
import { drawDiagram, MAX_DIAGRAM_CHARS, peekDiagram } from '@/services/mermaid';

/** Whether the page is drawn dark: the sepia page is light whatever the app's theme. */
function isDark(): boolean {
  if (document.querySelector('.split')?.getAttribute('data-read-theme') === 'sepia') return false;
  const theme = document.documentElement.getAttribute('data-theme');
  return (
    theme === 'dark' || (theme === null && matchMedia?.('(prefers-color-scheme: dark)').matches)
  );
}

function hash(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

function show(box: HTMLElement, src: string, width: number | null): void {
  const img = document.createElement('img');
  img.src = src;
  img.alt = t('read.diagram');
  if (width !== null) img.width = width;
  box.replaceChildren(img);
  box.classList.add('is-ready');
}

/** The diagram's place on the page: a note while it draws, the drawing, or the reason it failed. */
function diagramElement(source: string): HTMLElement {
  const box = document.createElement('div');
  box.className = 'read-diagram';
  box.contentEditable = 'false';
  const dark = isDark();
  const cached = peekDiagram(source, dark);
  if (cached) {
    show(box, cached.src, cached.width);
    return box;
  }
  box.textContent = t('read.diagramDrawing');
  drawDiagram(source, dark).then(
    (done) => show(box, done.src, done.width),
    () => {
      // The code block beside it stays, so the source can still be read.
      box.textContent = t('read.diagramFailed');
      box.classList.add('is-error');
    }
  );
  return box;
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
        key: `diagram-${hash(source)}-${isDark() ? 'd' : 'l'}`,
        ignoreSelection: true,
      })
    );
    return false;
  });
  return out;
}
