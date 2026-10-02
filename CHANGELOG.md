# Changelog

## Unreleased

- **Refactor (no behaviour change): the visual pane's sync logic is its
  own module.** `editor/visualSync.ts` decides when and how text-pane
  edits reach the visual pane (debounce, incremental or full update,
  double-check, catch-up when shown, recovery from parse failures), with
  Milkdown behind an interface. Unit tests with fake timers now pin that
  timing; before, only the browser tests covered it.

- A dialog taller than the window (Settings on a short laptop screen)
  scrolls with its buttons pinned at the bottom, so Done stays in reach.
- A test runs every command that shows a shortcut in the palette both
  ways, from the palette and from the key, and checks they do the same,
  so a hint can't drift from the real shortcut.

- **Refactor (no behaviour change).** Reference-definition rules live in
  `domain/referenceDefinitions.ts` with their own tests, instead of two
  copies of one regex in the sync code. The panes lose their duplicated
  report, release and heading-selector code. The store's tab and save
  helpers share code; dialog and find-bar flags move to `store/ui.ts`, so
  opening a dialog no longer wakes the document store's subscribers.
  `CLAUDE.md` matches the code again.

- **Deeply nested documents no longer stall or crash the editors.** Both
  parsers are quadratic on nested brackets (20,000 levels took the visual
  pane over a second and the Markdown pane half a second, on every load),
  and 10,000 nested `![` overflowed the Markdown pane's parser. A guard
  (`domain/nesting.ts`) keeps a document nested past any real one's depth
  away from both: the visual pane goes inert with its notice, the Markdown
  pane shows plain text without highlighting, and both recover once the
  document is fixed.

- **Bug hunt, part 4: suspected bugs confirmed and fixed.**
  - A lazy part of the app (find bar, outline, format toolbar) that fails
    to load after a deploy no longer blanks the whole app: it is left out
    and a toast offers a reload. The service worker now also takes control
    on the first visit.
  - Save As onto a file another tab has open closes that tab, or, if it
    has unsaved changes, keeps them as a copy no longer linked to the file.
  - A `.txt` file is saved as `notes.md` and exported as `notes.pdf`,
    not `notes.txt.md` and `notes.txt.pdf`.
  - Closing every tab and reloading shows the start screen, not a blank
    editor.
  - Ctrl+Z in the Markdown pane undoes only what was typed there, no
    longer edits made in the visual pane.
  - Line numbers, fold markers and the × buttons meet WCAG contrast in
    both themes (`--text-faint` darkened in light, lightened in dark).
  - Word: tabs in code are real tabs; lists, headings and code inside a
    quote keep the quote's bar and indent; plain text in a quote is italic
    like paragraphs; a nested numbered list starts at its own number.
  - PDF: a list starting at `0.` starts at 0; a code line with a character
    the font lacks keeps its Danish letters; lists inside a quote carry
    the quote's bar; tabs in code wrap correctly.
  - Plain text: a leading quote and leading spaces in code keep their
    indent.
  - HTML: heading ids stay unique when a heading reads like a numbered id
    (`# a`, `# a`, `# a-1`).

- **Security sweep.** See `SECURITY.md` for the threat model.
  - Content Security Policy for the app (scripts only from its own origin,
    no plugins, frames or form posts), the dashboard and exported HTML.
  - The dashboard links only to GitHub pages from GitHub API data; a
    `javascript:` URL in the API response could otherwise have run script
    in the app's origin.
  - A document nested too deeply for the parser (thousands of `>` or `*`)
    no longer breaks the visual pane, even after a reload: the pane goes
    inert with a notice and comes back once the document parses.
  - Web images are no longer loaded when a document opens: they show as
    their alt text until **Load web images** is turned on in Settings,
    and then load without a referrer.
  - CI: read-only token for CI, no stored credentials during install and
    build, third-party actions pinned to a commit SHA, Dependabot for
    Actions. `qs` lifted past three advisories (dev-only, via Stryker).
- **The user guide and the book open from inside the app**: start screen,
  a Help and reading section in Settings, and the command palette. The
  guide opens as a document tab, or as a PDF (`public/User-Guide.pdf`,
  built by `pnpm book:guide` and rebuilt by the book workflow when
  `USER_GUIDE.md` changes). The guide and the book are precached, so they
  work offline.

- **Bug hunt, part 3: sync engine.**
  - A text edit among repeated blocks no longer lands on the wrong copy in
    the visual pane (an ambiguous match now takes the full parse).
  - Reference definitions and footnotes always take the full parse, so a
    definition typed far from its use links it straight away.
  - A visual edit keeps reference-style links and their definitions
    instead of inlining the links and deleting the definitions.
  - Visual undo and selection survive text-pane edits to neighbouring
    blocks, and full updates no longer replace everything after the
    first heading.
  - Clicking into the visual pane settles a pending incremental update
    first, so a divergence can't become permanent.
  - Outline, linked scroll and the palette's heading jump agree with the
    visual pane: inline triple backticks, fence info lines, headings
    inside lists, quotes and HTML blocks no longer confuse them.
  - Ctrl+F / Ctrl+H pressed again refocuses the find bar and searches the
    pane you are in.
- **Bug hunt, part 2: export and UI.**
  - Word: task items keep their text in the bullet, each numbered list
    starts at its own number instead of continuing the previous one.
  - Named entities (`&copy;`, `&nbsp;`, `&mdash;`…) come out as characters
    in Word, PDF and plain text.
  - HTML: table column alignment is honoured, headings get anchor ids so
    in-page links work, and dark or auto pages print in light colours.
  - PDF: everything inside a quote is drawn (nested quotes, code, lists),
    table cells show their text without Markdown syntax, and long words
    or URLs wrap instead of running off the page.
  - The command palette keeps the keyboard selection in view; the toolbar
    wraps on a 360 px phone instead of pushing buttons off-screen; the
    dark-theme danger button meets WCAG AA contrast; confirm dialogs
    focus Cancel, the safe choice for discard and overwrite.
- **Bug hunt, part 1: data loss.**
  - Save records exactly the text it wrote, on the tab it started in,
    so typing during a save or switching tabs while it runs no longer
    marks unwritten text as saved or ties another tab to the file.
  - Visual-pane edits are flushed before saves, tab switches, closing and
    page hide, so the last 200 ms of typing is never lost or written into
    another tab, and a text edit made right after a visual edit is no
    longer reverted.
  - Two windows of the app keep each other's tabs, file handles still used
    by any saved tab are kept, and double-clicked files go to the open
    window. A full browser storage now warns instead of silently
    dropping changes, and an unchanged tab takes half the space.
  - Files changed on disk are noticed: an unchanged tab reloads, and Save
    asks before overwriting the newer version.
  - Exports number footnotes, keep nested lists, task boxes and
    strikethrough in PDF, and embed pasted and `images/` pictures in PDF,
    Word and HTML.
  - Smaller fixes: a dropped `.md` file is no longer also pasted into the
    Markdown pane; several dropped or double-clicked files all open;
    shortcuts stay quiet behind dialogs and during IME composition, and
    Alt shortcuts work on macOS; *Continue editing* finds the tab with
    work when the active one is blank; a linked file in Recent is no
    longer replaced by an unlinked one with the same name.
- **The book is written.** *Writing in Plain Text* now has a foreword,
  seven chapters and three appendices (~23,000 words) instead of outlines,
  in the same voice as the mindmap-studio book. The PDF and EPUB are
  rebuilt from them. The user guide and the book had a humanizer pass
  (no dashes, straight quotes, prose instead of label lists).
- **Perf baseline from CI.** `perf-baseline.json` now holds the numbers
  from the first Perf trace run on GitHub's runner; the earlier container
  numbers were far looser.
- **Settings:** text size (both panes), line wrapping and line numbers
  (Markdown pane). The Export dialog starts from the last format and
  theme used.
- **Start screen:** remove a single recent file (×) or clear the whole
  list (asks first; files are not touched), and *Try the sample document*
  opens a short tour as an unsaved tab. Also in the command palette.
- **Command palette:** type `#` (or pick *Go to heading…*) to jump to a
  heading. The outline and the palette share one jump routine.
- **Open decisions closed:** the bundle budget is accepted as is (the gate
  stays); the second UI language is off the backlog for now; no
  Storybook.
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
