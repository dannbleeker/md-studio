import type { ExportFormat } from '@/domain/exportFormats';
import { planTypeset, type TypesetItem, type TypesetWants } from '@/domain/typesetPlan';
import type { ExportImage, ExportImages } from './exportImages';

/**
 * Formulas and Mermaid diagrams in an export. A web page gets MathML and the
 * diagram's SVG as they are; Word gets pictures of both; a PDF gets pictures
 * of display formulas and diagrams (an inline picture cannot sit in a line of
 * its text, so inline formulas stay as their TeX). A plain text export keeps
 * everything as written. Anything that cannot be drawn is written back as the
 * text it was, never dropped.
 */

/** The size a drawn picture is shown at, in CSS pixels. */
type Drawn = {
  bytes: Uint8Array;
  width: number;
  height: number;
  displayWidth: number;
  displayHeight: number;
};

export type Renderers = {
  mathMl(tex: string, display: boolean): Promise<string>;
  mathPng(mathMl: string): Promise<Drawn | null>;
  diagram(
    source: string,
    dark: boolean
  ): Promise<{ svg: string; width: number | null; height: number | null } | null>;
  svgPng(svg: string, width: number, height: number): Promise<Drawn | null>;
};

const WANTS: Record<ExportFormat, TypesetWants> = {
  html: { inlineMath: true, displayMath: true, diagrams: true },
  docx: { inlineMath: true, displayMath: true, diagrams: true },
  pdf: { inlineMath: false, displayMath: true, diagrams: true },
  txt: { inlineMath: false, displayMath: false, diagrams: false },
};

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const EMPTY = new Uint8Array(0);
const MAX_DIAGRAM_WIDTH = 800;

async function render(
  item: TypesetItem,
  format: ExportFormat,
  dark: boolean,
  r: Renderers
): Promise<ExportImage | null> {
  if (item.kind === 'math') {
    const markup = await r.mathMl(item.tex, item.display);
    if (format === 'html') return { type: 'png', width: 0, height: 0, bytes: EMPTY, html: markup };
    const png = await r.mathPng(markup);
    return png && { type: 'png', ...png };
  }
  const diagram = await r.diagram(item.source, dark);
  if (!diagram) return null;
  const width = diagram.width ?? 600;
  const height = diagram.height ?? 400;
  if (format === 'html') {
    // A web page shows the drawing as it is, in an <img>, where nothing in it can run.
    const shown = Math.min(width, MAX_DIAGRAM_WIDTH);
    return {
      type: 'png',
      width: 0,
      height: 0,
      bytes: new TextEncoder().encode(diagram.svg),
      mime: 'image/svg+xml',
      displayWidth: shown,
      displayHeight: Math.round((height * shown) / width),
    };
  }
  const png = await r.svgPng(diagram.svg, width, height);
  return png && { type: 'png', ...png };
}

export async function typesetForExport(
  markdown: string,
  format: ExportFormat,
  options: { dark?: boolean } = {},
  renderers?: Renderers
): Promise<{ markdown: string; images: ExportImages }> {
  const none = { markdown, images: new Map<string, ExportImage>() };
  const plan = planTypeset(markdown, WANTS[format]);
  if (plan.items.length === 0) return none;
  const r = renderers ?? (await import('./typesetRenderers')).browserRenderers;
  const images = new Map<string, ExportImage>();
  let out = plan.markdown;
  for (const item of plan.items) {
    let image: ExportImage | null = null;
    try {
      image = await render(item, format, options.dark ?? false, r);
    } catch {
      image = null;
    }
    if (image) {
      images.set(item.id, image);
      continue;
    }
    // Not drawn: the text it was, as it was written.
    const pattern = new RegExp(`!\\[[^\\]]*\\]\\(${escapeRegExp(item.id)}\\)`);
    out = out.replace(pattern, () => item.raw);
  }
  return { markdown: out, images };
}
