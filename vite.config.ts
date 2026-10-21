import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * CodeMirror packages the text pane loads up front: the core, the Markdown
 * mode, and what lang-markdown statically imports for inline HTML
 * (html → css + javascript). Every other language package is lazy.
 */
const CODEMIRROR_EAGER =
  /node_modules\/(codemirror|crelt|style-mod|w3c-keyname|@marijn\/find-cluster-break|@codemirror\/(state|view|language|language-data|commands|search|autocomplete|lint|lang-markdown|lang-html|lang-css|lang-javascript)|@lezer\/(common|highlight|lr|markdown|html|css|javascript))\//;
// legacy-modes is one package holding ~100 modes; split it per mode file so
// a ```bash block doesn't download every legacy grammar at once.
const LAZY_LANGUAGE =
  /node_modules\/(?:@codemirror\/legacy-modes\/mode\/([\w-]+)\.js|(?:@codemirror\/lang-|@codemirror\/|@lezer\/)([\w-]+)\/)/;

/**
 * What Mermaid is made of. Read view draws a fenced ```mermaid block with it,
 * and it brings a hundred or so lazy chunks (one per diagram type) and its
 * own copies of d3, dagre, cytoscape and friends: several MB that only a
 * document with a diagram needs. Chunks made of nothing else get the
 * `diagram-` prefix, which the precache globIgnores and runtime cache rule
 * below key on, like `lang-`. The app's own KaTeX (version 0.19, for math)
 * and marked (export) are not on the list and stay in the install; the
 * older KaTeX that Mermaid brings is.
 */
const DIAGRAM_PACKAGES =
  /node_modules\/(?:\.pnpm\/[^/]+\/node_modules\/)?(?:mermaid|@mermaid-js\/[\w-]+|d3|d3-[\w-]+|internmap|delaunator|robust-predicates|dagre-d3-es|cytoscape[\w-]*|khroma|langium|vscode-[\w.-]+|chevrotain[\w-]*|@chevrotain\/[\w-]+|roughjs|lodash-es|lodash|ts-dedent|dompurify|stylis|uuid|@iconify\/[\w-]+|@braintree\/sanitize-url|layout-base|cose-base|elkjs|fast-deep-equal|path-data-parser|points-on-curve|points-on-path|robust-predicates)\//;

/** Older copies of KaTeX and marked that Mermaid pins for itself, next to the app's own. */
const MERMAID_OWN_COPIES = /node_modules\/\.pnpm\/(?:katex@0\.1[0-8]|marked@1[0-6])[^/]*\//;

/** A chunk with some of those packages in it and no code of the app's own. */
const isDiagramChunk = (name: string, ids: readonly string[]): boolean =>
  // The vendor chunks named above share a few of these packages (lodash, uuid); they stay.
  !/^(?:react|codemirror|milkdown|lang-)/.test(name) &&
  ids.some((id) => DIAGRAM_PACKAGES.test(id) || MERMAID_OWN_COPIES.test(id)) &&
  ids.every((id) => id.includes('node_modules') || id.includes('\0'));

/**
 * Content Security Policy for the built app (a <meta> tag: GitHub Pages
 * can't send headers). Scripts only from this origin, so even if a
 * document's content ever reached the DOM as HTML, its script couldn't
 * run; no plugins, no <base> hijack, no form posts. Styles need
 * 'unsafe-inline' because CodeMirror and Milkdown inject <style> elements.
 * Images may come from anywhere: Markdown documents link web images.
 * Attachments from a chosen vault folder (audio, video, PDF) are shown from
 * same-origin blob: URLs made from the user's own files, so media-src and
 * frame-src allow blob: and nothing else. Not applied in dev, where Vite
 * injects inline scripts for HMR.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https: http:",
  "connect-src 'self' data: blob:",
  "font-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "media-src 'self' blob:",
  "object-src 'none'",
  'frame-src blob:',
  "base-uri 'self'",
  "form-action 'none'",
].join('; ');

const contentSecurityPolicy: Plugin = {
  name: 'md-studio-csp',
  apply: 'build',
  transformIndexHtml: (html) =>
    html.replace(
      '<meta charset="UTF-8" />',
      `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`
    ),
};

export default defineConfig({
  plugins: [
    react(),
    contentSecurityPolicy,
    // `registerType: 'prompt'` matches the sibling studios: the service worker
    // downloads a new build in the background on every deploy, and the app
    // shows a "New version available" toast instead of reloading under the
    // user's cursor. The open document is persisted to localStorage, so the
    // reload is safe, but the user still chooses the moment.
    VitePWA({
      registerType: 'prompt',
      workbox: {
        // The book (PDF ~550 KB, EPUB ~60 KB) is precached with the app so
        // it opens offline like the user guide, which is a precached chunk.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2,webmanifest,pdf,epub}'],
        navigateFallback: '/index.html',
        // Take control on the first visit too, so its lazy chunks come from
        // the precache and survive a deploy made while the tab is open.
        clientsClaim: true,
        // Opening the book (/Writing-in-Plain-Text.pdf), a stats file or the
        // dashboard (/dashboard.html) is a navigation too; without this the
        // SPA fallback would answer it with the app shell instead of the
        // file (tp-studio hit exactly this).
        navigateFallbackDenylist: [/\.(?:pdf|epub|json|html)$/],
        // CodeMirror's language-data lazy-loads one chunk per fenced-code
        // language. They are small, but there are ~100; leave them out of the
        // install-critical precache and cache them on first use instead.
        // The Word and PDF exporters (~110 KB and ~175 KB gzip) only load
        // when someone exports in those formats; keep them out of the
        // install too and cache them on first use like the grammars.
        // Mermaid's chunks are the same kind of thing (see DIAGRAM_PACKAGES).
        globIgnores: [
          'assets/lang-*.js',
          'assets/docx-*.js',
          'assets/markdownPdf-*.js',
          'assets/diagram-*.js',
        ],
        runtimeCaching: [
          {
            urlPattern: /\/assets\/(?:lang|docx|markdownPdf|diagram)-.*\.js$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'md-studio-lang-v1',
              expiration: { maxEntries: 200, maxAgeSeconds: 30 * 24 * 60 * 60 },
            },
          },
        ],
      },
      manifest: {
        name: 'MD Studio',
        short_name: 'MD Studio',
        description: 'Local-first Markdown editor with synced visual and raw views.',
        theme_color: '#3d5170',
        background_color: '#fafbfc',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
        // Double-clicking a .md file in Windows Explorer launches the installed
        // PWA and hands it the file via `launchQueue` (src/pwa/launchQueue.ts).
        // Chromium-only; Windows offers the association when the app is
        // installed. Mobile OSes ignore this, which is why the start screen
        // has its own Open action.
        // Double-clicked files go to the open window (via launchQueue)
        // instead of a second window competing for the same storage.
        launch_handler: { client_mode: 'focus-existing' },
        file_handlers: [
          {
            action: '/',
            accept: { 'text/markdown': ['.md', '.markdown', '.mdown', '.mkd'] },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: {
      '@': path.join(here, 'src'),
      // `virtual:pwa-register` only exists inside a Vite build; route it to a
      // stub under Vitest so components that import the PWA layer still load.
      ...(process.env.VITEST
        ? { 'virtual:pwa-register': path.join(here, 'test', 'stubs', 'virtual-pwa-register.ts') }
        : {}),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // A chunk of nothing but Mermaid and its dependencies is named so the
        // service worker can leave it out of the install.
        chunkFileNames: (chunk) =>
          isDiagramChunk(chunk.name, chunk.moduleIds)
            ? 'assets/diagram-[name]-[hash].js'
            : 'assets/[name]-[hash].js',
        // Named vendor chunks so bundle-budget.json can hold each editor
        // engine to its own ceiling, and an app-code change only invalidates
        // the small index chunk in returning visitors' caches.
        manualChunks: (id) => {
          if (!id.includes('node_modules')) return undefined;
          if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'react';
          if (CODEMIRROR_EAGER.test(id)) return 'codemirror';
          // Every other grammar is loaded on demand by @codemirror/language-data
          // when a fenced code block names its language. The `lang-` prefix is
          // what the precache globIgnores and runtime cache rule above key on.
          const lang = LAZY_LANGUAGE.exec(id);
          if (lang) return `lang-${lang[1] ?? lang[2]}`;
          if (
            /node_modules\/(@milkdown|prosemirror-|remark|micromark|mdast|unified|unist)/.test(id)
          ) {
            return 'milkdown';
          }
          return undefined;
        },
      },
    },
  },
});
