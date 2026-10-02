# Changelog

## Unreleased — repo and CI

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
