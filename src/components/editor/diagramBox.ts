import { t } from '@/i18n';
import { drawDiagram, peekDiagram } from '@/services/mermaid';

/** Whether the page is drawn dark: the sepia page is light whatever the app's theme. */
export function pageIsDark(): boolean {
  if (document.querySelector('.split')?.getAttribute('data-read-theme') === 'sepia') return false;
  const theme = document.documentElement.getAttribute('data-theme');
  return (
    theme === 'dark' || (theme === null && matchMedia?.('(prefers-color-scheme: dark)').matches)
  );
}

function show(box: HTMLElement, src: string, width: number | null): void {
  const img = document.createElement('img');
  img.src = src;
  img.alt = t('read.diagram');
  if (width !== null) img.width = width;
  box.replaceChildren(img);
  box.classList.add('is-ready');
}

/**
 * The diagram's place on the page: a note while it draws, the drawing, or
 * the reason it failed. The code block it stands for is meant to follow it,
 * hidden by CSS once the drawing is there, so the source stays readable.
 */
export function diagramElement(source: string): HTMLElement {
  const box = document.createElement('div');
  box.className = 'read-diagram';
  box.contentEditable = 'false';
  const dark = pageIsDark();
  const cached = peekDiagram(source, dark);
  if (cached) {
    show(box, cached.src, cached.width);
    return box;
  }
  box.textContent = t('read.diagramDrawing');
  drawDiagram(source, dark).then(
    (done) => show(box, done.src, done.width),
    () => {
      box.textContent = t('read.diagramFailed');
      box.classList.add('is-error');
    }
  );
  return box;
}
