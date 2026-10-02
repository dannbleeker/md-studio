# Notices

MD Studio is an independent, open-source project by Dann Bleeker Pedersen.

## Licensing

- **Code** — Apache License 2.0 (`LICENSE`).
- **The practitioner book** in `docs/guide/` — CC BY-NC 4.0 (`LICENSE-BOOK`).

## Third-party software

MD Studio is built on these open-source libraries, each under its own license
(see `node_modules/<package>/LICENSE` after `pnpm install`):

| Library | Used for | License |
| --- | --- | --- |
| React | UI | MIT |
| Zustand | App state | MIT |
| CodeMirror 6 | Raw Markdown pane | MIT |
| Milkdown (ProseMirror, remark) | Visual pane | MIT |
| Workbox / vite-plugin-pwa | Offline support and updates | MIT |

## Names and marks

"Markdown" was created by John Gruber. "CommonMark" and "GitHub Flavored
Markdown" are specifications by their respective authors. They are referred to
here only to describe the file format MD Studio reads and writes; no
affiliation or endorsement is implied.
