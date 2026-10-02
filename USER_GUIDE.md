# MD Studio — quick reference

## Getting started

- **New document**, **Open file…**, or pick a file from **Recent** on the start
  screen. You can also drop a `.md` file anywhere on the window.
- Click **MD Studio** in the toolbar to return to the start screen.
- In Edge and Chrome, a recent file marked **File on disk** reopens the
  file itself, with its current content, and Save writes back to it. The
  browser may ask once to allow access. **Saved copy** entries (other
  browsers, or files that moved) open the copy MD Studio kept.
- Your open document is saved in the browser automatically. Close the tab
  and it is still there next time.

## Views

| View | What you see |
| --- | --- |
| **Split** | Markdown source on the left, the formatted document on the right |
| **Text** | Markdown source only |
| **Visual** | Formatted document only |

Both panes edit the same document. Type in either one and the other updates
a moment later.

**Linked scroll** (split view) keeps both panes on the same section as you
scroll. Turn it off in the toolbar or in Settings.

## Formatting

In the visual view, the toolbar above the document formats without
keyboard shortcuts: text style (paragraph or heading 1–4), bold, italic,
strikethrough, inline code, link, bulleted and numbered lists, quote,
code block, table and horizontal rule. Buttons show as pressed when the
selection already has that formatting. A link asks for its address;
clearing the address removes the link.

## Images

Paste an image (Ctrl+V) or drop an image file into either pane.

- **Edge and Chrome, document saved on disk:** the first time, MD Studio
  asks you to pick the folder the document is in. Images are then saved in
  an `images` folder next to the document and linked from it, so the
  Markdown stays small and the images travel with the folder (and with
  git). Choose *Cancel* to embed the image instead.
- **Everywhere else** (or before the document is saved): the image is
  shrunk to at most 1600 px and embedded in the document itself.

## Finding and navigating

- **Find** (Ctrl+F) and **Find and replace** (Ctrl+H) open a bar above the
  editors. It searches the pane you are working in: the Markdown source,
  or the formatted document in visual view. Options: match case (Aa),
  whole word (W) and regular expressions (.*). Enter goes to the next
  match, Shift+Enter to the previous one, Escape closes the bar. A
  replacement in either pane appears in the other.
- **Outline** (toolbar, or Ctrl+Shift+O) lists the document's headings.
  Click one to bring that section to the top of both panes; the section
  you are reading is highlighted.

## Saving

- **Save** (Ctrl+S) writes back to the file you opened in Edge or Chrome,
  also after closing and reopening the app (the browser may ask once to
  allow access again). The first save of a new document asks where to put
  it.
- **Save as…** (Ctrl+Shift+S) always asks.
- In Firefox, Safari and on phones, Save downloads the file instead.
- A dot next to the file name means there are unsaved changes.

## Exporting

**Export** (toolbar, or *Export…* in the command palette) saves a copy of the
document in another format. Your Markdown file stays as it is, and stays the
file that Save writes to.

| Format | What you get |
| --- | --- |
| Web page (HTML) | A standalone page styled like the visual view, in a light, dark or follow-the-reader's-system theme |
| PDF | An A4 document for sharing and printing |
| Word document (DOCX) | Editable in Word, with real headings, lists, tables and links |
| Plain text | Formatting marks removed, structure kept |

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
| Ctrl+1 / Ctrl+2 / Ctrl+3 | Split / Text / Visual view |
| Ctrl+F / Ctrl+H | Find / Find and replace |
| Ctrl+Shift+O | Show or hide the outline |
| Ctrl+, | Settings |
| Ctrl+B / Ctrl+I | Bold / italic (visual pane) |
| Ctrl+Z / Ctrl+Y | Undo / redo (in the focused pane) |

On macOS use Cmd in place of Ctrl. In a normal browser tab, Ctrl+1–3 switch
browser tabs instead; use the toolbar or the command palette there. The
shortcuts work in the installed app.
