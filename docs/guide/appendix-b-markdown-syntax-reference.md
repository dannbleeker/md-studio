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

Pasting (**Ctrl+V**) or dropping an image writes this syntax for you. In Edge or
Chrome with the document saved on disk, MD Studio saves the image in an
`images` folder next to the document and links it by relative path. Elsewhere it
shrinks the image to at most 1600 px and embeds it as a `data:` address. See
[Chapter 4](04-formatting-and-rich-content.md).

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
