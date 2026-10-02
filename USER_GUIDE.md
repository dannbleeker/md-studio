# MD Studio quick reference

## Getting started

- **New document**, **Open file…**, or pick a file from **Recent** on the start
  screen. You can also drop `.md` files anywhere on the window; each opens
  in its own tab.
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
- The links under the start screen open this guide (in a tab, or as a
  PDF), the book *Writing in Plain Text* (PDF or EPUB) and the project
  dashboard. The guide opens as a
  document in its own tab, so you can search it. Both the guide and the
  book are downloaded with the app and open offline.

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
keyboard shortcuts: text style (paragraph or heading 1 to 4), bold, italic,
strikethrough, inline code, link, bulleted and numbered lists, quote,
code block, table and horizontal rule. Buttons show as pressed when the
selection already has that formatting. A link asks for its address;
clearing the address removes the link.

## Images

Paste an image (Ctrl+V) or drop an image file into either pane.

In Edge and Chrome, once the document is saved on disk, MD Studio asks you
the first time to pick the folder the document is in. Images then go into
an `images` folder next to the document and are linked from it. The
Markdown stays small, and the images travel with the folder (and with
git). Choose *Cancel* to embed the image instead.

In other browsers, or before the document is saved, the image is shrunk to
at most 1600 px and embedded in the document itself.

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
- In the command palette (Ctrl+K), type `#` to list the headings instead
  of commands, then a few letters to narrow them down and Enter to jump.
  *Go to heading…* in the palette does the same.

## Settings

Ctrl+, or **Settings** in the toolbar. Besides theme, default view and linked
scroll:

- **Text size** (small, medium, large) for both panes.
- **Wrap long lines** and **Show line numbers** for the Markdown pane.
- **Load web images** is off by default. A web image (`https://…`) tells
  its server that, and when, the document was opened, so until you turn
  this on the visual pane shows its description in a dashed frame instead.
  Pasted images and images next to the file always show.
- **Help and reading** at the bottom opens this guide and the book from
  anywhere in the app. The command palette has them too: *Open the user
  guide*, *Open the user guide (PDF)*, *Open the book* and *Download the
  book (EPUB)*.

The Export dialog remembers the format and theme you used last.

## Tabs

- **New**, **Open**, a **Recent** file or a dropped file each open in a new
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
- If the file changed on disk (another app, another device syncing the
  folder), MD Studio notices when you come back to the window: a tab
  without unsaved changes reloads, and Save asks before overwriting the
  newer version.

## Exporting

**Export** (toolbar, or *Export…* in the command palette) saves a copy of the
document in another format. Your Markdown file stays as it is, and stays the
file that Save writes to.

| Format | What you get |
| --- | --- |
| Web page (HTML) | A standalone page styled like the visual view, light, dark, or matching the reader's system theme |
| PDF | An A4 document for sharing and printing |
| Word document (DOCX) | Editable in Word, with real headings, lists, tables and links |
| Plain text | Formatting marks removed, structure kept |

Pasted images and images in the document's `images` folder come along (PDF:
PNG and JPEG; Word also GIF); images on the web are not fetched and show
their alt text. Footnotes become numbered notes at the end.

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
use the toolbar or the command palette there. Ctrl+W and Ctrl+Tab always
belong to the browser, which is why closing and switching MD Studio tabs
uses Alt.
