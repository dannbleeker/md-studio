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
- [x] Visual-pane edits keep the source style of every block they don't
      touch (`domain/preserveBlocks.ts`); only edited blocks are rewritten.
- [x] Multiple open documents in tabs: New/Open/Recent/drop open a tab
      (an untouched blank tab is reused), a file already open is switched
      to, closing a tab with unsaved changes asks, all tabs survive a
      reload. Tab bar shows from two tabs; Alt+W, Alt+PageUp/PageDown.
- [ ] Tabs, later: keep cursor and scroll per tab (they reset on switch),
      drag to reorder, tell apart two tabs with the same file name.
- [x] Visual-pane format toolbar (text style, inline marks, link, lists, quote,
      code block, table, rule) with active-state buttons.
- [x] Paste/drop images: saved in `images/` next to the document (Chromium,
      folder chosen once), otherwise shrunk and embedded.
- [x] Find and replace across both panes; outline panel.
- [x] **Export**: HTML (light/dark/auto theme), PDF, DOCX and plain text,
      from the toolbar and the command palette. Never changes the linked file.
- [x] Locale support: `src/i18n/locales.ts` registry, language chosen from
      the browser or a `language` setting, dates in the UI language,
      `<html lang>` kept in step. English only for now.
- [ ] Add a second UI language (e.g. Danish): copy `en.ts` to `xx.ts`
      typed as `Messages`, register it in `locales.ts`. The settings
      language picker appears automatically.
- [x] **Large-document performance**: the visual pane re-parses only the
      changed blocks (with a full parse as fallback and once while idle) and
      skips updates while hidden. On ~3,000 lines, text → visual p95 went
      560 → 168 ms and per-update work ~260 → 12 ms. `perf-baseline.json`
      re-baselined.
- [x] Link the book (EPUB/PDF in `public/`) from the app: start screen
      links and command palette entries.
- [x] Strengthen domain tests where mutants survive: `fuzzy.ts` 41% -> 91%
      (overall `src/domain` 84% of 579 mutants).
- [x] A stats dashboard page (`/dashboard.html`) reading
      `public/stats.json` and `stats-history.json`, plus live workflow runs
      and commits from the GitHub API. No chart library: trends are inline
      SVG.

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
