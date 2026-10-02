# Changelog

## Unreleased

- **Settings:** text size (both panes), line wrapping and line numbers
  (Markdown pane). The Export dialog starts from the last format and
  theme used.
- **Start screen:** remove a single recent file (×) or clear the whole
  list (asks first; files are not touched), and *Try the sample document*
  opens a short tour as an unsaved tab. Also in the command palette.
- **Command palette:** type `#` (or pick *Go to heading…*) to jump to a
  heading. The outline and the palette share one jump routine.
- **Open decisions closed:** the bundle budget is accepted as is (the gate
  stays); the second UI language is off the backlog for now.
- **Tabs, follow-ups.** Switching back to a tab returns to its cursor and
  scroll position. Tabs reorder by drag and drop or Shift+←/→. Tabs with
  the same file name are labelled with their first heading (or a number).
  A dropped file or recent snapshot that is already open (same name, same
  content as opened) switches to its tab instead of opening a copy.
- **Tabs.** Several documents can be open at once. New, Open, Recent,
  drop and Windows file-open each open a tab (an untouched blank document
  is reused); a file that is already open is switched to. The tab bar
  appears with two or more tabs; closing a tab with unsaved changes asks
  first, and closing the last returns to the start screen. Alt+W closes,
  Alt+PageDown/PageUp switch, also in the command palette. All tabs are
  restored after a reload; the single document older versions kept is
  migrated. Opening a file no longer asks to discard the current
  document, since it no longer replaces it.
- **Locale support.** The UI language follows the browser (exact tag,
  then base language) or a `language` setting, with English as the
  fallback; dates on the start screen use it and `<html lang>` follows
  it. English is the only language so far, so the settings language
  picker stays hidden until a second one is registered.
- **Book and dashboard links.** The start screen links the book (PDF and
  EPUB) and a new project dashboard at `/dashboard.html`: code size,
  tests, coverage, bundle size, book progress and trends from
  `stats.json`, plus the latest workflow runs and commits from GitHub.
  Both are also in the command palette.
- **Stats: start-up size now counts only start-up chunks.** `stats.json`
  counted every non-language chunk as start-up, including the lazy export
  chunks (docx, PDF), which overstated it (~729 KB vs ~429 KB gzip). It now
  counts what `index.html` loads and lists those chunks in `bundle.eager`.
  The trend line drops once at this change.
- **Paste and drop images** into either pane. In Edge/Chrome with the
  document on disk, images are saved in an `images` folder next to it
  (you pick the document's folder once) and linked by relative path; the
  visual pane shows them from that folder. Otherwise they are shrunk to
  at most 1600 px and embedded. Dropping a non-Markdown file outside the
  editors no longer navigates away from the app.
- **Fix: images disappeared from the visual pane.** Any image without a
  title (`![alt](src)`, the usual form) made the visual pane throw and
  render an empty paragraph instead, and a later edit in the visual pane
  could then drop the image from the Markdown. Image titles are now
  normalised before reaching the editor.
- **Format toolbar** above the visual pane: text style (paragraph,
  heading 1–4), bold, italic, strikethrough, inline code, link (via a
  prompt dialog), bulleted and numbered lists, quote, code block, table
  and horizontal rule. Buttons show as pressed for the selection's
  current formatting.
- The command palette's input now has an accessible name ("Commands").
- **Find and replace** (Ctrl+F / Ctrl+H) in whichever pane you're working
  in, with match case, whole word and regular expressions, a match count,
  and replace / replace all. Matches are highlighted in the visual pane;
  replacements sync to the other pane.
- **Outline** panel (toolbar or Ctrl+Shift+O): the document's headings;
  clicking one brings that section to the top of both panes, and the
  current section is highlighted. Overlays the editors on narrow screens.
- **Faster on large documents**: the visual pane now re-parses only the
  blocks that changed instead of the whole document after each typing
  pause, so typing no longer stutters on long files. On a 3,000-line
  document, an edit reaches the visual pane in ~170 ms instead of ~560 ms
  (the work per update fell from ~260 ms to ~12 ms). A full parse remains
  as a fallback and runs once while idle to rule out drift; the hidden
  visual pane in text-only view no longer updates at all until shown.
- **Visual edits keep your Markdown style**: editing in the visual pane
  now rewrites only the blocks you changed. Elsewhere, `*` bullets,
  `__bold__`, setext headings, spacing and so on stay exactly as written
  (so git diffs stay small). Verified per edit, with a fallback to the
  old behaviour if the merge would change meaning; no measurable cost on
  a 3,000-line document.
- **Recent files reopen the real file** (Edge/Chrome): file handles are
  kept in IndexedDB, so a recent entry opens the file's current content
  and Save writes back to it. The open document keeps its file across a
  reload too, instead of Save asking for a location. Falls back to the
  saved copy, with a note, when the file has moved or access is refused.
  The start screen marks entries as "File on disk" or "Saved copy".
- **Export**: save a copy as a themed web page (HTML, light/dark/auto),
  PDF, Word document (DOCX) or plain text, from the toolbar's Export
  dialog or the command palette. Replaces the unstyled "Export as HTML".
  Raw HTML in the source is shown as text and script-capable links are
  dropped in HTML exports. Converters load on demand.
- The book builder and PDF export share one renderer
  (`src/services/export/markdownPdf.mjs`); the book output is unchanged.
- Text pane: syntax colours follow the theme. CodeMirror's default style
  hard-coded light colours, leaving keywords and fence info strings
  near-invisible in dark mode. All token colours meet WCAG AA (4.5:1)
  in both themes.

## Repo and CI pipeline (PR #2)

- Book build: `pnpm book` builds `public/Writing-in-Plain-Text.epub` and
  `.pdf` from `docs/guide/` (pure Node, ported from mindmap-studio, with
  table support added to the PDF). `rebuild-book-pdf.yml` rebuilds and
  commits them when the manuscript changes.
- Stats: `scripts/build-stats.mjs` writes `public/stats.json` and
  `stats-history.json`; `stats.yml` refreshes them on push and weekly.
- Mutation testing: Stryker over `src/domain` (`pnpm mutation`, weekly
  `mutation.yml`); first score 71.7% of 251 mutants.
- Perf trace: `e2e/perf-trace.spec.ts` measures typing latency and sync
  latency in both directions on a ~3,000-line document; `perf-trace.yml`
  gates the best-of-3 p95 against `perf-baseline.json` weekly.
- Visual regression: `e2e/visual.spec.ts` screenshots five surfaces;
  `update-visual-snapshots.yml` creates baselines on the CI runner.
- Deploy re-runs after the book and stats workflows commit; the service
  worker no longer answers navigations to `.pdf`/`.epub`/`.json` with the
  app shell.

## 0.1.0 — initial scaffold

- Vite + React + TypeScript app scaffolded in the Studio family layout
  (`domain/`, `store/`, `services/`, `components/`, `hooks/`, `pwa/`, `i18n/`).
- Split / text / visual view modes over one shared Markdown document:
  CodeMirror 6 for the source, Milkdown for the visual pane, with
  debounced sync in both directions and no echo.
- Linked scroll anchored on headings, toggleable per session and in Settings.
- Start screen (continue, new, open, recent), settings dialog (theme,
  linked scroll, default view), command palette, toasts, confirm dialog.
- File System Access open/save on Chromium with input/download fallbacks;
  drag-and-drop open; Windows `.md` file association via `file_handlers` and
  `launchQueue`.
- Local-storage persistence of the open document, settings and recents.
- PWA manifest, service worker with update toast, offline support; icons.
- Slate theme tokens for light and dark mode.
- Tooling: Biome, Vitest, Playwright, knip, `bundle-budget.json`,
  `pnpm verify`, `ci.yml`, `deploy-pages.yml`, `public/CNAME`.
- Docs: README, USER_GUIDE, CLAUDE, NOTICE, licenses, book scaffold.
