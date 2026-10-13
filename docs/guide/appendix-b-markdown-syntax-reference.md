# Appendix B: Markdown Syntax Reference

This appendix lists all the Markdown MD Studio understands. MD Studio reads
CommonMark, the core specification, plus the GitHub Flavored Markdown (GFM)
extensions, and its visual pane also renders footnotes. For when and why to use
each construct, see [Chapter 3](03-structuring-documents.md) and
[Chapter 4](04-formatting-and-rich-content.md).

Each entry gives the source as you type it in the Markdown pane and what the
visual pane shows. Where there is one, it also names the format toolbar control
or shortcut that produces the same thing in the visual pane. Entries that say
"type" followed by some characters are typing shortcuts the visual editor is set
up to convert as you type.

## Headings

| Source | Result | In the visual pane |
| --- | --- | --- |
| `# Title` | Level 1 heading | **Text style** → **Heading 1**, or type `# ` |
| `## Section` | Level 2 heading | **Heading 2**, or type `## ` |
| `### Subsection` | Level 3 heading | **Heading 3**, or type `### ` |
| `#### Part` | Level 4 heading | **Heading 4**, or type `#### ` |
| `##### Minor` | Level 5 heading | Type `##### ` |
| `###### Least` | Level 6 heading | Type `###### ` |

A space after the hash marks is required: `#tag` is an ordinary paragraph.
Optional closing hashes (`## Section ##`) are ignored.

The first two levels also have the *setext* form, text underlined on the next
line:

```markdown
Title
=====

Section
-------
```

The outline, the `#` heading jump in the command palette and linked scroll all
use top-level ATX (`#`) and setext headings. They do not count headings inside
code blocks, block quotes or list items.

## Paragraphs and line breaks

| Source | Result |
| --- | --- |
| Text separated by a blank line | Two paragraphs |
| Two lines with no blank line between them | One paragraph; the line break becomes a space |
| A line ending in a backslash `\` | A hard line break inside the paragraph |
| A line ending in two or more spaces | A hard line break (invisible in the source, so prefer the backslash) |

## Emphasis and inline formatting

| Source | Result | In the visual pane |
| --- | --- | --- |
| `*italic*` or `_italic_` | *italic* | **Italic**, **Ctrl+I** |
| `**bold**` or `__bold__` | **bold** | **Bold**, **Ctrl+B** |
| `***both***` | ***both*** | **Bold** and **Italic** |
| `~~struck~~` (GFM) | ~~struck~~ | **Strikethrough** |
| `` `code` `` | `code` | **Inline code** |
| ``` `` a `tick` `` ``` | `` a `tick` `` | |

Markdown leaves underscores inside a word alone, so `file_name_here` stays as
written. Nothing inside inline code is formatted.

## Links

| Source | Result | In the visual pane |
| --- | --- | --- |
| `[text](https://example.com)` | A link reading *text* | **Link**, then the address and **Apply** |
| `[text](https://example.com "Title")` | The same link with a tooltip | |
| `[text](other-file.md)` | A relative link to a file in the same folder | **Link** |
| `<https://example.com>` | The address itself as a link | |
| `<someone@example.com>` | An email link | |
| `www.example.com` or `https://example.com` in text (GFM) | Turned into a link automatically | |

To remove a link in the visual pane, put the cursor in it, click **Link**, clear
the address and choose **Apply**.

**Reference links** keep long addresses out of the paragraph. The definition
lines do not render:

```markdown
Read the [lease][lease] and the [terms][].

[lease]: https://example.com/lease
[terms]: https://example.com/terms
```

## Images

| Source | Result |
| --- | --- |
| `![Alt text](images/plan.png)` | The image from a file next to the document |
| `![Alt text](https://example.com/plan.png)` | The image from the web |
| `![Alt text](images/plan.png "Title")` | The image with a title |
| `![Alt text](<my plan.png>)` | A file name with spaces, in angle brackets (`my%20plan.png` also works) |
| `![Alt text\|300](images/plan.png)` | The image shown 300 pixels wide; `\|300x200` sets both sides |

In that last row a pipe and a number at the end of the alt text set the width. The
alt text itself is kept as written, and the size is not read as part of the
description. Obsidian writes sizes the same way.

Pasting (**Ctrl+V**) or dropping a file writes the link for you. In Edge or
Chrome with the document saved on disk, MD Studio saves the file in the folder
the vault's settings name (an `images` folder next to the document when there is
no `.obsidian` folder) and links it, as a wikilink or a Markdown link depending
on **Link style** in Settings. Elsewhere an image is shrunk to at most 1600 px
and embedded as a `data:` address, and other kinds of file are not inserted. See
[Chapter 4](04-formatting-and-rich-content.md) and the next section.

## Obsidian embeds and wikilinks

Notes written in Obsidian use double brackets to embed and link. MD Studio keeps
these exactly as written: the visual pane shows each one as a picture, a player
or a labelled chip, and an edit in either pane never rewrites the token. The
files come from the attachment folder you choose, which should be the vault root
([Chapter 5](05-managing-files-locally.md)). Embeds work in Edge and Chrome; in
other browsers they appear as labelled placeholders and the source is unchanged.

| Source | Result |
| --- | --- |
| `![[plan.png]]` | The image named `plan.png`, found anywhere in the vault |
| `![[plan.png\|300]]` | The image 300 pixels wide, height following |
| `![[plan.png\|300x200]]` | The image 300 by 200 pixels |
| `![[plan.png\|Floor plan]]` | The image with alt text; `\|Floor plan\|300` gives both |
| `![[report.pdf]]` | The PDF in a frame where the browser allows it, with an **Open** link beside it |
| `![[report.pdf#page=3&height=400]]` | The PDF opened at page 3, 400 pixels high |
| `![[talk.mp3]]` | An audio player |
| `![[demo.mp4\|480]]` | A video player 480 pixels wide |
| `![[data.zip]]` | A labelled chip with an **Open** link |
| `![[Meeting notes]]` | The whole note, shown as a quoted block you cannot edit |
| `![[Meeting notes#Decisions]]` | The section under that heading |
| `![[Meeting notes#^abc123]]` | The paragraph, list item or quote that ends in `^abc123`; a lone `^abc123` line after a list names the whole list |
| `![[#Decisions]]` and `![[#^abc123]]` | The same, from the note you are editing |
| `[[Meeting notes]]` and `[[Meeting notes\|the notes]]` | A plain chip showing the name or the alias |

A few rules sit behind the table. A size is read from the last option that is
digits or digits, an x and digits, and only for images, PDFs and video; for a
note, an audio file or a link, a number is an alias, so `[[Note\|2024]]` shows
2024. File kinds follow the extension, and a name with no extension, or with one
that is not a known file type, such as `Note v1.2`, is a note.

A bare name is looked up across the whole vault. If two files share it, the one
nearest the note wins and the tooltip says which. A name with a slash must match
the end of a path, and `./` or `../` is relative to the note. Wikilinks are not
percent-decoded: write the space, not `%20`. A Markdown link such as
`![](images/x.png)` is looked up next to the note first, then across the vault.

A web address in an embed, as in `![[https://example.com/a.png]]`, is a web
image: it follows **Load web images** in Settings, in the visual pane and in
exports, and a size after the `|` is ignored. An embed of a section of the note
you are editing, or of a web address, needs no folder, so it does not raise the
attachment bar.

Transcluded notes can go three levels deep, and a note never repeats itself
inside itself, so a loop shows a short notice instead. A section runs from its
heading to the next heading of the same or a higher level, sub-headings
included. Front matter is left out, and so are the `^abc123` markers, which belong to the
source. Links inside a transcluded note are shown as plain text unless they are
web or email addresses. A note larger than 2 MB is not embedded; the placeholder
says so.

Inside a table, write the pipe in an embed as a backslash and a pipe, as in the
rows above, or the table breaks. In the visual pane a chip that holds a bare pipe,
because it was copied or dragged into a cell or edited with Find and Replace, is
written to the file with the pipe escaped.

Some things are not embeds, and are left alone: anything in a fenced or indented
code block (also inside a list item or a quote), in a code span (also one that
wraps over a line break) or in front matter, a token whose opening bracket has a
backslash in front of it, an empty `![[]]`, and a token that runs over a line
break. A backslash before the `!` only, as in `\![[a.png]]`, leaves the `!` as
text and makes the rest a plain wikilink. In the visual pane, turning a paragraph
into a code block, or putting inline code around a token, changes the chip back
to its text, so the token is never hidden inside code. Undoing that with the
opposite action (turning the block back into a paragraph, or removing the inline
code) makes the token a chip again.

MD Studio has some known gaps. Only top-level headings can be named after the `#`
in a transclusion, not headings inside a list, a quote or a callout. A token that
Markdown splits into pieces, such as `![[_name_]]` with emphasis or a bare web
address inside the name, stays plain text and may gain backslashes if you edit
that paragraph in the visual pane. The same is true of a token inside the label
of a Markdown link, as in `[see ![[plan.png]]](https://example.com)`: it is shown
as text, and editing that paragraph in the visual pane writes the brackets with
backslashes (edit such a link in the Markdown pane). Obsidian's `%%comments%%` are not understood.
Clicking a wikilink does nothing yet, and there is no link autocomplete.

## Lists

| Source | Result | In the visual pane |
| --- | --- | --- |
| Lines starting `- `, `* ` or `+ ` | Bulleted list | **Bulleted list**, or type `- ` |
| Lines starting `1. ` (or `1) `) | Numbered list | **Numbered list**, or type `1. ` |
| A first item numbered `4.` | Numbered list starting at 4 | |
| `- [ ] Task` (GFM) | Task list item with an empty box | |
| `- [x] Done` (GFM) | Task list item with a ticked box | |

Nested lists are indented to line up with the parent item's text:

```markdown
1. Pack
   - Label boxes
   - Essentials box
2. Move
   - [ ] Book the van
   - [x] Tell the landlord
```

Only the number of the first item counts, and the rest follow in order, so a
list written `1.`, `1.`, `1.` renders as 1, 2, 3. A list with blank lines
between its items is *loose*, and each item is spaced as a paragraph. Task boxes
change by editing `[ ]` and `[x]` in the Markdown pane.

## Block quotes

| Source | Result | In the visual pane |
| --- | --- | --- |
| `> Quoted text` | A quotation set off from the text | **Quote**, or type `> ` |
| `>> Nested` | A quote inside a quote | |

Mark blank lines inside a quote with `>` to keep several paragraphs in it:

```markdown
> First paragraph of the quote.
>
> Second paragraph.
```

## Code blocks

A fenced code block, with an optional language hint after the opening fence:

````markdown
```json
{ "rooms": 12 }
```
````

| Source | Result | In the visual pane |
| --- | --- | --- |
| Lines between ```` ``` ```` fences | Code block, shown exactly as written | **Code block**, or type ```` ``` ```` and a space |
| Lines between `~~~` fences | The same | |
| ```` ```python ```` as the opening fence | Code block with a language hint; the Markdown pane colours the code | |
| Lines indented four spaces | Indented code block (no language hint) | |

A fence of four backticks can contain a line of three, which is how you show a
code block inside a code block.

## Horizontal rules

| Source | Result | In the visual pane |
| --- | --- | --- |
| `---`, `***` or `___` on a line of its own | A horizontal line | **Horizontal rule** |

Leave a blank line above `---`. Directly under a line of text it makes a level-2
setext heading instead.

## Tables (GFM)

```markdown
| Option         | Cost  | Ready by |
| :------------- | ----: | :------: |
| Stay and refit | 1.2 M | June     |
| Harbour site   | 1.8 M | March    |
```

| Separator cell | Column alignment |
| --- | --- |
| `---` or `:---` | Left |
| `---:` | Right |
| `:---:` | Centred |

The first row is the header, and the second row of dashes is required. The
pipes do not need to line up, and the outer pipes are optional. Cells hold
inline content only (emphasis, links and code), so there are no lists, line
breaks or merged cells inside a table. Write a literal pipe inside a cell as
`\|`. In the visual pane, **Insert table** adds a three by three table.

## Footnotes

```markdown
The site floods about once a decade.[^flood]

[^flood]: Municipal climate report, 2025.
```

The marker `[^label]` goes in the text. The definition `[^label]: ...` can sit
anywhere, usually at the end. Labels can be numbers or words. Footnotes render
in MD Studio's visual pane and on GitHub, but they are not part of CommonMark,
and MD Studio's exports currently show them as the plain text you wrote.

## Escaping

A backslash before a punctuation character shows the character instead of its
Markdown meaning.

| Source | Result |
| --- | --- |
| `\*not italic\*` | \*not italic\* |
| `\# not a heading` | \# not a heading |
| `1986\. A good year.` | 1986\. A good year. (not a numbered list) |
| `\[not a link\](x)` | \[not a link\](x) |

Characters that can be escaped: `` \ ` * _ { } [ ] ( ) # + - . ! | `` and the
other ASCII punctuation marks.

## Raw HTML

CommonMark allows HTML tags in the text. Avoid them in MD Studio documents.
They are unreadable as plain text, different tools treat them differently, and
MD Studio does not render them. HTML exports show them as text.

## CommonMark or GFM at a glance

| Construct | CommonMark | GFM adds |
| --- | --- | --- |
| Headings, paragraphs, line breaks | Yes | |
| Emphasis, strong, inline code | Yes | Strikethrough |
| Links, images, `<...>` autolinks | Yes | Bare-address autolinks |
| Bulleted and numbered lists | Yes | Task lists |
| Block quotes, code blocks, rules | Yes | |
| Tables | | Yes |
| Footnotes | | Supported by GitHub; rendered in MD Studio's visual pane |
