# Exporting and Sharing

### Export formats, and what travels well and what doesn't

Sooner or later, a document has to leave your desk. A colleague needs the proposal, a client wants a PDF, the meeting notes belong in an email. MD Studio gives you several ways out, and choosing well is mostly a question of who is on the other end and what they will do with the document.

This chapter starts with the format people overlook, the Markdown file itself. Then it goes through each export in turn, and ends with what survives the trip and what gets lost.

## Share the `.md` file itself

Before you export anything, ask whether the recipient could simply take the `.md` file. Often they can, and then it is the best option you have.

A Markdown file is plain text. Anyone can open it in Notepad, TextEdit, VS Code, or MD Studio itself, and it reads cleanly even unrendered: a `#` in front of a title and asterisks around a word do not get in anyone's way. GitHub, GitLab, Azure DevOps, Obsidian, Notion and many wikis render it on sight. It is also the only format the recipient can edit and hand back to you with nothing lost in conversion.

Send the `.md` when the reader is technical or works in a tool that renders Markdown, when you want edits back rather than comments, or when the document is headed for a repository or a wiki. It is also the right choice for a document with a long life ahead, because you will not have to keep two versions in step.

Check the images before you attach it. If they were saved to an `images` folder next to the document (see [Chapter 5](05-managing-files-locally.md)), the `.md` file only holds links to them, so send the folder, zipped, along with the file. In a git repository or a shared OneDrive folder this takes care of itself. If the images are embedded instead, the `.md` is self-contained, but it may be large, and the long lines of encoded image data make the source harder to read.

## The Export dialog

When the recipient needs something other than Markdown, open the **Export** dialog: **Export** in the toolbar, or *Export…* in the command palette (**Ctrl+K**). The dialog says what it does in one line: "Save a copy in another format. Your Markdown file stays as it is."

Take that literally. Export writes a *separate* file. It never changes which file your document is linked to, so after exporting `report.pdf`, **Ctrl+S** still saves `report.md`, not the PDF. You can export as often as you like without any risk to your source.

Pick a **Format**:

| Format | What the dialog promises |
| --- | --- |
| **Web page (HTML)** | Standalone page styled like the visual view. |
| **PDF** | A4 document for sharing and printing. |
| **Word document (DOCX)** | Editable in Word, with real headings, lists and tables. |
| **Plain text** | Formatting marks removed, structure kept. |

For HTML, a **Page theme** setting also appears. Then click **Export**.

In Edge and Chrome, a save dialog asks where to put the file, suggesting a name built from your document's: `report.md` becomes `report.pdf`. Elsewhere, the file downloads. A toast confirms either way: "Exported report.pdf" or "Downloaded report.pdf".

The dialog remembers the format and theme you used last, so if you export to PDF every Friday, it opens on PDF. If you always export the same way, skip the dialog: the command palette has one command per format, *Export as HTML*, *Export as PDF*, *Export as Word document* and *Export as plain text*, each using your last-used page theme.

## Web page (HTML)

The HTML export is a single, self-contained `.html` file styled like MD Studio's visual view: comfortable line length, clear headings, readable tables and code. It opens in any browser on any device, with nothing installed.

**Page theme** has three choices. **Follow reader’s system** shows the page light to a reader in light mode and dark to one in dark mode, which suits anything read on screen. **Light** and **Dark** fix the look; pick **Light** for anything that may be printed or projected.

HTML is the export that travels best. It keeps everything Markdown expresses as structure: headings, nested lists, task lists, tables, block quotes, code, links. It is also the easiest to paste from (see below), and when printed from a browser, the page drops its background and prints black on white.

Images come along in three ways. A picture pasted into the document (PNG, JPEG, GIF or WebP) is embedded in the page itself. Images linked by a relative path, like `images/chart.png`, stay as links, so they appear when the `.html` file sits next to the `images` folder. Images on the web keep working while the reader is online.

Raw HTML in your Markdown is shown as text rather than run, and a link that could run a script loses its address but keeps its text. Ordinary web, email and relative links stay clickable. The reason is simple: a page exported from a document someone sent you should never run code from that document.

## PDF

The PDF export produces an A4 document, set in clean standard fonts, with headings, lists, tables, quotes and code blocks laid out on the page. Nested lists keep their indentation, and task list items show `[x]` or `[ ]`. It is the format for "please send me something I can read on a plane", for formal attachments, and for anything that must look the same everywhere.

Know its main limit in advance. To stay small and fast, the PDF uses the standard fonts every PDF reader has built in. Those cover Latin text, including Danish **æ**, **ø** and **å**, accented letters and ordinary punctuation. They do not cover emoji, Greek, Cyrillic, Chinese, Arabic and other scripts, and those characters are left out of the PDF rather than breaking the export. Images come along when MD Studio can read them: pictures pasted into the document, and pictures in the document's `images` folder when the document is saved on disk in Edge or Chrome. PNG and JPEG are embedded at full width; other formats, and images on the web, show their alt text instead.

If your document contains any of that, use printing instead (next section): the browser's own PDF printer renders every character and every image the visual pane can show.

## Word document (DOCX)

The Word export is for when the next person will keep working on the document in Word, or a template, a review process or a client requires a `.docx`.

The result uses real Word structure. Your `#` headings become Word's built-in Heading 1, Heading 2 and so on, so the navigation pane, a generated table of contents and the document's styles all work. Bulleted and numbered lists, nested ones included, become Word lists, and tables become Word tables with a header row. Links stay clickable. Code blocks are set in a monospace font, block quotes are indented, and task list items keep their state as a ☐ or ☑ in front of the text.

Images are embedded the same way as in the PDF (PNG, JPEG and GIF), and anything MD Studio can't read becomes a short placeholder with its alt text. Once the `.docx` leaves MD Studio, it is a Word document. Edits made there will not flow back into your Markdown, so decide which copy is the master before the review starts.

## Plain text

The plain text export removes the formatting marks and keeps the structure, for destinations that accept nothing else: a ticketing system with a bare text box, an SMS, an old mainframe form, a terminal.

Top-level headings are underlined with `=` and second-level headings with `-`, so they still stand out. Lists keep their bullets (`-`) and numbers, and task items show `[x]` or `[ ]`. Tables become rows of tab-separated cells, which paste straight into a spreadsheet. A link keeps its address in brackets after the text, like `the report (https://example.com/report)`. Code is kept exactly as written.

The `.txt` file looks a lot like your Markdown without the asterisks and backticks, which is no accident, since Markdown was designed to read well as plain text.

## Printing, and the other road to PDF

**Ctrl+P**, or *Print* in the command palette, prints the formatted document. The toolbar and the Markdown pane are left out, so the printout is the formatted document, not the source. Print from **Split** or **Visual** view, so the formatted pane is up to date with your latest edits.

The browser's print dialog has a *Save as PDF* (or *Microsoft Print to PDF*) destination, and that gives you a second road to PDF with different strengths:

| | **Export as PDF** | **Print to PDF** |
| --- | --- | --- |
| Fonts | Standard fonts; Latin text only | Your system's fonts; every script and emoji |
| Images | Left out | Included, as shown in the visual pane |
| Page size | A4 | Whatever you choose in the print dialog |
| Margins, headers | Fixed | Set in the print dialog |

Use **Export** for a quick, consistent A4 document. Use **Print** when the document has images, emoji or non-Latin text, or when you need US Letter or custom margins.

## Exporting offline

MD Studio works offline, and so do HTML, plain text and printing. PDF and Word exports rely on larger components that MD Studio downloads only the first time you use them, so the first PDF or Word export needs a connection. After that, they work offline too. If you know you will be exporting on a train, run one PDF and one Word export at your desk first.

## What survives the trip

No conversion is perfect. The table shows what to expect from each route, so you find the gaps at your desk rather than in the recipient's inbox.

| In your document | `.md` | HTML | PDF | Word | Plain text |
| --- | --- | --- | --- | --- | --- |
| Headings, lists, quotes | Yes | Yes | Yes | Yes | As text structure |
| Tables | Yes | Yes | Yes | Yes | Tab-separated rows |
| Links | Yes | Clickable | Shown as text | Clickable | Address in brackets |
| Task lists | Yes | Checkboxes | `[ ]` and `[x]` | ☐ and ☑ | `[ ]` and `[x]` |
| Strikethrough | Yes | Yes | Yes | Yes | Plain text |
| Pasted images | Yes, inside the file | Yes | PNG, JPEG | PNG, JPEG, GIF | Alt text |
| Images in an `images` folder | If you send the folder | If the folder sits next to it | PNG, JPEG, when saved on disk | PNG, JPEG, GIF, when saved on disk | Alt text |
| Footnotes | Yes | Numbered notes at the end | Numbered notes at the end | Numbered notes at the end | Numbered notes at the end |
| Raw HTML | Yes | Shown as text | Mostly left out | Shown as code | Kept as text |
| Emoji, non-Latin scripts | Yes | Yes | Left out | Yes | Yes |

Headings, tables and simple lists come through every format, which is a good reason to carry meaning in structure rather than in visual tricks.

Images are the format that needs the most care. Images on the web are never fetched for a PDF or Word export, so link to a copy in the `images` folder if the picture has to travel. And remember that a relative link such as `images/chart.png` means "next to this file": move the file without its folder and the link points at nothing.

Footnotes are not part of CommonMark, so the exports turn them into something every format understands: each marker becomes a number in brackets, and the notes follow as a numbered list after a rule at the end. Raw HTML is handled differently by each format, as the table shows. [Appendix B](appendix-b-markdown-syntax-reference.md) marks which syntax is CommonMark and which is GitHub Flavored Markdown. If a document has to export cleanly, stay within those two.

## Pasting into email, chat and wikis

Often you do not want a file at all. You want the text somewhere else, now.

For email, Teams, Word or Google Docs, select in the visual pane and copy. You get formatted text with headings, bold, lists and links intact, much as it looks in the visual view.

For a destination that understands Markdown itself, such as GitHub issues and pull requests, GitLab, Azure DevOps or Obsidian, select in the Markdown pane and copy. You get the raw source, and the destination renders it.

For a long or important email, export to HTML with the **Light** theme, open the file in your browser, select all (**Ctrl+A**), copy, and paste into the email. That gives the most predictable formatting, tables included.

And when the destination mangles everything you paste, export to plain text or copy from the Markdown pane. Markdown holds up well with no formatting at all.

## Now you try

Take a document with a heading, a list, a table and a link, ideally one you need to send this week.

1. Open **Export** and export it as **Web page (HTML)** with **Follow reader’s system**. Open the file in your browser, then switch your system between light and dark mode and watch the page follow.
2. Export it again as **PDF**. Notice the dialog opened on HTML, the format you used last; pick PDF this time. Open the PDF and check the table.
3. Press **Ctrl+P** and choose *Save as PDF*. Compare the two PDFs side by side: fonts, margins, page size.
4. Export as **Word document (DOCX)**, open it in Word, and open the navigation pane: your headings are there, as real headings.
5. Finally, select a paragraph and a list in the visual pane, copy, and paste it into a new email. Then do the same from the Markdown pane, and compare.

Then press **Ctrl+S** and look at the file name in the toolbar. It is still your `.md` file; four exports later, the source has not changed. [Chapter 7](07-writing-as-practice.md) steps back from the buttons to the writing habits behind them.
