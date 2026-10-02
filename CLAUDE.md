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
  i18n/        en.ts message catalogue + t()
  styles/      tokens.css (slate theme), app.css, editor.css; mobile.css
e2e/           Playwright specs against the built app
test/          Vitest setup + stubs
docs/guide/    the practitioner book (CC BY-NC 4.0)
```

## How sync works (read before touching the editors)

- `store.doc.markdown` is the single source of truth. Each change records its
  `source` (`'text' | 'visual' | 'load'`).
- **Text → visual:** CodeMirror's update listener calls
  `setMarkdown(md, 'text')`. VisualPane debounces 150 ms, re-parses, and
  applies only the changed top-level range with `addToHistory: false`.
  Milkdown's listener skips such transactions, so nothing echoes back and the
  user's source formatting is never rewritten by a text-side edit.
- **Visual → text:** Milkdown's `markdownUpdated` (debounced 200 ms) calls
  `setMarkdown(md, 'visual')`. TextPane applies a minimal single-range diff
  (`domain/textDiff.ts`) tagged with a `fromStore` annotation, so the cursor
  and scroll position survive.
- **Known trade-off:** an edit in the visual pane re-serializes the whole
  document through remark, which can normalize formatting elsewhere (bullet
  markers, emphasis characters, setext → ATX headings).
- **Linked scroll:** both panes report heading offsets; `domain/scrollMap.ts`
  turns a scroll position into (section, fraction) and back. Only the pane
  the pointer or focus is in drives the other.
- Both panes stay mounted in every view mode; text-only and visual-only just
  hide one with `hidden`.

## Conventions

- Domain-first: logic lands in `src/domain/` with a co-located test, then
  store, then UI.
- No `any`. Prefer `unknown` + narrowing.
- Comments explain *why*, not *what*.
- User-facing copy goes through `src/i18n/en.ts`.
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
  compares with `perf-baseline.json`.
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
