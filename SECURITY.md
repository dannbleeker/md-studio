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
  app's own origin, no plugins, no frames, no form posts and no `<base>`
  rewriting. Even content that reached the page as HTML could not run
  script. It is set in `vite.config.ts`.
- **Markdown is never rendered as HTML in the app.** Both panes are editors:
  CodeMirror shows source text, and Milkdown shows raw HTML in a document as
  text, not as markup.
- **HTML export** escapes raw HTML in the document, keeps only `http:`,
  `https:`, `mailto:`, `tel:`, relative and in-page links, and embeds only
  raster `data:` images (PNG, JPEG, GIF, WebP). See
  `src/services/export/html.ts`.
- **No network requests of its own.** Exports read pasted images and images
  next to the file; they never fetch web images. The only network traffic
  is the app's own files, and web images that a document links to (shown in
  the visual pane, as any Markdown preview does).
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
