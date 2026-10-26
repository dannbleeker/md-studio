# MD Studio quick reference

## Getting started

- **Open file…**, **Open folder**, or pick a file from **Recent** on the
  start screen; **New document** is the link under them. You can also drop
  `.md` files anywhere on the window; each opens in its own tab.
- Files open in **Read view**, as a page to read. Press **Edit** to change
  one, and **Read** to go back. A new document opens for editing.
- Everything else is in the **☰** menu at the right of the toolbar: New
  document, Open, Save as, Export, Commands, Keyboard shortcuts, Settings
  and this guide. **Ctrl+K** finds any command by name, and **?** lists
  the keyboard shortcuts whenever no text is being typed.
- Click **MD Studio** in the toolbar to return to the start screen.
- In Edge and Chrome, a recent file marked **File on disk** reopens the
  file itself, with its current content, and Save writes back to it. The
  browser may ask once to allow access. **Saved copy** entries (other
  browsers, or files that moved) open the copy MD Studio kept.
- Your open document is saved in the browser automatically. Close the tab
  and it is still there next time.
- **Try the sample document** opens a short tour of MD Studio and
  Markdown as a new, unsaved document.
- The **×** next to a recent file removes it from the list, and **Clear
  list** empties it. The files themselves are not touched.
- **Help and the book**, at the foot of the start screen, opens this guide (in a tab, or as a
  PDF), the book *Writing in Plain Text* (PDF or EPUB) and the project
  dashboard. The guide opens as a
  document in its own tab, so you can search it. Both the guide and the
  book are downloaded with the app and open offline.

## Reading and editing

**Read view** shows the document as a page: links open, headings fold, and
nothing can change by accident. **Edit** switches to editing, in the layout
you used last, and **Read** switches back. While editing, the toolbar picks
the layout:

| Layout | What you see |
| --- | --- |
| **Split** | Markdown source on the left, the formatted document on the right |
| **Markdown** | Markdown source only |
| **Visual** | Formatted document only |

Both panes edit the same document. Type in either one and the other updates
a moment later.

In split view the panes scroll together, keeping the same section in view.
Turn that off in Settings (**Scroll both panes together in split view**).
On a phone, the layouts and the panels are in the **☰** menu.

**Front matter**, the YAML metadata block some tools put at the top of a
file between two `---` lines, shows in the visual view as a grey box
labelled Front matter. As in Pandoc, a `...` line may close it instead,
and a `---` followed by a blank line is a rule, not front matter. Edit it
there as plain text; Backspace in an empty box removes it.

## Formatting

In the visual view, the toolbar above the document formats without
keyboard shortcuts: text style (paragraph or heading 1 to 4), bold, italic,
link, bulleted list and quote. **⋯** (More formatting) adds strikethrough,
inline code, numbered list, code block, table and horizontal rule. Buttons show as pressed when the
selection already has that formatting. A link asks for its address;
clearing the address removes the link.

## Images

Paste an image (Ctrl+V) or drop a file into either pane.

In Edge and Chrome, once the document is saved on disk, MD Studio asks you
the first time to pick the folder the document is in. Images then go into
an `images` folder next to the document and are linked from it. The
Markdown stays small, and the images travel with the folder (and with
git). Choose *Cancel* to embed the image instead.

In other browsers, or before the document is saved, the image is shrunk to
at most 1600 px and embedded in the document itself.

### Obsidian notes

Notes from Obsidian open with their attachments. `![[plan.png|300]]` shows
a picture 300 px wide, `![[report.pdf#page=3]]` a PDF, and audio, video and
other files appear as a player or a chip with an **Open** link.
`![[Other note]]` and `![[Other note#Heading]]` show that note or section
as a read-only quote; `[[Other note]]` shows as a plain chip. MD Studio
never rewrites the text of an embed, whichever pane you edit in (the two
exceptions are listed under the known gaps below). Inside a
table, write the pipe in an embed as a backslash and a pipe.

To see the files, choose the vault's top folder (the one with `.obsidian`
in it) when the bar above the editor asks, or run *Choose attachment
folder…* from the command palette. The folder must contain the note.
After a reload the bar may ask you to **Allow access** again. *Rescan
attachments* picks up files added elsewhere. Embeds are also placeholders
in browsers that cannot read folders, with the text unchanged.

The bar stays away for an embed of a section of the same note
(`![[#Heading]]`) or of a web address, since neither needs a folder. If the
command palette's *Choose attachment folder…* or *Rescan attachments* cannot
run (browser unsupported, document not saved, no folder chosen, access to
allow), it says why instead of doing nothing.

Pasting or dropping any kind of file saves it in the folder the vault's
settings name (`.obsidian/app.json` is read, never written), with a name
like `Pasted image 20261012093000.png`, and links it. **Link style** in
Settings chooses wikilinks, Markdown links, or auto (follow the vault);
**Attachment location** can keep the older `images` folder next to the
note. Without a `.obsidian` folder, everything behaves as before.

Known gaps: only top-level headings can be linked into (`![[Note#Heading]]`),
a token that Markdown splits (emphasis inside the name) or one inside the label
of a Markdown link stays text and gains backslashes if you edit that paragraph
in the visual pane, `%%comments%%` are not understood, and wikilinks are not clickable yet. Appendix B of the
book lists every form.

## Finding and navigating

- **Find** (Ctrl+F) and **Find and replace** (Ctrl+H) open a bar above the
  editors. It searches the pane you are working in: the Markdown source,
  or the formatted document in visual view. Options: match case (Aa),
  whole word (W) and regular expressions (.*). In the visual pane, a match
inside an embed or wikilink token (its file name or alias) counts too, and
Replace rewrites the token if the result is still a valid one. Enter goes to the next
  match, Shift+Enter to the previous one, Escape closes the bar. A
  replacement in either pane appears in the other.
- **Outline** (the list icon in the toolbar, or Ctrl+Shift+O) lists the
  document's headings; the folder icon next to it shows the folder panel.
  Click one to bring that section to the top of both panes; the section
  you are reading is highlighted.
- In the command palette (Ctrl+K), type `#` to list the headings instead
  of commands, then a few letters to narrow them down and Enter to jump.
  *Go to heading…* in the palette does the same.

## Settings

Ctrl+, or **Settings** in the **☰** menu. The everyday settings come first,
in sections (Appearance, Reading, Editing); the vault, privacy, export and
language settings are under **More settings**. Among them:

- **Text size** (small, medium, large) for both panes.
- **Wrap long lines** and **Show line numbers** for the Markdown pane.
- **Load web images** is off by default. A web image (`https://…`) tells
  its server that, and when, the document was opened, so until you turn
  this on the visual pane shows its description in a dashed frame instead.
  Pasted images and images next to the file always show.
  The setting also applies to HTML export.
- **Help and reading** at the bottom opens this guide and the book from
  anywhere in the app. The command palette has them too: *Open the user
  guide*, *Open the user guide (PDF)*, *Open the book* and *Download the
  book (EPUB)*.

The Export dialog remembers the format and theme you used last.

## Tabs

- **New document**, **Open**, a **Recent** file or a dropped file each open in a new
  tab. An empty, untouched new document is reused instead of piling up.
- Opening a file that is already open switches to its tab. Without a link
  to the file on disk (other browsers, dropped files) MD Studio goes by the
  name and the content it was opened with.
- The tab bar appears once two documents are open. Click a tab to switch;
  the arrow keys move between tabs when one has focus. Each tab keeps its
  cursor and scroll position.
- Drag a tab to reorder, or press Shift+← / Shift+→ on a focused tab.
- Two tabs with the same file name show the document's first heading,
  for example *notes.md · Plan*.
- **×** or a middle click closes a tab. A tab with unsaved changes asks
  first. Closing the last tab returns to the start screen.
- All open tabs, saved or not, are still there after closing and
  reopening the app.

## Saving

- **Save** (Ctrl+S) writes back to the file you opened in Edge or Chrome,
  even after closing and reopening the app (the browser may ask once to
  allow access again). The first save of a new document asks where to put
  it.
- **Save as…** (Ctrl+Shift+S) always asks.
- In Firefox, Safari and on phones, Save downloads the file instead.
- A dot next to the file name means there are unsaved changes.
- A file is saved the way it was written: same line endings and the same
  encoding (UTF-8, UTF-16, or Windows-1252 for older Windows files). If
  you add a character that encoding can't hold, the file is saved as
  UTF-8 instead and MD Studio tells you.
- If the file changed on disk (another app, another device syncing the
  folder), MD Studio notices when you come back to the window: a tab
  without unsaved changes reloads, and Save asks before overwriting the
  newer version.

## Exporting

**Export…** (in the **☰** menu or the command palette) saves a copy of the
document in another format. Your Markdown file stays as it is, and stays the
file that Save writes to.

| Format | What you get |
| --- | --- |
| Web page (HTML) | A standalone page styled like the visual view, light, dark, or matching the reader's system theme |
| PDF | An A4 document for sharing and printing |
| Word document (DOCX) | Editable in Word, with real headings, lists, tables and links |
| Plain text | Formatting marks removed, structure kept |

Pasted images and images from the document's attachment or `images` folder
come along at the size a note gives them (PDF: PNG and JPEG; Word also
GIF; WebP, AVIF, BMP and SVG are redrawn as PNG for both). Images on the
web are not fetched for PDF or Word and show their alt text; in HTML they
are linked only when **Load web images** is on. Obsidian embeds of PDF,
audio, video and other files become a labelled line; an embedded note is
written out as a quote (a label when it shares a paragraph or sits in a
table cell); wikilinks become their alias or name. Footnotes become
numbered notes at the end. The HTML page leaves out a picture over 5 MB, and
all pictures past 25 MB, and says so; Word and PDF keep them.

Front matter is left out of exports and print. To include it, as a code
block at the top, tick **Include front matter in exports and print** in
the Export dialog or in Settings.

The command palette also has a direct command per format, e.g. *Export as
PDF*. PDF uses standard fonts: Latin text (including æ, ø, å) comes through,
but emoji and non-Latin scripts are left out. The first PDF or Word export
needs a connection; after that they work offline too.

## Installing

In Edge or Chrome, use **Install app** in the address bar. On Windows, the
installed app can open `.md` files: right-click a file → *Open with* → MD
Studio. On a phone, use *Add to Home Screen*; open documents from inside the
app.

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| Ctrl+K or Ctrl+Shift+P | Command palette |
| Ctrl+S / Ctrl+Shift+S | Save / Save as |
| Ctrl+O | Open file |
| Alt+N | New document |
| Alt+W | Close tab |
| Alt+PageDown / Alt+PageUp | Next / previous tab |
| Ctrl+1 / Ctrl+2 / Ctrl+3 | Split / Text / Visual view |
| Ctrl+F / Ctrl+H | Find / Find and replace |
| Ctrl+Shift+O | Show or hide the outline |
| Ctrl+, | Settings |
| Ctrl+B / Ctrl+I | Bold / italic (visual pane) |
| Ctrl+Z / Ctrl+Y | Undo / redo (in the focused pane) |

On macOS use Cmd in place of Ctrl. Ctrl+1, Ctrl+2 and Ctrl+3 work in the
installed app; in a normal browser tab they switch browser tabs instead, so
use the toolbar or the command palette there. **?** lists every shortcut. Ctrl+W and Ctrl+Tab always
belong to the browser, which is why closing and switching MD Studio tabs
uses Alt.
