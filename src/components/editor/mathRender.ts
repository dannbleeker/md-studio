import { parseMathToken } from '@/domain/math';

/**
 * Draws math with KaTeX as MathML: the browser typesets it itself, so no
 * fonts or stylesheet come with it. KaTeX loads the first time a document
 * shows a formula. `trust` is off, so a formula cannot produce links,
 * images or style attributes, and it only ever sees TeX, never HTML.
 */
type Katex = typeof import('katex').default;

let loading: Promise<Katex> | null = null;

function katex(): Promise<Katex> {
  loading ??= import('katex').then(
    (m) => m.default,
    (error) => {
      // A failed chunk load (offline, stale build) is retried by the next formula.
      loading = null;
      throw error;
    }
  );
  return loading;
}

/** Formulas still being drawn: print waits for them. */
const pending = new Set<Promise<void>>();

export const mathSettled = (): Promise<unknown> => Promise.all([...pending]);

/** Draws `raw` (a whole `$...$` or `$$...$$` token) into `host`; leaves its text on any failure. */
export function renderMath(host: HTMLElement, raw: string): void {
  const math = parseMathToken(raw);
  if (!math) return;
  const work = katex()
    .then((k) => {
      // The node was drawn again with another source while KaTeX loaded.
      if (host.dataset.raw !== raw) return;
      host.innerHTML = k.renderToString(math.tex, {
        displayMode: math.display,
        output: 'mathml',
        throwOnError: false,
        strict: 'ignore',
        trust: false,
        maxSize: 30,
        maxExpand: 1000,
      });
      host.classList.add('md-math-ready');
    })
    .catch(() => {
      // The token's own text stays on screen.
    })
    .finally(() => pending.delete(work));
  pending.add(work);
}
