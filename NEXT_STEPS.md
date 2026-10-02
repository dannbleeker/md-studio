# Next steps

## Open decisions (from the project plan, section 11)

- [x] **Windows file association**: confirmed on an installed build —
      double-clicking a `.md` file opens it in MD Studio, and Save writes
      back to that file.
- [x] **Slate hex values**: confirmed (accent `#3d5170` light / `#93a8c6`
      dark, `src/styles/tokens.css`).
- [ ] **Field-level content** of the settings panel, start screen and command
      palette. The current fields are a minimal first cut.
- [ ] **Bundle budget**: pinned ~5% above the first build (codemirror ≈ 210 KB
      gz, milkdown ≈ 133 KB gz, react ≈ 67 KB gz, index ≈ 10 KB gz).
      Consider lazy-loading the visual editor or language-data if first-load
      size matters.
- [x] **Stryker**: added for `src/domain` (weekly `mutation.yml`).
- [ ] **Storybook** (tp-studio-only pattern): not included yet.

## Product

- [x] Recent files remember the file handle (IndexedDB): reopening reads
      the current file and Save writes back to it, also after a reload.
      Snapshot fallback when the file is gone or access is refused.
- [ ] Reduce visual-pane formatting normalization: tune
      `remarkStringifyOptionsCtx` (bullet marker, emphasis character) or
      detect the source document's style and keep it.
- [ ] Multiple open documents / tabs (as in tp-studio).
- [ ] Visual-pane toolbar or slash menu for formatting without shortcuts.
- [ ] Image handling: paste/drop images and choose where they are stored.
- [ ] Find and replace across both panes; outline/table-of-contents panel.
- [x] **Export**: HTML (light/dark/auto theme), PDF, DOCX and plain text,
      from the toolbar and the command palette. Never changes the linked file.
- [ ] Translate the UI: the catalogue is in `src/i18n/en.ts`.
- [ ] **Large-document performance** (found by the perf trace): on a
      ~3,000-line document, typing p95 is ~290 ms and text → visual sync
      ~560 ms, because every sync re-parses the whole document and that
      parse also runs between keystrokes. Re-parse only the changed blocks,
      or move parsing off the typing path. Re-baseline `perf-baseline.json`
      downwards when it lands.
- [ ] Link the book (EPUB/PDF in `public/`) from the app, e.g. an About
      dialog or the start screen.
- [ ] Strengthen domain tests where mutants survive: `fuzzy.ts` scores 41%
      (overall 72%; see the Mutation workflow's report artifact).
- [ ] A stats dashboard page reading `public/stats.json`, as in the
      sibling studios.

## Repo and CI

- [x] GitHub Pages: Actions source, custom domain, HTTPS enforced.
- [x] Workflows: `mutation.yml`, `perf-trace.yml`, `rebuild-book-pdf.yml`,
      `stats.yml`, `update-visual-snapshots.yml`; Deploy re-runs after the
      book and stats workflows commit.
- [x] Book build scripts (EPUB + PDF), pure Node, from mindmap-studio.
- [x] `Verify` stays **advisory** on `main` (decided): the `main` ruleset
      only blocks deletion and force pushes, because a ruleset requiring
      PRs or status checks rejects the Stats, Mutation and Rebuild-book
      bots' direct pushes (`github-actions[bot]` can't be a bypass actor).
- [x] Actions may create pull requests; **Update visual snapshots** works.
      Re-run it whenever a change alters the screenshots.
- [ ] Re-baseline `perf-baseline.json` from the first CI run of Perf trace
      (the current numbers come from a local container).
- [ ] Write the book chapters (currently outlines in `docs/guide/`).

## Finish up

- [ ] **Bug hunt**: a full pass over the app for correctness bugs (sync edge
      cases, file open/save flows, persistence, PWA update path, mobile
      layout), each fix landing with a regression test.
- [ ] **Security sweep**: review untrusted input paths (opened and dropped
      files, pasted HTML, links and raw HTML in Markdown, HTML export),
      the service worker's caching rules, dependencies (`pnpm audit`), and
      the CI workflows' permissions and bot pushes. Add a `SECURITY.md`.
- [ ] **Refactor**: tidy the code once features settle: remove duplication
      between the panes, revisit store shape and component boundaries, and
      keep `CLAUDE.md` in step with the result.
