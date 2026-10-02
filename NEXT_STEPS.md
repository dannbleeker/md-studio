# Next steps

## Open decisions (from the project plan, section 11)

- [ ] **Windows file association**: confirm in an installed build on Windows
      that `.md` double-click → MD Studio works via `file_handlers`, and that
      Save writes back to the launched file.
- [ ] **Slate hex values**: the tokens in `src/styles/tokens.css` are a
      first proposal (accent `#3d5170` light / `#93a8c6` dark). Cross-check
      against the sibling studios' themes.
- [ ] **Field-level content** of the settings panel, start screen and command
      palette. The current fields are a minimal first cut.
- [ ] **Bundle budget**: pinned ~5% above the first build (codemirror ≈ 210 KB
      gz, milkdown ≈ 133 KB gz, react ≈ 67 KB gz, index ≈ 10 KB gz).
      Consider lazy-loading the visual editor or language-data if first-load
      size matters.
- [ ] **Storybook + Stryker** (tp-studio-only pattern): not included yet.

## Product

- [ ] Recent files that remember the actual file handle (IndexedDB), so
      reopening on Windows writes back to the same file. Today, recents
      reopen a snapshot, and the first Save asks for a location.
- [ ] Reduce visual-pane formatting normalization: tune
      `remarkStringifyOptionsCtx` (bullet marker, emphasis character) or
      detect the source document's style and keep it.
- [ ] Multiple open documents / tabs (as in tp-studio).
- [ ] Visual-pane toolbar or slash menu for formatting without shortcuts.
- [ ] Image handling: paste/drop images and choose where they are stored.
- [ ] Find and replace across both panes; outline/table-of-contents panel.
- [ ] More export formats (PDF via print is there; DOCX, standalone HTML
      with a theme picker).
- [ ] Translate the UI: the catalogue is in `src/i18n/en.ts`.

## Repo and CI

- [ ] Set **Settings → Pages → Source: GitHub Actions** and the custom
      domain `md-studio.struktureretsundfornuft.dk` (enables TLS).
- [ ] Make the `Verify` check required on `main`.
- [ ] Add the remaining workflows once there is content to run them on:
      mutation.yml, perf-trace.yml (editor responsiveness),
      rebuild-book-pdf.yml, stats.yml, update-visual-snapshots.yml.
- [ ] Book build scripts (EPUB + PDF) as in tp-studio/mindmap-studio.
- [ ] Write the book chapters (currently outlines in `docs/guide/`).
