# Security

## Reporting a vulnerability

Please report security problems privately through GitHub's
[private vulnerability reporting](https://github.com/dannbleeker/md-studio/security/advisories/new)
rather than in a public issue. Include the steps or the document that
reproduce it. You should get an answer within a week. MD Studio is a
one-person project, so there is no bounty, but you will be credited in the
changelog unless you would rather not be.

Only the current version at md-studio.struktureretsundfornuft.dk (the `main`
branch) is supported. The installed app updates itself from there.

## What MD Studio protects

MD Studio has no server and no accounts. Everything it knows lives in your
browser: open documents and recent files in `localStorage`, file handles in
IndexedDB, and the files you choose to open or save on disk. The threat it
defends against is a document someone else wrote: a file you open or drop,
text or HTML you paste, or a link you click. Such content must not be able
to:

- run script in the app's origin (where it could read your other documents
  or write to files you gave the app access to),
- send your documents anywhere, or
- turn an export (HTML, Word, PDF, plain text) into something that runs
  script when opened.

## How

- **Content Security Policy.** The built app ships a policy (a `<meta>` tag,
  since GitHub Pages can't send headers) that allows scripts only from the
  app's own origin, no plugins (`object-src 'none'`), no form posts and no
  `<base>` rewriting. Frames and media may come only from `blob:` URLs the
  app made itself from files in the vault folder you chose (a PDF shown
  beside its **Open** link, audio, video); nothing else can be framed. Even
  content that reached the page as HTML could not run script. It is set in
  `vite.config.ts`. The project dashboard (`public/dashboard.html`) has its
  own policy, keeps its script in a separate file, and links only to
  `https://github.com/` from GitHub API data. Exported HTML pages declare a
  policy that forbids all script.
- **Markdown is never rendered as HTML in the app.** Both panes are editors:
  CodeMirror shows source text, and Milkdown shows raw HTML in a document as
  text, not as markup.
- **HTML export** escapes raw HTML in the document, keeps only `http:`,
  `https:`, `mailto:`, `tel:`, relative and in-page links, and embeds only
  `data:` images, recognised by their bytes and not by a file name (raster
  formats, a real bitmap header, a closed `<svg>` document), at most 5 MB
  each and 25 MB in all. A vault file is read for export only when the vault
  classes it as an image (and it is under 32 MB); a note cannot name another
  vault path through the internal `attachment:` scheme. See
  `src/services/export/html.ts` and `exportImages.ts`.
- **No network requests of its own.** Exports read pasted images and images
  next to the file; they never fetch web images. The only network traffic
  is the app's own files, and web images that a document links to (shown in
  the visual pane) once you allow them: **Load web images** in Settings is
  off by default, because a web image tells its server your IP address and
  when the document was opened. Allowed images load without a referrer.
- **Hostile documents** nested too deeply for the Markdown parsers
  (hundreds of nested brackets, quotes or emphasis markers, far beyond any
  real document) can't stall or take down the editor. Such a document is
  never parsed: the visual pane goes inert and says so, the Markdown pane
  shows it as plain text without highlighting, and both come back once the
  document is fixed. See `src/domain/nesting.ts`.
- **Obsidian notes and vault folders.** The vault folder is read only after
  you choose it (and the browser's permission prompt); `.obsidian/app.json`
  is read, never written, and a bad one gives the defaults. Attachments are
  written only inside that folder; a path that climbs out of it is not used.
  Embedded notes are rendered read-only in a detached document and cleaned
  through an allow-list, so a note's images are not requested before **Load
  web images** is applied, its links are neutralised (only `http(s)` and
  `mailto` survive, opened in a new tab), and nothing in it can reach the
  document, the outline or find. Their size is bounded: a note is parsed up
  to 50,000 characters and is shown as plain text when it would be too
  costly to render (`src/domain/renderCost.ts`), nesting stops at depth 3
  and repeats are cut, and an export expands at most 1,000,000 characters of
  embedded notes. The scanners and exporters are written to be linear-time
  and have scaling tests for crafted input; the one known exception, in
  Milkdown's serializer, is listed in `NEXT_STEPS.md`.
- **Math and diagrams.** Formulas are typeset by KaTeX with `trust` off, as
  MathML, from the TeX text only: a formula cannot produce a link, an image
  or a style. Mermaid runs at its `strict` security level with plain SVG
  labels, and its drawing is shown through an `<img>` (a `data:` URL), where
  nothing in it can run or reach the page. Both load only for a document that
  uses them. The math scanner and the diagram size are bounded (a formula is
  at most 1,000 characters inline and 20,000 displayed; a diagram at most
  20,000) and the scanner is linear with scaling tests. See
  `src/domain/math.ts`, `mathRender.ts` and `mermaidRender.ts`.
- **Files** are opened only when you pick or drop them, and written only
  through a handle you granted, after the browser's permission prompt.
- **Service worker** precaches the app's own build output (the user guide
  and the book included, so they open offline) and caches its lazy chunks
  on first use. It caches nothing from other origins.
- **Dependencies** are checked with `pnpm audit`. Dependency install scripts
  run only for packages listed in `package.json#pnpm.onlyBuiltDependencies`.

## CI and automation

- Every workflow's token has the least access it needs: CI and the
  performance trace can only read; the deploy can write Pages; the stats,
  mutation and book workflows can push to `main`, and the snapshot
  workflow can open a pull request.
- Checkouts keep no credentials, so `pnpm install` and builds run without
  push access. A workflow that commits adds the token in its commit step
  only.
- Third-party actions are pinned to a commit SHA; first-party
  `actions/*` are pinned to a major version. Dependabot
  (`.github/dependabot.yml`) proposes updates weekly, SHAs included.
- No workflow runs on `pull_request_target` or interpolates event text
  into a shell command.
