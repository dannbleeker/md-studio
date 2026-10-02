import { Marked } from 'marked';
import type { HtmlTheme } from '@/domain/exportFormats';

const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c
  );

/** Link targets that can't run script when the exported page is opened. */
const SAFE_URL = /^(?:https?:|mailto:|tel:|#|\/|\.{0,2}\/|[^:]*$)/i;

/** Pasted raster images (base64). SVG stays out: it can carry script. */
const RASTER_DATA_URL = /^data:image\/(?:png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+$/i;

/**
 * Raw HTML in the source is shown as text, not rendered, and script-capable
 * URLs (javascript:, data: other than raster images, …) are dropped: an
 * exported page should never run code that came from a document someone
 * sent you.
 */
const marked = new Marked({
  gfm: true,
  renderer: {
    html({ text }) {
      return escapeHtml(text);
    },
    link({ href, title, tokens }) {
      const text = this.parser.parseInline(tokens);
      if (!SAFE_URL.test(href)) return text;
      const t = title ? ` title="${escapeHtml(title)}"` : '';
      return `<a href="${escapeHtml(href)}"${t}>${text}</a>`;
    },
    image({ href, title, text }) {
      const safe = RASTER_DATA_URL.test(href) || (SAFE_URL.test(href) && !/^data:/i.test(href));
      if (!safe) return escapeHtml(text);
      const t = title ? ` title="${escapeHtml(title)}"` : '';
      return `<img src="${escapeHtml(href)}" alt="${escapeHtml(text)}"${t}>`;
    },
  },
});

const LIGHT = `--bg:#fafbfc;--surface:#fff;--surface-2:#f1f4f8;--border:#d8dee8;--text:#1c2533;--muted:#556275;--accent:#3d5170;`;
const DARK = `--bg:#11161d;--surface:#161c25;--surface-2:#1c2430;--border:#2c3747;--text:#e3e8ef;--muted:#a3afc0;--accent:#93a8c6;`;

function themeCss(theme: HtmlTheme): string {
  if (theme === 'light') return `:root{color-scheme:light;${LIGHT}}`;
  if (theme === 'dark') return `:root{color-scheme:dark;${DARK}}`;
  return `:root{color-scheme:light dark;${LIGHT}}@media (prefers-color-scheme:dark){:root{${DARK}}}`;
}

/** Standalone HTML page styled like the visual pane, in the chosen theme. */
export function markdownToHtml(markdown: string, title: string, theme: HtmlTheme): string {
  const body = marked.parse(markdown, { async: false });
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="MD Studio">
<title>${escapeHtml(title)}</title>
<style>
${themeCss(theme)}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font:16px/1.7 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:46rem;margin:0 auto;padding:2.5rem 1.25rem 4rem}
h1,h2,h3,h4,h5,h6{line-height:1.25;margin:1.6em 0 .5em}
main>:first-child{margin-top:0}
h1{font-size:1.9rem}h2{font-size:1.45rem;border-bottom:1px solid var(--border);padding-bottom:.2em}h3{font-size:1.2rem}
a{color:var(--accent)}
code{font-family:ui-monospace,"Cascadia Code",Consolas,monospace;font-size:.9em;background:var(--surface-2);border-radius:4px;padding:.1em .3em}
pre{background:var(--surface-2);border:1px solid var(--border);border-radius:8px;padding:.8rem 1rem;overflow-x:auto}
pre code{background:none;padding:0}
blockquote{margin:1em 0;padding-left:1rem;border-left:3px solid var(--accent);color:var(--muted)}
table{border-collapse:collapse;margin:1em 0}th,td{border:1px solid var(--border);padding:.35rem .7rem;text-align:left;vertical-align:top}th{background:var(--surface-2)}
hr{border:0;border-top:1px solid var(--border);margin:2em 0}
img{max-width:100%}
li>input[type=checkbox]{margin-right:.4em}
@media print{body{background:#fff;color:#000}main{padding:0}}
</style>
</head>
<body>
<main>
${body}</main>
</body>
</html>
`;
}
