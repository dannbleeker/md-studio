import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
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

export default defineConfig({
  plugins: [
    react(),
    // `registerType: 'prompt'` matches the sibling studios: the service worker
    // downloads a new build in the background on every deploy, and the app
    // shows a "New version available" toast instead of reloading under the
    // user's cursor. The open document is persisted to localStorage, so the
    // reload is safe, but the user still chooses the moment.
    VitePWA({
      registerType: 'prompt',
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2,webmanifest}'],
        navigateFallback: '/index.html',
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
        globIgnores: ['assets/lang-*.js', 'assets/docx-*.js', 'assets/markdownPdf-*.js'],
        runtimeCaching: [
          {
            urlPattern: /\/assets\/(?:lang|docx|markdownPdf)-.*\.js$/,
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
