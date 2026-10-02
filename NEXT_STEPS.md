# Next steps

## Open decisions (from the project plan, section 11)

- [x] **Windows file association**: confirmed on an installed build —
      double-clicking a `.md` file opens it in MD Studio, and Save writes
      back to that file.
- [x] **Slate hex values**: confirmed (accent `#3d5170` light / `#93a8c6`
      dark, `src/styles/tokens.css`).
- [x] **Field-level content**: Settings gained text size, line wrapping and
      line numbers (Markdown pane); Export remembers its last format and
      theme. The start screen can remove one recent file or clear the list,
      and opens a sample document. The command palette jumps to headings
      after a `#` ("Go to heading…").
- [x] **Bundle budget**: accepted as is. Both editors and React load at
      start-up because split view needs them at once, and the PWA serves
      everything from cache after the first visit, so only first visits pay
      (~430 KB gzip). Lazy-loading the editors would only help first visits
      that land on the start screen. The per-chunk gate in
      `bundle-budget.json` stays: every growth is re-pinned on purpose,
      with the reason in its comment.
- [x] **Stryker**: added for `src/domain` (weekly `mutation.yml`).
- [x] **Storybook**: decided against. Few components, most bound to the
      store; unit tests and Playwright visual snapshots cover the screens.
      Revisit if the component count grows or a designer joins.

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
- [x] Tabs, follow-ups: cursor and scroll kept per tab (in memory), drag
      or Shift+Arrow to reorder, same-name tabs labelled by first heading
      (else a number), a dropped file or recent snapshot already open is
      switched to (same name and opened content).
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
- [x] Re-baseline `perf-baseline.json` from the first CI run of Perf trace:
      typing 290 -> 40 ms, text-to-visual 175 -> 165, visual-sync 13 -> 8,
      visual-to-text 345 -> 280 (best-of-3 p95 on ubuntu-latest). The
      container numbers were far looser, typing by ~7x.
- [x] Write the book chapters: all 11 files drafted (~23,000 words) from
      the outlines, checked against the code, and given a humanizer pass.
      Drafts for the owner to edit; claims that couldn't be confirmed in
      the running app are worded cautiously.

## Finish up

- [ ] **Bug hunt**: a full pass over the app for correctness bugs (sync edge
      cases, file open/save flows, persistence, PWA update path, mobile
      layout), each fix landing with a regression test.
      Found while writing the book (verified in the export code):
      footnotes render in the visual pane but every export (HTML, PDF,
      DOCX, plain text, the book PDF) prints `[^1]` literally; PDF export
      drops nested list items and draws strikethrough as plain text; PDF
      replaces every image with its alt text, DOCX and plain text with
      `[alt]`; HTML drops embedded `data:` images; a tab left open does
      not notice that its file changed on disk (another device, another
      app), so saving it overwrites the newer version;
      dropping a `.md` file onto the Markdown pane both inserts its text
      there (CodeMirror's own drop) and opens it in a new tab
      (`useFileDrop`), which the book currently warns about.
- [ ] **Security sweep**: review untrusted input paths (opened and dropped
      files, pasted HTML, links and raw HTML in Markdown, HTML export),
      the service worker's caching rules, dependencies (`pnpm audit`), and
      the CI workflows' permissions and bot pushes. Add a `SECURITY.md`.
- [ ] **Refactor**: tidy the code once features settle: remove duplication
      between the panes, revisit store shape and component boundaries, and
      keep `CLAUDE.md` in step with the result.
