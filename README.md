# MD Studio

A local-first Markdown editor that runs as an installable web app on Windows,
desktop browsers and mobile. A visual (WYSIWYG) editor and the raw Markdown
source sit side by side and stay in sync as you type, because both are views
of one shared document.

Live at **<https://md-studio.struktureretsundfornuft.dk>**. Part of the
Studio family alongside [tp-studio](https://github.com/dannbleeker/tp-studio),
[mindmap-studio](https://github.com/dannbleeker/mindmap-studio) and
mece-studio.

## Features

- **Split, text-only and visual-only views.** Edits on either side reach the
  other within about 200 ms, not only when you save.
- **Linked scroll** between the panes, aligned on headings rather than raw
  pixel offsets, so the two panes stay on the same section even though
  they render at different heights.
- **Real files.** On Chromium browsers (Edge, Chrome, the installed app on
  Windows), Open and Save work on the actual `.md` file on disk. Elsewhere,
  Open uses the file picker and Save downloads.
- **Double-click to open on Windows.** Once the app is installed, `.md` files
  can be associated with it.
- **Nothing is lost on reload.** The open document is kept in local storage.
- **Export** to HTML, PDF, Word (DOCX) or plain text.
- Find & replace in either pane, and an outline of the document's headings.
- Command palette (Ctrl+K), light/dark/system theme, print.
- Works offline once loaded, and updates itself when a new version is
  deployed.

See [USER_GUIDE.md](USER_GUIDE.md) for the quick reference and
[docs/guide/](docs/guide/) for the full book.

## Development

Requires Node 22 (see `.nvmrc`) and pnpm 10.

```sh
pnpm install
pnpm dev          # http://localhost:5173
pnpm verify       # the full gate CI runs
```

`pnpm verify` runs, fail-fast: typecheck → Biome lint/format → knip
dead-code check → Vitest unit tests → production build → Playwright e2e →
bundle-size budget (`bundle-budget.json`). The build runs before e2e because
the e2e specs test the built app through `vite preview`.

Playwright needs Chromium: run `pnpm exec playwright install chromium` once,
or point `PLAYWRIGHT_CHROMIUM_PATH` at an existing Chromium binary.

Other workflows (see `CLAUDE.md`): book EPUB/PDF rebuild (`pnpm book`),
stats, weekly mutation testing (`pnpm mutation`), weekly editor-latency
trace against `perf-baseline.json`, and visual-regression snapshots.

## Deployment

Every push to `main` builds and deploys to GitHub Pages
(`.github/workflows/deploy-pages.yml`). The custom domain is set by
`public/CNAME`.

## License

Code: [Apache-2.0](LICENSE). The book in `docs/guide/`:
[CC BY-NC 4.0](LICENSE-BOOK). See [NOTICE.md](NOTICE.md).
