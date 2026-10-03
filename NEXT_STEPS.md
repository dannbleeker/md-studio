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

- [x] **Bug hunt**: a full pass over the app for correctness bugs, each
      fix landing with a regression test. Three hunters (sync/editors,
      files/tabs/PWA, export/UI) plus the bugs found while writing the
      book produced ~30 confirmed bugs, fixed in three PRs:
  - [x] PR 1, data loss and the book's five: Save recording unwritten
        text or patching the wrong tab after a switch; visual edits lost
        or written into another tab within the 200 ms debounce; a text
        edit right after a visual edit reverted; two windows overwriting
        each other's tabs (merge + `launch_handler: focus-existing`,
        handles kept while any saved tab uses them); storage full
        failing silently; recents merging a linked file with a
        same-named unlinked one; shortcuts firing behind dialogs, during
        IME composition, and Alt shortcuts dead on macOS; "Continue
        editing" missing when the active tab is blank; only the first
        of several dropped or launched files opening; file changes on
        disk not noticed; footnotes, nested lists, strikethrough and
        images in exports; a dropped `.md` pasted into the Markdown pane.
  - [x] PR 2, export and UI: DOCX task lists and list numbering,
        named HTML entities in DOCX/TXT/PDF, HTML table alignment, print
        and heading anchors, PDF quotes/table cells/long words, palette
        scroll, 360 px toolbar overflow, dark danger-button contrast,
        confirm-dialog focus.
  - [x] PR 3, sync engine edge cases: incremental update targeting a
        repeated block, reference definitions far from their use, fence
        and heading detection (inline triple backticks, info strings,
        lazy setext in lists, HTML blocks), reference links inlined by
        a visual edit, visual undo lost next to a text edit, find bar
        not refocusing.
- [x] **Security sweep**: untrusted input paths (opened and dropped
      files, pasted HTML, links and raw HTML in Markdown, HTML export,
      dashboard), service worker caching, `pnpm audit`, CI workflow
      permissions and bot pushes; `SECURITY.md` added. No path ran
      document script in the app. Fixed: dashboard link scheme, crash
      on deeply nested documents, CSP for app, dashboard and HTML
      export, no-referrer images, workflow tokens and action pins.
  - [x] Web images are blocked until **Load web images** is turned on
        in Settings.
  - [x] Nested-bracket documents (`[[[[…]]]]`, 50k deep) took tens of
        seconds to parse on every load, and 10k nested `![` crashed the
        Markdown pane's parser. A nesting guard (`domain/nesting.ts`) now
        keeps such documents away from both parsers.
- [x] **Bug hunt, part 4**: the unconfirmed suspects from parts 1–3
      checked; all confirmed ones fixed (stale chunks after a deploy,
      Save As onto an open file, `.txt` names, start screen after closing
      every tab, text-pane undo, `--text-faint` contrast, Word/PDF/plain
      text/HTML export details). By design: HTML export's `lang="en"`
      (the app's language is not the document's; revisit if documents get
      a language setting).
- [x] **Refactor**: behaviour-preserving tidy-up in three parts:
      reference-definition rules moved into `src/domain`; duplication
      inside the panes removed (one report path, one heading selector,
      one "edit from the store" spec); store and document actions tidied,
      dialog flags moved to `store/ui.ts`; `CLAUDE.md` brought up to date.
  - [x] VisualPane's sync state machine extracted into
        `editor/visualSync.ts`, with unit tests that pin its timing (150 ms
        debounce, 2.5 s reconcile, reconcile on focus, catch-up when
        shown, own edits taken as the truth, parse-failure recovery).

- [x] **Bug hunt, part 5**: 21 confirmed bugs fixed (see the changelog).
  - [x] YAML front matter shows in the visual pane as a metadata block
        (decided: shown, not hidden).
    - [x] The Markdown pane highlights it as YAML.
    - [x] Exports and print leave it out, with a setting (off by
          default) to include it as a code block.
  - [x] Confirmed and fixed: a key pressed right after clicking into the
        visual pane acted at the old cursor position (ProseMirror waits
        for `selectionchange`, which Chromium queues behind input).

