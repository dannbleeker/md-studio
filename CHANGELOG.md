# Changelog

## Unreleased

- **A simpler interface.** Nothing is gone; it is where you look for it.
  - **Toolbar:** the file, then Edit (in Read view) or Save and Read (while
    editing). A layout switch while editing (Split, Markdown, Visual; "Text"
    is now called Markdown). Two small icons for the folder panel and the
    outline, and a **☰** menu with New document, Open file, Open folder,
    Save as, Export, Commands, Keyboard shortcuts, Settings and the user
    guide. Linked scroll left the toolbar (it is in Settings and the
    palette). On a phone the toolbar keeps only the file, Edit or Read, Save
    and the menu; the layouts, panels, Back and Forward move into the menu.
  - **Settings** come in sections (Appearance, Reading, Editing) with a line
    of explanation where a name isn't enough; vault, privacy, export and
    language settings fold away under **More settings**.
  - **Start screen:** Open file and Open folder lead, with a hint each;
    New document and the sample are links under them; the guide, the book
    and the dashboard fold away under **Help and the book**.
  - **Format toolbar:** text style, bold, italic, link, bulleted list and
    quote show; **⋯** (More formatting) shows the rest. Strikethrough or
    inline code already on the selection keep them in view.
  - **Keyboard shortcuts:** **?** (whenever no text is being typed, in any
    view) or the menu lists the app's shortcuts and Read view's keys.
  - **A first-run tip** in Read view says how to start editing and where
    every command is, until dismissed or until Edit is used.

- **Files open in Read view.** Files opened from disk, by drop, from the
  recent list, from the folder or by a link now open in Read view, and so
  does the app. A new document opens for editing. In Read view an **Edit**
  button (where Save is while editing) switches to the editing layout used
  last (split, Markdown or visual), which MD Studio remembers. Settings saved
  before this change move to it once; **Open files in Read view** and
  **Default view mode** in Settings change it back, and stay as chosen.
  The "Read-only" badge is gone: the Edit button says the same.

- **Keyboard and links, fixed.** Space presses a focused fold or copy button
  in Read view; Ctrl shortcuts work on Russian, Greek and AZERTY layouts;
  the image lightbox blocks the app's keys and swipes like a dialog; one
  Escape in the find bar or a link preview keeps focus mode. Back and
  Forward move only once a note opens, and step past one that cannot be.
  A link clicked in one tab never opens from another, and its preview no
  longer says "missing" while the vault is scanned. Folder mode follows
  renames made outside the app. A transparent PNG embedded on Safari keeps
  its transparency, and a drop of several images asks about a folder once.
- **Read view, fixed.** Folds stay with their own document (they used to
  carry over to the next tab or note, and shift after an edit) and keep
  keyboard focus when toggled; a #link into a folded section opens it.
  Hover cards stay when the pointer comes back to their link and no longer
  reopen after it has left. Diagrams follow a theme change, and the image
  lightbox keeps Tab inside it.
- **Coverage gate in CI.** `pnpm verify` now measures unit test coverage and
  fails when it drops below floors set at today's level (overall lines 79 %,
  statements 78 %, functions 69 %, branches 75 %; stricter floors for
  `src/domain` and `src/store`). Tests with time ceilings are tagged `stress`
  and run uninstrumented in a separate `pnpm test:stress` step.
- **Links to other notes open on the first click.** Clicking a link to a note
  or file when no attachments folder is chosen (or its permission has lapsed)
  now opens the folder picker (or the permission prompt) from the click and
  then follows the link, instead of only showing a toast. A link clicked while
  the folder is still being scanned waits for the scan.
- **Notes shown inside notes.** A transcluded note (`![[Note]]`) now typesets
  its formulas, frames its callouts and draws its mermaid diagrams, as the
  note does on its own. Its text still goes through the allow-list; the
  formula, callout and diagram steps add only elements this app creates.
- **Phone layout.** Below 720px the folder and outline panels slide over the
  document as a drawer with a backdrop, and close when a note or heading is
  picked. Rows, toolbar buttons and tabs get larger touch targets (also on
  any coarse pointer). In Read view a quick horizontal swipe goes back or
  forward through opened notes (`domain/swipe.ts`, ignored over code, tables,
  formulas and diagrams, or while text is selected).
- **Folder tree is a real tree.** The folder panel is an ARIA tree
  (`role="tree"`, levels, expanded and selected states) with one row in the tab
  order. Up/Down, Home/End, Right (open, then enter), Left (close, then climb)
  and Enter/Space work as in a file manager; the rules are pure and tested in
  `domain/treeNav.ts`.
- **Links to files.** In Read view (or Ctrl+click while editing) a link to a
  file that is not a note, `[report](report.pdf)` or `[[report.pdf]]`, finds
  it in the vault folder and opens PDFs, pictures, audio and video in a new
  tab. Anything else, including SVG and HTML (which would run with the app's
  own origin), is saved instead (`fileOpenMode`). A missing file or an
  unchosen folder says so.
- **Reading keys help.** `?` in Read view (or "Reading keyboard shortcuts" in
  the palette) lists the plain-letter keys. The list is built from the same
  table that runs the keys (`readKeyBindings`), so it cannot drift; the dialog
  is a lazy chunk.
- **Formulas and diagrams in exports.** HTML keeps formulas as MathML and
  embeds Mermaid diagrams as inline SVG pictures; Word gets both as PNG
  pictures; PDF draws display formulas and diagrams as pictures (inline
  formulas stay TeX text, as pictures cannot flow in its text layout). Plain
  text is unchanged. The work is a lazy chunk used only when the document
  contains `$` or a mermaid fence (`domain/typesetPlan.ts`,
  `services/export/typeset.ts`); a formula or diagram that fails to draw
  keeps its source text.
- **Math and diagrams.** `$x^2$` and `$$...$$` are typeset (KaTeX, as MathML,
  loaded on first use) in every view; the formula stays one lossless unit
  holding its exact source (`domain/math.ts`, `mathPlaceholder.ts`,
  `mathNode.ts`). Pandoc's rules keep prices as text. A ```mermaid block is
  drawn as a diagram in Read view (Mermaid, strict security level, shown
  through an `<img>`), click for full size. Mermaid and its dependencies are
  lazy and left out of the precache (`diagram-` chunks, cached on first use).
  The `index` and `i18n` budgets are re-pinned for the reader, folder mode and
  math code on the start-up path; the Read view extras are now a lazy chunk.
- **Folder mode.** "Open folder" (start screen, palette, or the Folder button)
  picks a folder of notes and shows them as a tree with a filter box, beside
  the editors. The open note is highlighted; "Linked from" lists the notes of
  the folder that link to it (wikilinks and Markdown links, code ignored).
  Notes opened from the folder find it as their attachments folder, so links
  and images resolve with no further prompt. Following a link or opening from
  the tree is recorded: Back and Forward buttons (and Alt+Left / Alt+Right)
  step through those notes. The folder is remembered; after a restart the
  panel asks once for access again. Needs a browser with the File System
  Access API.
- **Read view as a reader.** An "Open files in Read view" setting (off by
  default) shows files opened from disk, by drop or from the recent list in
  Read view. Where the reader stopped is remembered per file across sessions.
  Reading controls (the Aa button): width, typeface, line spacing and a sepia
  page. Focus mode (Focus button, `f`, Escape to leave) hides everything but
  the page. Plain keys read the page: `j`/`k` and Space scroll, `g`/`G` jump
  to the ends, `[`/`]` step between headings, `/` opens Find. Hovering a link
  to a note shows the start of that note, and a footnote reference shows the
  footnote. Headings get a "copy a link to this section" button. YAML front
  matter shows as a card (title, tags, fields). Obsidian callouts
  (`> [!warning] Title`) get a frame, a colour and a title.
- **Read view grows up.** Links to other notes open in a tab: relative
  `[text](other.md)` links and `[[wikilinks]]` (through the attachments
  folder, with a clear message when it is not chosen). Headings fold, code
  blocks get a Copy button and an image opens full size on click (Escape
  closes). The page is set in a narrower column with a hidden caret, a
  "Read-only" badge replaces Save in the toolbar, and Save leaves the command
  palette (Save as stays). The same heading stays on top when switching in
  and out of Read view, and a saved file that changes on disk reloads on its
  own every few seconds while reading. Outline and "Go to heading" unfold
  a fold that hides their target.
- **Read view can't be edited through Find.** Ctrl+H in Read view opens the
  find bar without the replace row (and its toggle is hidden), and replace
  actions are ignored there. Read view also turns spell-check off in the
  visual pane.
- **Read view, and links that open.** A fourth view (Ctrl+4, *View: read* in
  the palette) shows only the visual pane, not editable, and a click on a link
  opens it: web, mail and phone links in a new tab, `#heading` links scroll to
  the heading. While editing, Ctrl/Cmd+click does the same. Relative paths and
  `javascript:` links do nothing (`domain/linkTarget.ts`).
- **No scrollbar in the tab bar.** The active tab's `-1px` overlap made the
  bar overflow vertically, which `overflow-x: auto` turned into a scrollbar.
  The bar's bottom line is now an inset shadow.
- **Mutation run works again.** The weekly `mutation.yml` job stopped at
  Stryker's first test run since the embeds landed: instrumented code is
  several times slower, and the speed tests (huge inputs, absolute time
  ceilings) failed there, which aborts the job. Those tests are now tagged
  `stress` and `vitest.mutation.config.ts` leaves them out; the normal test
  run still runs every one of them.
- **The mutation score is pushed even when main has moved.** The job takes
  about 14 minutes and the Stats bot commits to `main` after every push, so
  the final `git push` was rejected and the run failed after finishing. It now
  rebases onto `main` and retries, like `stats.yml`.
- **Vitest stays on 4.1.** The 5.0 update briefly merged, but Stryker 10 (the
  latest) kills no mutants under vitest 5 (its test-name filter no longer
  matches, so the run reports a score of 0). `vitest` and `@vitest/coverage-v8`
  are back at 4.1.11 and Dependabot skips vitest majors until Stryker catches
  up.
- **Long paragraphs serialize in linear time.** Milkdown's serializer
  rebuilt a paragraph's child list with `concat` per child, so every visual
  edit took time quadratic in the number of inline nodes: 10,000 `[[a]] `
  chips took 1.6 s, and a paragraph of many `a *b* ` marks was hit too.
  `patches/@milkdown__transformer.patch` (`patchedDependencies`) appends
  into one array instead, and the embed text handler finds a node's position
  with a map instead of an `indexOf` per text node (the next quadratic term
  once the merge was fixed); the output is unchanged. `serializerScaling.test.ts`
  compares CPU time for twice the input with the input (no absolute limits)
  for both shapes, and fails without the patch.
- **Dependabot also watches the npm packages.** `.github/dependabot.yml` gets
  a weekly npm entry next to the one for GitHub Actions. Packages that must
  move together are grouped (Milkdown with its ProseMirror and remark
  packages, CodeMirror with Lezer, React, Vitest with its coverage package,
  Stryker, Playwright), every other minor and patch update is one pull
  request, and a new major version is its own. A release is not adopted until
  it is a week old (security updates are exempt). Playwright and Milkdown stay
  in groups of their own because a bump can shift the visual snapshots or stop
  the serializer patch applying.
- **Obsidian notes: embeds, wikilinks and a vault attachment folder.**
  Notes written in Obsidian open with their pictures, PDFs, audio and
  embedded notes shown, and editing never touches the syntax.
  - Embeds and wikilinks: `![[a.png]]` and `[[Note|alias]]` are one
    lossless inline node (`editor/embedNode.ts`, scanner in
    `domain/embeds.ts`), so a visual edit next to one writes the token
    back byte for byte. Before, the paragraph was rewritten with escaped
    brackets and the token was lost. Wikilinks show as inert chips;
    clicking does nothing yet.
  - Sizes and alt text: `![[a.png|300]]`, `|300x200`, `|alt|300`, and
    `![alt|300](p.png)` in Markdown images (the alt text itself is kept);
    pdf `#page=3&height=400`; `<my file.png>` links; percent-encoded
    links are decoded per segment, with the literal path as a fallback.
  - Safe parsing: `remarkEmbeds` converts a text node only after it
    checks the tokens against the source, so any doubt leaves the text
    as it was. `editor/frontMatter.ts` now rebases the positions it
    rebuilds, which that check needs. Code, front matter and escaped
    forms are never read as embeds.
  - Vault attachment folder (`services/attachments.ts`): reuses the
    existing `dir:` key in IndexedDB, so images folders chosen before
    keep working. Reads a subset of `.obsidian/app.json`
    (`attachmentFolderPath`, `useMarkdownLinks`, `newLinkFormat`; bad
    JSON gives the defaults). Resolution (`domain/vaultIndex.ts`) follows
    Obsidian: exact path, path suffix, vault-wide file name, then note
    relative; the nearest file wins when names collide, with a tooltip.
    Markdown links keep resolving note-relative first. The scan runs in
    the background with a progressive index (cap 50,000 files), and bare
    names resolve at once through direct lookups; until the index is
    complete a miss shows the loading chip, never Not found. A known
    root is adopted without asking, preferring the vault root.
  - Banner and notices: a bar above the editor when a note has embeds it
    cannot show (choose the folder, allow access after a reload, save the
    document first, a not-found variant that asks for the vault root);
    non-Chromium browsers get a notice and labelled placeholders.
    Dismissible per tab. Embeds inside code do not count.
  - Other kinds: pdf (iframe, `#page`, height; the viewer was checked in a
    headed browser under the CSP), audio, video and any other file (chip
    with Open) load lazily, only once they scroll into view; hidden panes
    load nothing.
  - Note transclusion: `![[Note]]`, `#Heading`, `#^block` and same-note
    forms render read-only inside the visual pane (depth 3, cycle-safe by
    note and section, cached, links neutralised). They never enter the
    document, the outline, find or the scroll map.
  - Paste and drop: any file type is saved to the folder the vault
    configures and linked in the chosen style. Names follow Obsidian
    (`Pasted image 20261012093000.png`; dropped files keep their name,
    collisions get a number). Each failure has its own reason: needs
    permission, no folder, unsupported browser, failed. Images fall back
    to data URLs with a toast; other files insert nothing.
  - Settings: **Link style** (wikilinks, Markdown links, auto) and
    **Attachment location** (vault settings, or `images` beside the
    note). Auto without a `.obsidian` folder keeps the old behaviour, so
    existing documents see no change. Command palette: **Choose
    attachment folder…** and **Rescan attachments**.
  - Export (`domain/embedExport.ts`): sized images in HTML, Word and PDF;
    pdf, audio, video and other files become labelled lines; note
    embeds expand as quotes, also inside lists and quotes, and collapse
    to a labelled line in table cells or mid-paragraph; unresolved
    embeds and wikilinks become plain text. Fixes: HTML export now
    honours Load web images (it leaked requests to the image's server),
    `//host/x.png` is no longer taken for a relative path, and a tab
    switch during an export no longer reads the other document's folder.
    webp, avif, bmp and svg are rasterised for Word and PDF.
  - Markdown images re-resolve after a tab switch (two tabs with the
    same `images/x.png` in different folders showed the first one's).
  - The CSP gains `media-src blob:` and `frame-src blob:`
    (`vite.config.ts`, pinned by a test).
  - Tests: the unit suite grew to over 1,000 tests, plus two Playwright specs
    (`e2e/embeds.spec.ts`, `e2e/embeds-vault.spec.ts`).
  - Bundle: `index` re-pinned 32.5 -> 37.0 KB (measured 34.4 KB, +3.1 KB).
    Total eager JS grew about 7 KB gzip, because shared code also moved
    into three small start-up chunks (`embeds` 3.0 KB, `frontMatter`
    0.6 KB, `fences` 0.2 KB), which now have their own budget entries. The
    attachments service, vault index, transclusion, media and note
    renderers, banner and export expansion are lazy chunks.

- **Obsidian embeds, post-review bug hunt**: 77 reproduced defects fixed
  (a handful mitigated or documented, listed last), each with a regression
  test that failed first.
  - Visual pane and embeds (`editor/embedNode.ts`, `imageSupport.ts`):
    a token never ends up hidden in code. Code blocks (toolbar, `` ``` ``
    shortcut, joins) and inline code turn the chip back into its text; a
    link mark is dropped; inserting an embed in marked text keeps only
    emphasis, strong and strike-through. Tokens after an even number of
    backslashes, or written with an entity, are read as embeds and survive
    a round trip. Documents without tokens serialize exactly as before the
    feature, so no backslashes are added to unrelated text. Plain-text copy
    includes tokens. Find, Replace and Replace All in the visual pane see
    the text of embed and wikilink tokens.
  - Review follow-ups: a literal `!` from `\![[a.png]]`, `&#33;` or `&excl;`
    stays text before the link; a chip with a bare pipe is written with the
    pipe escaped inside a table cell; text that stops being code (block back
    to a paragraph, inline code toggled off) gets its tokens back as chips; a
    token beside an escaped address or URL (`a\@b.co`) is still read; the
    visual pane keeps at most 200 transcluded notes on screen
    (`MAX_LIVE_TRANSCLUSIONS`, a labelled placeholder beyond that); block id
    hiding no longer walks the note for every indented line.
  - Scanner (`domain/codeRegions.ts`, new, shared by `embeds.ts`,
    `embedLinks.ts`, export and the banner): fences and indented code
    inside list items, quotes and footnotes, fences opened on a bullet
    line, code spans that wrap over a line break and escaped backticks
    are read as CommonMark does. `\![[a.png]]` is a literal `!` and a
    plain wikilink; a size written `\|300` in a table loses the backslash.
    Root-absolute, backslash, anchor-only and empty image destinations are
    not local files. The `embeds` chunk grew to about 4.3 KB gzip.
  - Attachments service: a file saved during a rescan stays in the index;
    lookups follow rescans (nearest file, ambiguity, first-scan answers);
    links written before the index is complete use the full path; a failed
    write cleans up; a folder that cannot be listed keeps its old entries
    and is retried; Save As onto a document with a folder keeps that
    folder; the truncated-index toast shows once per session; a
    configuration that cannot be read refuses the save instead of using
    `images`; a lapsed permission no longer empties the index on refocus;
    notes over 2 MB say so; the image-drop toast points at Allow access.
    Dropped images without an extension get one; relative-style wikilinks
    get `./`; the vault index and web-image checks are linear.
  - Rendering and print: transcluded notes keep list start numbers, task
    state, alignment, footnotes and `|size`; nested list items and block
    ids are cut correctly; `^id` markers are hidden; a Markdown image link
    to a PDF, audio or video is an embed; the app's Open links work inside
    a note; web-image changes and a late host path redraw a drawn note; a
    rendered note is cached by content, not file date; blocked images never
    get a live `src`. Printing from text-only view first brings the hidden
    visual pane up to the open tab's Markdown (`store/flush.ts`,
    `visualSync.prepareForPrint`; also on `beforeprint`). Ctrl+P and the Print command wait for every embed
    and picture to load; ambiguity tooltips cover PDF, audio, video, file
    chips and notes.
  - Export: links labelled `[[1]]` stay links; notes embedded from another
    folder keep their images; embedded notes isolate their reference
    definitions and footnotes; wikilink text is escaped; web-address
    embeds follow Load web images; `./` guards a colon in a path; a missing
    note is labelled a missing note; the PDF character warning looks at
    expanded text; HTML keeps webp, avif, bmp and svg as they are; a
    withheld image is a dashed frame; a document with only plain wikilinks
    no longer waits for the vault.
  - Banner and palette: same-note and web-address embeds, quoted fences and
    empty or anchor-only images no longer raise the banner; *Rescan
    attachments* and *Choose attachment folder…* say why when they cannot
    run. Docs: first-image wording (chapter 4), link-label token gap,
    code, web-embed, size-limit and print notes. Unused key
    `attachment.folderRoot` and `attachment.imageFallback` removed.
  - Bounded work: block-id hiding and heading-link stripping are linear
    (an indented `^id` line no longer walks the note, a heading of brackets
    no longer rescans itself); `findMarkdownImages` finds each `![` pair in
    one pass and gives a line a total scan budget; a transcluded note is
    parsed up to 50,000 characters (was 200,000) and shows its opening text
    as plain text when a paragraph holds over 1,000 `*`, `_` or `~`, a list
    is nested 32 levels or more, or a table row has over 256 cells
    (`domain/renderCost.ts`); Ctrl+P and Print also wait for embeds whose
    load has started and for the first vault scan (up to 10 s). HTML export
    reads a plain image link only when the vault classes the file as an
    image (and under 32 MB), and keeps a bmp or svg as it is only when its
    bytes are a real bitmap header or a closed `<svg>` document.
  - Mitigated, not fully fixed: the HTML export still caps pictures at 5 MB
    each and 25 MB in all (now announced in a toast); embedded notes in an
    export are capped at about 1,000,000 characters (was 5,000,000) with
    no toast on truncation; object URLs are reclaimed oldest-first with
    other documents' first (a single document with over 4,000 distinct
    embeds loses its oldest); the banner's not-found count can outlast a
    corrected typo until a rescan or reload.
  - Super-linear work, round two: the HTML export's SVG check no longer
    backtracks exponentially on a run of `<!---->` comments;
    `expandEmbeds` reads each neighbour line once per token line, bounds
    the quote loop, and joins table-cell lines in one pass; a note embedded
    many times is analysed once (`transclusion.ts` keeps the last four
    analyses and each heading's plain text); `renderCost.ts` also refuses
    notes with over 1,500 nested, quoted or setext lines in one container
    run, or more than 32 markers on one line; converting a block with
    thousands of chips to code and back makes one replace per textblock and
    maps the caret through the fixes; the attachment folder is no longer
    trimmed with a quadratic regex; footnote references are found by a scan
    that skips a failed run of `[^`.
  - A `\|` in a table cell followed by a mark (`| x \| y **z** |`) keeps its
    escape when a visual edit rewrites the row; the row used to gain a cell.
  - Click selection (`editor/clickSelection.ts`): the visual pane adopts the
    click's selection one task after it gains focus. ProseMirror's own focus
    handler checks the DOM selection 20 ms later and, when its stored one
    differs (after a text-side update replaced the blocks it sits at the end
    of the document), writes that back over the click, so a key pressed
    more than 20 ms after a click acted at the end. It made the e2e test
    "keys pressed before the browser reports a click act where the user
    clicked" fail in about 30% of full-file runs on this branch (about 1 in
    10 on main); it now passes 12 of 12.

- **Book and guide PDFs.** Pages are numbered (the book's cover excepted),
  the book's contents list each chapter's page with a dotted leader, and
  the cover's eyebrow uses the indigo of the other Studio books. A new
  `pageNumbers` option in `markdownPdf.mjs` does this; the app's PDF
  export leaves it off.

- **Bug hunt, part 6**: 29 confirmed bugs fixed, each with a test that
  failed before the fix.
  - Data loss:
    - Files in Windows-1252 or UTF-16 were decoded as UTF-8 and saved
      back corrupted. They now open correctly and are saved in their own
      encoding (as UTF-8, with a notice, only when the text no longer
      fits it).
    - With the app open in two windows, one window kept showing its old
      copy of a tab and could overwrite or delete the other window's
      newer work, and settings changed in one window reverted in the
      other. Windows now pick up each other's newer tabs and settings.
    - A format-toolbar button (or an image dropped on the visual pane)
      right after a Markdown-pane edit wrote the visual pane's stale copy
      over that edit.
    - Going to the start screen right after a visual edit dropped the
      edit; the cursor and scroll position are now kept too.
    - A file reloaded from disk could replace a visual edit made in the
      last 200 ms.
  - Editors and sync: a Markdown-pane edit could show in the wrong block
    of the visual pane after a list; a visual edit rewrote the source of
    every block after an indented code block with a blank line, and moved
    link reference definitions to the end of the document.
  - Front matter: follows Pandoc's rules too (`...` closes it, a `---`
    followed by a blank line is a rule), so body text is never swallowed;
    block commands, a typed `---`, and selections reaching into the body
    can no longer split, nest or merge the block, and typing, pasting or
    composing over a selection that reaches into the body splits it
    instead; titles read YAML quoting, comments and block scalars. The
    Markdown pane finds front matter by the same rule
    (`editor/frontMatterLanguage.ts`): a `...` closer used to make it
    highlight the whole body as YAML.
  - Files: Ctrl+S right after a tab switch saves in place instead of
    asking where; no false "changed on disk" from Save As's own write;
    saving a file deleted on disk recreates it without an overwrite
    prompt; an image finishing after a document switch is no longer
    inserted into the other document.
  - Exports: code keeps HTML entities as written; the PDF draws quotes,
    tables and headings inside list items and styles an H3 as a subtitle
    only directly under an H1; Word keeps a list item that opens with
    code; footnotes match labels case-insensitively and leave indented
    code alone.
  - UI: the outline follows the visual pane in visual-only view; Mac
    tooltips show ⌘; the find bar's arrows have names; Enter during IME
    composition no longer runs palette commands or find; a dialog's radio
    group starts on the checked option.

- **Keys right after a click land where you clicked.** Clicking into the
  visual pane and pressing a key straight away (or while the page was busy,
  e.g. syncing a large document) could act at the old cursor position:
  ProseMirror only adopts a click's selection on `selectionchange`, which
  Chromium queues behind input events. The visual pane now reads the
  selection before handling a key (`editor/clickSelection.ts`).

- **Front matter.** YAML front matter (a `---` block on the first line)
  is now treated as metadata everywhere, instead of a rule and a heading.
  - The visual pane shows it as one labelled block, edited as plain text
    (`remark-frontmatter`). A block moved or pasted below the top becomes
    a YAML code block.
  - The Markdown pane highlights it as YAML (`@codemirror/lang-yaml`'s
    front matter wrapper, ~8 KB gzip in the editor chunk).
  - It no longer counts as a heading in the outline, the heading palette
    or linked scroll; `domain/frontMatter.ts` applies the parser's rules
    to the raw-text helpers.
  - Exports and print leave it out. A new setting, *Include front matter
    in exports and print* (Export dialog and Settings, off by default),
    exports it as a YAML code block instead.
  - The document title (tabs, start screen, exports) is the front
    matter's `title:` when it has one, and never the `---` line.

- **Bug hunt, part 5** (editors and sync; files, tabs and persistence;
  UI, accessibility and exports).
  - Data loss: an idle second window no longer writes its old copy of a
    tab over newer edits; closing a tab right after a visual edit asks
    first; the format toolbar can no longer replace a document the visual
    pane can't show.
  - Windows files keep their CRLF line endings and byte-order mark.
  - A visual edit keeps untouched headings written directly above text,
    setext headings, tables and YAML front matter exactly as written.
  - Empty paragraphs and list items made in the visual pane no longer
    reach the Markdown as `<br />`.
  - Replacing text in the visual pane keeps inline code.
  - Setext headings whose text starts with `*`, `#` or a number are found,
    so outline jumps and linked scroll pair the right headings.
  - A blank tab replaced by an opened file no longer comes back after a
    reload; a recent file that can't be reopened opens its snapshot
    without adding a duplicate entry, and large linked files stay listed;
    after a restart the open file is checked against the disk at once.
  - A corrupt recent-files entry no longer blanks the start screen.
  - On a Mac, shortcuts use Command only, Option types accented letters,
    and hints show ⌘ ⌥ ⇧.
  - The palette doesn't offer document commands on the start screen, and
    a dialog opened from it hands focus back properly.
  - Printing hides all the app's chrome.
  - PDF: no gap at style boundaries (the book is rebuilt), a notice when
    characters the PDF fonts lack were left out, and table alignment (also
    in Word). Plain text: heading underlines fit CJK and emoji, nested
    content lines up after wide list markers.

- **Refactor (no behaviour change): the visual pane's sync logic is its
  own module.** `editor/visualSync.ts` decides when and how text-pane
  edits reach the visual pane (debounce, incremental or full update,
  double-check, catch-up when shown, recovery from parse failures), with
  Milkdown behind an interface. Unit tests with fake timers now pin that
  timing; before, only the browser tests covered it.

- A dialog taller than the window (Settings on a short laptop screen)
  scrolls with its buttons pinned at the bottom, so Done stays in reach.
- A test runs every command that shows a shortcut in the palette both
  ways, from the palette and from the key, and checks they do the same,
  so a hint can't drift from the real shortcut.

- **Refactor (no behaviour change).** Reference-definition rules live in
  `domain/referenceDefinitions.ts` with their own tests, instead of two
  copies of one regex in the sync code. The panes lose their duplicated
  report, release and heading-selector code. The store's tab and save
  helpers share code; dialog and find-bar flags move to `store/ui.ts`, so
  opening a dialog no longer wakes the document store's subscribers.
  `CLAUDE.md` matches the code again.

- **Deeply nested documents no longer stall or crash the editors.** Both
  parsers are quadratic on nested brackets (20,000 levels took the visual
  pane over a second and the Markdown pane half a second, on every load),
  and 10,000 nested `![` overflowed the Markdown pane's parser. A guard
  (`domain/nesting.ts`) keeps a document nested past any real one's depth
  away from both: the visual pane goes inert with its notice, the Markdown
  pane shows plain text without highlighting, and both recover once the
  document is fixed.

- **Bug hunt, part 4: suspected bugs confirmed and fixed.**
  - A lazy part of the app (find bar, outline, format toolbar) that fails
    to load after a deploy no longer blanks the whole app: it is left out
    and a toast offers a reload. The service worker now also takes control
    on the first visit.
  - Save As onto a file another tab has open closes that tab, or, if it
    has unsaved changes, keeps them as a copy no longer linked to the file.
  - A `.txt` file is saved as `notes.md` and exported as `notes.pdf`,
    not `notes.txt.md` and `notes.txt.pdf`.
  - Closing every tab and reloading shows the start screen, not a blank
    editor.
  - Ctrl+Z in the Markdown pane undoes only what was typed there, no
    longer edits made in the visual pane.
  - Line numbers, fold markers and the × buttons meet WCAG contrast in
    both themes (`--text-faint` darkened in light, lightened in dark).
  - Word: tabs in code are real tabs; lists, headings and code inside a
    quote keep the quote's bar and indent; plain text in a quote is italic
    like paragraphs; a nested numbered list starts at its own number.
  - PDF: a list starting at `0.` starts at 0; a code line with a character
    the font lacks keeps its Danish letters; lists inside a quote carry
    the quote's bar; tabs in code wrap correctly.
  - Plain text: a leading quote and leading spaces in code keep their
    indent.
  - HTML: heading ids stay unique when a heading reads like a numbered id
    (`# a`, `# a`, `# a-1`).

- **Security sweep.** See `SECURITY.md` for the threat model.
  - Content Security Policy for the app (scripts only from its own origin,
    no plugins, frames or form posts), the dashboard and exported HTML.
  - The dashboard links only to GitHub pages from GitHub API data; a
    `javascript:` URL in the API response could otherwise have run script
    in the app's origin.
  - A document nested too deeply for the parser (thousands of `>` or `*`)
    no longer breaks the visual pane, even after a reload: the pane goes
    inert with a notice and comes back once the document parses.
  - Web images are no longer loaded when a document opens: they show as
    their alt text until **Load web images** is turned on in Settings,
    and then load without a referrer.
  - CI: read-only token for CI, no stored credentials during install and
    build, third-party actions pinned to a commit SHA, Dependabot for
    Actions. `qs` lifted past three advisories (dev-only, via Stryker).
- **The user guide and the book open from inside the app**: start screen,
  a Help and reading section in Settings, and the command palette. The
  guide opens as a document tab, or as a PDF (`public/User-Guide.pdf`,
  built by `pnpm book:guide` and rebuilt by the book workflow when
  `USER_GUIDE.md` changes). The guide and the book are precached, so they
  work offline.

- **Bug hunt, part 3: sync engine.**
  - A text edit among repeated blocks no longer lands on the wrong copy in
    the visual pane (an ambiguous match now takes the full parse).
  - Reference definitions and footnotes always take the full parse, so a
    definition typed far from its use links it straight away.
  - A visual edit keeps reference-style links and their definitions
    instead of inlining the links and deleting the definitions.
  - Visual undo and selection survive text-pane edits to neighbouring
    blocks, and full updates no longer replace everything after the
    first heading.
  - Clicking into the visual pane settles a pending incremental update
    first, so a divergence can't become permanent.
  - Outline, linked scroll and the palette's heading jump agree with the
    visual pane: inline triple backticks, fence info lines, headings
    inside lists, quotes and HTML blocks no longer confuse them.
  - Ctrl+F / Ctrl+H pressed again refocuses the find bar and searches the
    pane you are in.
- **Bug hunt, part 2: export and UI.**
  - Word: task items keep their text in the bullet, each numbered list
    starts at its own number instead of continuing the previous one.
  - Named entities (`&copy;`, `&nbsp;`, `&mdash;`…) come out as characters
    in Word, PDF and plain text.
  - HTML: table column alignment is honoured, headings get anchor ids so
    in-page links work, and dark or auto pages print in light colours.
  - PDF: everything inside a quote is drawn (nested quotes, code, lists),
    table cells show their text without Markdown syntax, and long words
    or URLs wrap instead of running off the page.
  - The command palette keeps the keyboard selection in view; the toolbar
    wraps on a 360 px phone instead of pushing buttons off-screen; the
    dark-theme danger button meets WCAG AA contrast; confirm dialogs
    focus Cancel, the safe choice for discard and overwrite.
- **Bug hunt, part 1: data loss.**
  - Save records exactly the text it wrote, on the tab it started in,
    so typing during a save or switching tabs while it runs no longer
    marks unwritten text as saved or ties another tab to the file.
  - Visual-pane edits are flushed before saves, tab switches, closing and
    page hide, so the last 200 ms of typing is never lost or written into
    another tab, and a text edit made right after a visual edit is no
    longer reverted.
  - Two windows of the app keep each other's tabs, file handles still used
    by any saved tab are kept, and double-clicked files go to the open
    window. A full browser storage now warns instead of silently
    dropping changes, and an unchanged tab takes half the space.
  - Files changed on disk are noticed: an unchanged tab reloads, and Save
    asks before overwriting the newer version.
  - Exports number footnotes, keep nested lists, task boxes and
    strikethrough in PDF, and embed pasted and `images/` pictures in PDF,
    Word and HTML.
  - Smaller fixes: a dropped `.md` file is no longer also pasted into the
    Markdown pane; several dropped or double-clicked files all open;
    shortcuts stay quiet behind dialogs and during IME composition, and
    Alt shortcuts work on macOS; *Continue editing* finds the tab with
    work when the active one is blank; a linked file in Recent is no
    longer replaced by an unlinked one with the same name.
- **The book is written.** *Writing in Plain Text* now has a foreword,
  seven chapters and three appendices (~23,000 words) instead of outlines,
  in the same voice as the mindmap-studio book. The PDF and EPUB are
  rebuilt from them. The user guide and the book had a humanizer pass
  (no dashes, straight quotes, prose instead of label lists).
- **Perf baseline from CI.** `perf-baseline.json` now holds the numbers
  from the first Perf trace run on GitHub's runner; the earlier container
  numbers were far looser.
- **Settings:** text size (both panes), line wrapping and line numbers
  (Markdown pane). The Export dialog starts from the last format and
  theme used.
- **Start screen:** remove a single recent file (×) or clear the whole
  list (asks first; files are not touched), and *Try the sample document*
  opens a short tour as an unsaved tab. Also in the command palette.
- **Command palette:** type `#` (or pick *Go to heading…*) to jump to a
  heading. The outline and the palette share one jump routine.
- **Open decisions closed:** the bundle budget is accepted as is (the gate
  stays); the second UI language is off the backlog for now; no
  Storybook.
- **Tabs, follow-ups.** Switching back to a tab returns to its cursor and
  scroll position. Tabs reorder by drag and drop or Shift+←/→. Tabs with
  the same file name are labelled with their first heading (or a number).
  A dropped file or recent snapshot that is already open (same name, same
  content as opened) switches to its tab instead of opening a copy.
- **Tabs.** Several documents can be open at once. New, Open, Recent,
  drop and Windows file-open each open a tab (an untouched blank document
  is reused); a file that is already open is switched to. The tab bar
  appears with two or more tabs; closing a tab with unsaved changes asks
  first, and closing the last returns to the start screen. Alt+W closes,
  Alt+PageDown/PageUp switch, also in the command palette. All tabs are
  restored after a reload; the single document older versions kept is
  migrated. Opening a file no longer asks to discard the current
  document, since it no longer replaces it.
- **Locale support.** The UI language follows the browser (exact tag,
  then base language) or a `language` setting, with English as the
  fallback; dates on the start screen use it and `<html lang>` follows
  it. English is the only language so far, so the settings language
  picker stays hidden until a second one is registered.
- **Book and dashboard links.** The start screen links the book (PDF and
  EPUB) and a new project dashboard at `/dashboard.html`: code size,
  tests, coverage, bundle size, book progress and trends from
  `stats.json`, plus the latest workflow runs and commits from GitHub.
  Both are also in the command palette.
- **Stats: start-up size now counts only start-up chunks.** `stats.json`
  counted every non-language chunk as start-up, including the lazy export
  chunks (docx, PDF), which overstated it (~729 KB vs ~429 KB gzip). It now
  counts what `index.html` loads and lists those chunks in `bundle.eager`.
  The trend line drops once at this change.
- **Paste and drop images** into either pane. In Edge/Chrome with the
  document on disk, images are saved in an `images` folder next to it
  (you pick the document's folder once) and linked by relative path; the
  visual pane shows them from that folder. Otherwise they are shrunk to
  at most 1600 px and embedded. Dropping a non-Markdown file outside the
  editors no longer navigates away from the app.
- **Fix: images disappeared from the visual pane.** Any image without a
  title (`![alt](src)`, the usual form) made the visual pane throw and
  render an empty paragraph instead, and a later edit in the visual pane
  could then drop the image from the Markdown. Image titles are now
  normalised before reaching the editor.
- **Format toolbar** above the visual pane: text style (paragraph,
  heading 1–4), bold, italic, strikethrough, inline code, link (via a
  prompt dialog), bulleted and numbered lists, quote, code block, table
  and horizontal rule. Buttons show as pressed for the selection's
  current formatting.
- The command palette's input now has an accessible name ("Commands").
- **Find and replace** (Ctrl+F / Ctrl+H) in whichever pane you're working
  in, with match case, whole word and regular expressions, a match count,
  and replace / replace all. Matches are highlighted in the visual pane;
  replacements sync to the other pane.
- **Outline** panel (toolbar or Ctrl+Shift+O): the document's headings;
  clicking one brings that section to the top of both panes, and the
  current section is highlighted. Overlays the editors on narrow screens.
- **Faster on large documents**: the visual pane now re-parses only the
  blocks that changed instead of the whole document after each typing
  pause, so typing no longer stutters on long files. On a 3,000-line
  document, an edit reaches the visual pane in ~170 ms instead of ~560 ms
  (the work per update fell from ~260 ms to ~12 ms). A full parse remains
  as a fallback and runs once while idle to rule out drift; the hidden
  visual pane in text-only view no longer updates at all until shown.
- **Visual edits keep your Markdown style**: editing in the visual pane
  now rewrites only the blocks you changed. Elsewhere, `*` bullets,
  `__bold__`, setext headings, spacing and so on stay exactly as written
  (so git diffs stay small). Verified per edit, with a fallback to the
  old behaviour if the merge would change meaning; no measurable cost on
  a 3,000-line document.
- **Recent files reopen the real file** (Edge/Chrome): file handles are
  kept in IndexedDB, so a recent entry opens the file's current content
  and Save writes back to it. The open document keeps its file across a
  reload too, instead of Save asking for a location. Falls back to the
  saved copy, with a note, when the file has moved or access is refused.
  The start screen marks entries as "File on disk" or "Saved copy".
- **Export**: save a copy as a themed web page (HTML, light/dark/auto),
  PDF, Word document (DOCX) or plain text, from the toolbar's Export
  dialog or the command palette. Replaces the unstyled "Export as HTML".
  Raw HTML in the source is shown as text and script-capable links are
  dropped in HTML exports. Converters load on demand.
- The book builder and PDF export share one renderer
  (`src/services/export/markdownPdf.mjs`); the book output is unchanged.
- Text pane: syntax colours follow the theme. CodeMirror's default style
  hard-coded light colours, leaving keywords and fence info strings
  near-invisible in dark mode. All token colours meet WCAG AA (4.5:1)
  in both themes.

## Repo and CI pipeline (PR #2)

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
