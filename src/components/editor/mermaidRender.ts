/**
 * Draws Mermaid diagrams for Read view. Mermaid is large and loads only when
 * a document has a diagram. Its strict security level removes scripts and
 * event handlers from the text, labels are plain SVG text, and the finished
 * drawing is shown through an <img> (a data: URL), where nothing in it can
 * run or reach the page.
 */
type Mermaid = typeof import('mermaid').default;

let loading: Promise<Mermaid> | null = null;

function mermaid(): Promise<Mermaid> {
  loading ??= import('mermaid').then(
    (m) => m.default,
    (error) => {
      loading = null;
      throw error;
    }
  );
  return loading;
}

export const MAX_DIAGRAM_CHARS = 20_000;
const CACHE_ENTRIES = 40;

export type Drawn = { src: string; width: number | null };

const drawn = new Map<string, Drawn>();
/** Mermaid draws one diagram at a time. */
let queue: Promise<unknown> = Promise.resolve();
let counter = 0;

const keyOf = (source: string, dark: boolean) => `${dark ? 'd' : 'l'}\0${source}`;

/** A diagram already drawn this session, for a first frame with no wait. */
export const peekDiagram = (source: string, dark: boolean): Drawn | null =>
  drawn.get(keyOf(source, dark)) ?? null;

/** The width the drawing wants, from its viewBox. */
function widthOf(svg: string): number | null {
  const match = /viewBox="[-\d.]+ [-\d.]+ ([\d.]+) [\d.]+"/.exec(svg.slice(0, 2000));
  const width = match ? Number.parseFloat(match[1] ?? '') : Number.NaN;
  return Number.isFinite(width) && width > 0 ? Math.round(width) : null;
}

export function drawDiagram(source: string, dark: boolean): Promise<Drawn> {
  const key = keyOf(source, dark);
  const known = drawn.get(key);
  if (known) return Promise.resolve(known);
  const work = queue.then(async () => {
    const m = await mermaid();
    m.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: dark ? 'dark' : 'default',
      htmlLabels: false,
      flowchart: { htmlLabels: false },
      suppressErrorRendering: true,
    });
    const id = `md-studio-diagram-${++counter}`;
    try {
      const { svg } = await m.render(id, source);
      const result: Drawn = {
        src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
        width: widthOf(svg),
      };
      if (drawn.size >= CACHE_ENTRIES) drawn.delete(drawn.keys().next().value as string);
      drawn.set(key, result);
      return result;
    } finally {
      // A failed drawing can leave its working elements in the page.
      document.getElementById(id)?.remove();
      document.getElementById(`d${id}`)?.remove();
    }
  });
  queue = work.catch(() => {});
  return work;
}
