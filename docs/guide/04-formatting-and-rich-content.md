# Formatting and Rich Content

### Links, images, tables, code blocks, footnotes

Structure gives a document its shape. This chapter covers what goes inside it: a
word that needs weight, a link to a source, a screenshot, a table comparing a few
options, a snippet of code that has to be copied exactly.

Each of these is a small piece of punctuation that you can read in the Markdown
pane and that the visual pane renders as something richer. If the source stops
being readable as text, you are probably using more formatting than the writing
needs.

## Emphasis

Wrap words in one asterisk for italic and two for bold:

```markdown
The lease ends in *March*, not April. Deposits are **not refundable**.
```

The visual pane shows *March* in italic and **not refundable** in bold.
Underscores work too (`_March_`, `__not refundable__`). Asterisks are the safer
habit, because Markdown ignores underscores inside words on purpose so that
`snake_case_names` come through as written.

Strikethrough is a GitHub Flavored Markdown extension. Wrap the text in double
tildes, `~~like this~~`, and it renders crossed out. In a running document it
shows that a decision changed: ~~Friday~~ Thursday.

In the visual pane, **Ctrl+B** and **Ctrl+I** toggle bold and italic on the
selection, and the format toolbar has **Bold**, **Italic** and
**Strikethrough** buttons. A button shows as pressed when the selection already
has that formatting, and clicking it again removes it. The visual editor is also
set up to turn typed asterisks into formatting, so `**urgent**` should turn bold
as you type the closing pair.

Use emphasis the way you would raise your voice, which is to say rarely.

## Inline code

Backticks mark a fragment as code, or as anything that has to be read literally,
such as a file name, a command or a setting.

```markdown
Save the file as `move-plan.md` and run `git add move-plan.md`.
```

The fragment renders in a monospaced font, and nothing inside it counts as
formatting, so `*not italic*` keeps its asterisks. To show a backtick itself,
wrap the fragment in two backticks with a space inside: ``` `` `code` `` ```
shows `` `code` ``. In the visual pane, **Inline code** in the toolbar marks the
selection.

## Links

A link is the visible text in square brackets followed by the address in
parentheses:

```markdown
See the [floor plan](https://example.com/floorplan) before Friday.
```

The visual pane shows *floor plan* as a link. You can add a title in quotes after
the address, and most renderers show it as a tooltip:
`[floor plan](https://example.com/floorplan "Ground floor, rev. 3")`.

To make a link in the visual pane, select the text and click **Link** in the
format toolbar. A small dialog asks for the address, starting from `https://`.
Type or paste it and choose **Apply**. With the cursor in an existing link, the
same button shows the current address so you can change it, and the field's label
tells you how to remove the link: *Link address (leave empty to remove the
link)*. Clear the field and apply, and the text stays while the link goes.

### Links to other files

An address does not have to start with `https://`. A **relative** link names a
file next to the document:

```markdown
The numbers are in [budget.md](budget.md), the photos in [images](images/).
```

Relative links keep working when the whole folder is moved, zipped, emailed or
pushed to GitHub, so they are the way to connect a set of documents (see
[Chapter 3](03-structuring-documents.md) on splitting documents).

### Autolinks

When the address is the text you want to show, put it in angle brackets:
`<https://example.com>`. GitHub Flavored Markdown also turns bare addresses into
links by itself, so `www.example.com` and `https://example.com` in running text
are both clickable once rendered. The angle bracket form works for email
addresses too: `<someone@example.com>`.

### Reference links

In a paragraph with many links, you can move the addresses out of the way:

```markdown
The [lease][1] and the [insurance terms][2] both changed.

[1]: https://example.com/lease
[2]: https://example.com/insurance
```

The definitions do not render. They only supply the addresses. Inline links are
easier to move around, so use references only where they make the paragraph
easier to read.

## Images

An image is a link with an exclamation mark in front. The text in the brackets is
the *alt text*, which a screen reader reads out and which shows if the image
cannot be loaded.

```markdown
![Ground floor plan with the new meeting rooms](images/floorplan.png)
```

Write alt text that says what the picture shows. *Image* or *screenshot* tells a
reader who cannot see it nothing.

### Pasting and dropping images

You rarely need to type image links by hand. Paste an image with **Ctrl+V** into
either pane, or drag an image file from your desktop onto one. What happens next
depends on where the document lives.

In Edge or Chrome, with the document saved on disk, the first image you add
brings up a question: *Save images next to the document?* Choose **Choose
folder…** and pick the folder the document is in (the folder picker opens
there). From then on, every image you paste or drop is saved as its own file in
an `images` folder beside the document, named by date and time such as
`image-20261002-171530.png`, and linked with a relative path:

```markdown
![floorplan](images/image-20261002-171530.png)
```

The alt text starts out as the original file name, so replace it with a real
description. If you pick a folder that does not contain the document, MD Studio
tells you so and embeds that image, and the next image asks again. If you choose
**Cancel**, the image is embedded and MD Studio stops asking for that document
for the rest of the session.

In Firefox, Safari, on phones, or before you have saved the document, the image
is embedded in the document itself. MD Studio first shrinks it so the longest
side is at most 1600 pixels, then writes it into the Markdown as a long encoded
address beginning `data:image/`. The document then carries its pictures inside
it. That is convenient for a single file, but it makes the source long and hard
to read. A large image brings up a notice that the document is getting big, with
the reminder that saving it to disk lets images go in a folder.

### Files next to the document, or web addresses

Images can also come from the web: `![Logo](https://example.com/logo.png)`. That
keeps the document small, but the picture only shows while you are online, and
only as long as the other site keeps it at that address.

| Where the image lives | Good for | Watch out for |
| --- | --- | --- |
| `images` folder next to the document | Documents on disk, folders in git, anything you share as a folder | Send the folder, not just the `.md` file |
| Embedded in the document | A single self-contained file; browsers without folder access | Long, unreadable source; larger files |
| A web address | Images that already live online | Needs a connection; can break if the site changes |

For anything you will keep, the folder is the best default. The Markdown stays
short, the images are ordinary files you can open, replace or compress, and the
whole folder travels together. [Chapter 5](05-managing-files-locally.md) covers
working with files on disk, and [Chapter 6](06-exporting-and-sharing.md) covers
what happens to images when you export.

## Tables

Tables are a GitHub Flavored Markdown extension, and of everything in this
chapter they look the most different in source and in the result. Pipes separate
the columns, and a row of dashes separates the header from the body:

```markdown
| Option           | Cost   | Ready by |
| ---------------- | -----: | :------: |
| Stay and refit   | 1.2 M  | June     |
| Harbour site     | 1.8 M  | March    |
```

This renders as a three-column grid with a header row. The colons in the
separator row set the alignment. `---:` right-aligns a column, which suits
numbers, `:---:` centres it, and `:---` or plain `---` aligns it to the left.

The pipes do not have to line up. This is the same table:

```markdown
| Option | Cost | Ready by |
| --- | ---: | :---: |
| Stay and refit | 1.2 M | June |
| Harbour site | 1.8 M | March |
```

Aligned columns are easier to read in the Markdown pane, and ragged ones need no
re-padding when a cell grows. If a cell needs a literal pipe character, write it
as `\|`.

In the visual pane, **Insert table** in the format toolbar puts a three by three
table at the cursor for you to fill in.

### When a table helps

Use a table when the reader will compare across rows or down columns, such as
options against criteria or people against tasks. If each row is really a short
paragraph, use a list or a short section per item instead.

Markdown tables are deliberately simple. Each cell holds one line of inline
content. Emphasis, links and code work, but there are no lists, multiple
paragraphs, merged cells or column widths. Keep tables to three to five columns
with short cells. If a table needs sideways scrolling in the Markdown pane,
nobody will want to keep it up to date.

## Code blocks

For more than a fragment of code, use a *fenced* code block: a line of three
backticks, the code, and another line of three backticks. Put a language name
right after the opening fence as a hint:

````markdown
```python
def total(costs):
    return sum(costs)
```
````

Everything between the fences is shown exactly as written, in a monospaced font,
with line breaks and indentation kept and no Markdown formatting applied. MD
Studio's Markdown pane uses the language hint to colour the code, and other
tools, GitHub and static site generators among them, use it to colour the code
for readers. Common hints are `python`, `javascript`, `json`, `bash`, `sql`,
`yaml` and `markdown`. Leave the hint off, or write `text`, for output, logs or
anything else that is not a programming language.

Three tildes (`~~~`) work as a fence too, which helps when the code itself
contains a line of three backticks, as it does when you write about Markdown. A
longer fence of four backticks also works. That is how the example above shows a
fence inside a fence.

In the visual pane, **Code block** in the toolbar turns the current paragraph
into a code block. The visual editor is also set up to start one when you type
three backticks and a space at the start of a line. While the cursor is in a code
block, the **Text style** menu shows a dash, since a code block is neither a
paragraph nor a heading.

Lines indented by four spaces also make a code block, the older *indented* form.
It cannot carry a language hint and is easy to trigger by accident, so use fences.

## Block quotes

Start a line with `>` to quote it:

```markdown
> We want everyone within a 30-minute commute.
>
> From the staff survey, 2026
```

The visual pane sets the quote off with a bar and indentation. A line holding
only `>` keeps two paragraphs inside the same quote. Quotes can hold any other
Markdown, lists and headings included, and they nest: `>>` is a quote within a
quote, handy when you reply to an email that quoted someone else.

Use quotes for words that are not yours, such as a source, a requirement or a
customer's message. In the visual pane, **Quote** in the format toolbar wraps the
current paragraph in a quote, and the visual editor is set up to do the same when
you type `> ` at the start of a line.

## Footnotes

A footnote moves a remark or a source out of the sentence. Mark the spot with a
caret label in square brackets, and write the note anywhere in the document with
the same label and a colon:

```markdown
The harbour site floods about once a decade.[^flood]

[^flood]: Municipal climate report, 2025, page 14.
```

The label can be a number or a word. Words are easier to keep straight when you
move paragraphs around. The visual pane renders the marker as a small reference
and the note as a footnote definition.

Footnotes are less portable than anything else in this chapter. GitHub renders
them, and so do MD Studio's visual pane and many other tools, but they are not
part of CommonMark, and MD Studio's exports currently pass them through as the
plain text you wrote. If a document will be exported, check how its footnotes
come out. For important sources, an inline link or a *Sources* section may serve
better.

## Horizontal rules

Three or more dashes, asterisks or underscores on a line of their own make a
horizontal rule, a line across the page:

```markdown
---
```

Use one to mark a shift that does not call for a heading, for example between a
summary and the details, or between two unrelated notes in a log. **Horizontal
rule** in the format toolbar inserts one.

Watch out for one thing: a line of dashes directly under a line of text makes a
level-2 setext heading (see [Chapter 3](03-structuring-documents.md)). Leave a
blank line above `---`, or use `***`, which has no second meaning.

## CommonMark, GitHub Flavored Markdown, and what to avoid

Markdown began as a loose description, and for years every tool read it a little
differently. **CommonMark** is the precise specification that settled the core:
paragraphs, headings, emphasis, links, images, lists, quotes, code and rules.
**GitHub Flavored Markdown** (GFM) is CommonMark plus a few extensions: tables,
task lists, strikethrough and bare-address autolinks.

MD Studio reads CommonMark plus GFM, and its visual pane also renders footnotes.
Most tools agree on that set, so a document written in MD Studio reads the same
on GitHub, in most note apps and in most static site generators. [Appendix
B](appendix-b-markdown-syntax-reference.md) lists every construct with its source
and result.

Markdown also allows raw HTML in the middle of the text. Avoid it. It is
unreadable as plain text, it behaves differently from tool to tool, and MD Studio
does not render it. HTML exports show it as text instead of running it, so a
document someone sends you can never run code in the exported page. If you find
yourself reaching for HTML to get a layout, the plain Markdown version is usually
the better document anyway.

## Now you try

Take the document you structured in the last chapter and add to it.

1. Make the one phrase a skimming reader must not miss **bold**, and nothing
   else. Cross out a detail that has changed with `~~strikethrough~~`.
2. Select a word in the visual pane, click **Link**, and give it an address. Then
   clear the address to remove the link again.
3. Paste a screenshot. If your document is saved on disk in Edge or Chrome,
   choose its folder and look for the new `images` folder beside it. Replace the
   alt text with a real description.
4. Compare two or three options in a small table, and right-align the column of
   numbers with `---:`.
5. Add a fenced code block with a language hint, even if it is only a few lines
   of `json`, and look at the colours in the Markdown pane.
6. Quote a sentence from a source, and put the source itself in a footnote.

Then read the result in the Markdown pane alone (**Ctrl+2** in the installed app,
or **Text** in the toolbar). If it still reads like a well-kept text file, the
formatting is doing its job.

The next chapter is about where your documents live: files, folders, and keeping
them safe on your own machine.
