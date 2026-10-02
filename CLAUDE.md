# MD Studio — Claude Code project primer

Read at session start so project shape doesn't need re-deriving. Per-change
detail lives in `CHANGELOG.md`; open work in `NEXT_STEPS.md`.

## Response style

Always use the `anthropic-skills:caveman` skill (level **full**) for chat
replies in this repo, from the first reply of every session: invoke it at
session start if it isn't already active. Code, commit messages, PR text and
docs stay in normal prose, as the skill itself specifies. Turn off only when
the user says "stop caveman" or "normal mode".

## What this project is

A local-first Markdown editor PWA. A raw Markdown pane (CodeMirror 6) and a
visual pane (Milkdown, i.e. ProseMirror + remark) sit side by side and edit
**one** document. No server, no auth. State is in `localStorage`; real files
go through the File System Access API on Chromium, with download/upload
fallbacks elsewhere. Deployed to GitHub Pages at
md-studio.struktureretsundfornuft.dk.

Owner: Dann Bleeker Pedersen. Sibling repos: tp-studio, mindmap-studio,
mece-studio. Match their conventions when in doubt.

## Stack

React 19 · Vite 8 · TypeScript strict (`exactOptionalPropertyTypes`,
`noUncheckedIndexedAccess`) · Zustand 5 · CodeMirror 6 · Milkdown 7 · Vitest
(jsdom) · Playwright · Biome 2 · knip · vite-plugin-pwa · pnpm 10 / Node 22.

## Directory shape

```
src/
  domain/      pure logic, no React: document model, heading detection,
               scroll anchor mapping, minimal text diff, fuzzy match
  store/       Zustand: index.ts (document + UI state, persistence
               subscription), settings.ts, ui.ts (toasts, confirm)
  services/    side effects: storage.ts (localStorage), fileSystem.ts
               (File System Access + fallbacks), documentActions.ts
  components/  editor/ (TextPane, VisualPane, SplitView) · start/ ·
               settings/ · command-palette/ · toolbar/ · toast/ · ui/
  hooks/       useTheme, useIsMobile, useShortcuts, useFileDrop
  pwa/         service-worker registration, launchQueue (Windows file open)
  i18n/        en.ts message catalogue (reference), locales.ts registry +
               resolveLocale, index.ts t() / setLocale / dateTimeFormat
  styles/      tokens.css (slate theme), app.css, editor.css; mobile.css
e2e/           Playwright specs against the built app
test/          Vitest setup + stubs
docs/guide/    the practitioner book (CC BY-NC 4.0)
```

## How sync works (read before touching the editors)

- `store.doc.markdown` is the single source of truth. Each change records its
  `source` (`'text' | 'visual' | 'load'`).
- **Text → visual:** CodeMirror's update listener calls
  `setMarkdown(md, 'text')`. VisualPane debounces 150 ms, then
  `applyIncremental` (editor/applyMarkdown.ts) re-parses only the changed
  blocks plus one neighbour each side and swaps just those top-level nodes,
  all with `addToHistory: false`. Anything it can't prove equal to a full
  parse (loose lists, footnotes, reference definitions, a changed run that
  appears more than once) falls back to `applyFull`, which itself replaces
  only the top-level blocks that differ (compared ignoring heading ids).
  A full parse also runs 2.5 s after the last incremental update, or as
  soon as the visual pane is focused, so the panes can't drift. Hidden in text-only view,
  the visual pane skips updates and catches up when shown.
  Milkdown's listener skips such transactions, so nothing echoes back and the
  user's source formatting is never rewritten by a text-side edit.
- **Visual → text:** Milkdown's `markdownUpdated` (debounced 200 ms) calls
  `setMarkdown(md, 'visual')`, but only for user edits (an `unreported`
  flag set by a ProseMirror plugin). `store/flush.ts` lets anything that
  reads or replaces the document (save, tab switch, close, page hide,
  focusing the text pane) report a pending visual edit first, so it is
  never lost or written into another tab. TextPane applies a minimal single-range diff
  (`domain/textDiff.ts`) tagged with a `fromStore` annotation, so the cursor
  and scroll position survive.
- **Source style is kept:** Milkdown re-serializes the whole document on
  every visual edit; `keepSourceStyle` (editor/) merges that with the old
  source via `domain/preserveBlocks.ts`, keeping the original text of every
  unchanged leading/trailing block. Only the edited blocks take the
  serializer's style. Reference definitions are compared in scope and kept
  (the serializer inlines reference links). The merge is verified (edited region + neighbours,
  or the whole document when link reference definitions exist) and falls
  back to the serializer output if it would change meaning.
- **Linked scroll:** both panes report heading offsets; `domain/scrollMap.ts`
  turns a scroll position into (section, fraction) and back. Only the pane
  the pointer or focus is in drives the other.
- Both panes stay mounted in every view mode; text-only and visual-only just
  hide one with `hidden`.
- **Tabs:** `store.tabs` lists open documents (`domain/tabs.ts`), but the
  active tab's live state stays in `doc` / `fileHandle` / `handleId`, so
  the editors know nothing about tabs. Switching writes the active state
  back (`syncedTabs`) and shows the target as a load (`source: 'load'`,
  `loadId` + 1). Persisted as `md-studio:tabs:v1`. Per-tab cursor and
  scroll live in memory: each pane registers a reader with
  `store/viewState.ts`, the store captures them when leaving a tab, and
  the panes apply `restoreView` on the next load.

## Conventions

- Domain-first: logic lands in `src/domain/` with a co-located test, then
  store, then UI.
- No `any`. Prefer `unknown` + narrowing.
- Comments explain *why*, not *what*.
- User-facing copy goes through `t()` with keys in `src/i18n/en.ts`; every
  other locale must cover every key (type `Messages`). Format dates with
  `dateTimeFormat()`, not a bare `Intl.DateTimeFormat`.
- `pnpm verify` must be green before pushing. It is the CI gate.
- Bundle growth: re-pin `bundle-budget.json` deliberately and say why.

## Commands

`pnpm dev` · `pnpm test` · `pnpm test:e2e` · `pnpm lint:fix` · `pnpm verify`.
For Playwright with a preinstalled Chromium, set `PLAYWRIGHT_CHROMIUM_PATH`.

- `pnpm book`: rebuild `public/Writing-in-Plain-Text.{epub,pdf}` from
  `docs/guide/` (chapter order in `scripts/lib/bookChapters.mjs`).
- `pnpm mutation`: Stryker over `src/domain` (~20 s); writes
  `reports/mutation/` and the committed `score.json`.
- `PERF_TRACE=1 pnpm exec playwright test e2e/perf-trace.spec.ts`: editor
  latency on a large document; `node scripts/check-perf-regression.mjs`
  compares with `perf-baseline.json`. Sync code records user-timing
  measures (`services/perfMarks.ts`) only when `window.__MD_STUDIO_PERF__`
  is set.
- `REFRESH_VISUAL_SNAPSHOTS=1 pnpm exec playwright test e2e/visual.spec.ts
  --update-snapshots`: only meaningful on the CI runner; use the
  "Update visual snapshots" workflow instead.

## Workflows

`ci.yml` runs `pnpm verify` on every push and PR. `deploy-pages.yml` deploys
`main` (and re-runs after the bot commits book or stats files). Scheduled or
manual: `stats.yml` (every push to main + weekly), `rebuild-book-pdf.yml`
(when `docs/guide/` changes), `mutation.yml` (weekly), `perf-trace.yml`
(weekly), `update-visual-snapshots.yml` (manual, opens a PR). The bot
workflows commit generated files to `main` with `[skip ci]`.
