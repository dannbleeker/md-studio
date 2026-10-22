/**
 * KaTeX, loaded on first use and shared by the visual pane and the exports.
 * Math is typeset as MathML: the browser draws it with its own fonts, so no
 * stylesheet or font files come with it. `trust` is off, so a formula cannot
 * produce a link, an image or a style, and it only ever sees TeX, never HTML.
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

/** The MathML for a formula. An invalid one comes back as its TeX text in the error colour. */
export async function mathMl(tex: string, display: boolean): Promise<string> {
  const k = await katex();
  return k.renderToString(tex, {
    displayMode: display,
    output: 'mathml',
    throwOnError: false,
    strict: 'ignore',
    trust: false,
    maxSize: 30,
    maxExpand: 1000,
  });
}
