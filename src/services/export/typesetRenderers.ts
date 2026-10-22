import { mathMl } from '../math';
import { drawDiagram } from '../mermaid';
import type { Renderers } from './typeset';

/**
 * The browser's half of typesetting: formulas and diagrams drawn to PNG on a
 * canvas. Each picture is made at twice its size and shown at its own.
 */
const SCALE = 2;
const MAX_SIDE = 2400;
const XHTML = 'http://www.w3.org/1999/xhtml';

function canvasToPng(canvas: HTMLCanvasElement): Promise<Uint8Array | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      if (!blob) return resolve(null);
      blob.arrayBuffer().then(
        (buffer) => resolve(new Uint8Array(buffer)),
        () => resolve(null)
      );
    }, 'image/png');
  });
}

/** An SVG document as a picture the canvas can draw. */
function loadSvg(svg: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('svg'));
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

async function draw(svg: string, width: number, height: number) {
  const img = await loadSvg(svg);
  const scale = Math.min(SCALE, MAX_SIDE / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext('2d');
  if (!context) return null;
  // A white page behind it: print and Word show it on white, and the drawing is dark on light.
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(img, 0, 0, canvas.width, canvas.height);
  const bytes = await canvasToPng(canvas);
  return bytes
    ? {
        bytes,
        width: canvas.width,
        height: canvas.height,
        displayWidth: Math.round(width),
        displayHeight: Math.round(height),
      }
    : null;
}

/** MathML measured in the page, then drawn as the HTML inside an SVG picture. */
async function mathPng(markup: string) {
  const style = 'font:16px/1.4 serif;color:#000;width:max-content;max-width:640px;padding:2px';
  const host = document.createElement('div');
  host.setAttribute('style', `position:fixed;left:-9999px;top:0;${style}`);
  host.innerHTML = markup;
  document.body.append(host);
  const box = host.getBoundingClientRect();
  host.remove();
  const width = Math.ceil(box.width) + 2;
  const height = Math.ceil(box.height) + 2;
  if (width < 4 || height < 4) return null;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><foreignObject width="100%" height="100%"><div xmlns="${XHTML}" style="${style}">${markup}</div></foreignObject></svg>`;
  return draw(svg, width, height);
}

/** The drawing with an explicit size: Mermaid's own says 100%, which a canvas cannot use. */
function withSize(svg: string, width: number, height: number): string {
  const root = /^<svg\b[^>]*>/.exec(svg)?.[0];
  if (!root) return svg;
  const sized = root
    .replace(/\s(?:width|height)="[^"]*"/g, '')
    .replace('<svg', `<svg width="${width}" height="${height}"`);
  return sized + svg.slice(root.length);
}

export const browserRenderers: Renderers = {
  mathMl,
  mathPng,
  async diagram(source, dark) {
    const drawn = await drawDiagram(source, dark);
    return { svg: drawn.svg, width: drawn.width, height: drawn.height };
  },
  svgPng: (svg, width, height) => draw(withSize(svg, width, height), width, height),
};
