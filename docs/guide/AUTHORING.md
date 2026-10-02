# Authoring notes: *Writing in Plain Text*

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

- **Write for the practitioner.** Each chapter answers "how do I…" first, and
  "why does it work this way" second.
- **Match the app exactly.** Button labels, menu names and shortcuts are quoted
  as the UI shows them (the source of truth is `src/i18n/en.ts`). When the UI
  changes, update the chapter in the same pull request.
- **Short paragraphs, concrete examples.** Show Markdown source and its
  rendered result side by side where it helps.
- **Plain Markdown only.** The book should open cleanly in MD Studio itself.
  Avoid raw HTML.
- **Chapter 7 is the practice chapter.** It steps back from features to the
  discipline the tool supports, the role "Thinking with Maps" plays in
  mindmap-studio.

- **Write like a person.** No em or en dashes, straight quotes, section
  headings (H2 and below) in sentence case, prose rather than lists of bold
  labels, and no signposting or quotable one-liners. The
  `anthropic-skills:humanizer` skill is the checklist; run it over a chapter
  after a substantial edit.
- **Say only what the app does.** If a behaviour can't be confirmed in the
  code or the running app, leave it out or say plainly that it may differ.
  Known gaps (for example, exports that don't support footnotes yet) are
  stated as gaps, and the chapter is updated when the gap closes.

## Builds

`pnpm book` assembles the EPUB and PDF from these files
(`scripts/build-book-epub.mjs`, `scripts/build-book-pdf.mjs`; chapter order
in `scripts/lib/bookChapters.mjs`), following tp-studio and mindmap-studio.
`.github/workflows/rebuild-book-pdf.yml` rebuilds both whenever `docs/guide/`
changes on `main` and commits them to `public/`, so they deploy with the
site.
