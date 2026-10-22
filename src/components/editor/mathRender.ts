import { parseMathToken } from '@/domain/math';
import { mathMl } from '@/services/math';

/**
 * Draws math into the visual pane (KaTeX as MathML, see services/math). It
 * loads the first time a document shows a formula.
 */

/** Formulas still being drawn: print waits for them. */
const pending = new Set<Promise<void>>();

export const mathSettled = (): Promise<unknown> => Promise.all([...pending]);

/** Draws `raw` (a whole `$...$` or `$$...$$` token) into `host`; leaves its text on any failure. */
export function renderMath(host: HTMLElement, raw: string): void {
  const math = parseMathToken(raw);
  if (!math) return;
  const work = mathMl(math.tex, math.display)
    .then((markup) => {
      // The node was drawn again with another source while KaTeX loaded.
      if (host.dataset.raw !== raw) return;
      host.innerHTML = markup;
      host.classList.add('md-math-ready');
    })
    .catch(() => {
      // The token's own text stays on screen.
    })
    .finally(() => pending.delete(work));
  pending.add(work);
}
