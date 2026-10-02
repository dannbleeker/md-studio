# Authoring notes — *Writing in Plain Text*

How the book is structured and kept in sync with the app. For whoever edits a
chapter: Claude, a contributor, or future-Dann.

## Layout

```
docs/guide/
├── README.md        ← table of contents (public face)
├── AUTHORING.md     ← this file (maintainer face)
├── 00-foreword.md
├── 01-… through 07-…   ← one file per chapter
└── appendix-a-… through appendix-c-…
```

Each chapter is a self-contained Markdown file with one H1 (the title) and an
optional H3 directly below it (the subtitle). Cross-references use relative
links, e.g. `[Chapter 5](05-managing-files-locally.md)`.

## Conventions

- **Write for the practitioner.** Each chapter answers “how do I…” first, and
  “why does it work this way” second.
- **Match the app exactly.** Button labels, menu names and shortcuts are quoted
  as the UI shows them (the source of truth is `src/i18n/en.ts`). When the UI
  changes, update the chapter in the same pull request.
- **Short paragraphs, concrete examples.** Show Markdown source and its
  rendered result side by side where it helps.
- **Plain Markdown only.** The book should open cleanly in MD Studio itself.
  Avoid raw HTML.
- **Chapter 7 is the practice chapter.** It steps back from features to the
  discipline the tool supports, the role “Thinking with Maps” plays in
  mindmap-studio.

## Builds (planned)

EPUB and PDF will be assembled from these files by `scripts/build-book-*.mjs`,
following tp-studio and mindmap-studio, and rebuilt by
`.github/workflows/rebuild-book-pdf.yml` whenever `docs/guide/` changes. The
outputs will be written to `public/` so they deploy with the site.
