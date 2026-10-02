# Anatomy of the Editor

### The split view, the two panes, and what "synced" means

You can write in MD Studio without reading this chapter. Type on either side,
press Save, and it works. But the editor is built around one idea, two views
of a single document, and once that is clear the rest makes sense: why the
right side updates a moment after the left, why your formatting survives a
visual edit, and why the panes scroll together the way they do.

Open a document to follow along. The sample document from the start screen
(**Try the sample document**) works well, because it has headings, lists, a
table and a code block.

## The toolbar

The toolbar runs across the top of the window. At the far left, **MD Studio**
takes you back to the start screen (on a narrow screen the button just says
**MD**). Next to it is the file name, for example `weekend.md`. A dot after
the name means **unsaved changes**: what you see differs from what was last
saved to disk. The browser keeps the document either way (see
[Chapter 1](01-your-first-document.md)), so the dot only tells you about the
file.

Then come the file actions, **New**, **Open**, **Save** and **Export**.
Chapter 1 covers the first three. Export saves a copy in another format and
has [Chapter 6](06-exporting-and-sharing.md) to itself.

The right-hand group starts with the view mode switch, three buttons labelled
**Split**, **Text** and **Visual**, with the current view pressed. In split
view on a wide screen, a **Linked scroll** checkbox sits next to it; more on
that below. After that come **Outline**, which opens a panel listing the
document's headings, **Commands**, which opens the command palette, and
**Settings**.

When two or more documents are open, a tab bar sits between the toolbar and
the editor. Each tab shows the file name and, if the document has unsaved
changes, the same dot.

## The text pane

In split view, the left side is the **Markdown source**: the document as it
is stored in the file, every `#`, `*` and `-` included. Nothing here is hidden
or converted. Open the file in Notepad and you see the same characters in the
same places.

To make it easier to read, the text pane colours the Markdown as you type.
Heading markers, emphasis, links and code stand out from ordinary text, and
the colours follow the light or dark theme. Inside a fenced code block, the
code is coloured by language when you name the language after the opening
fence:

````markdown
```js
const greeting = 'Hello, Markdown';
```
````

By default the text pane shows **line numbers** in the margin and **wraps long
lines** to fit the pane, so a long paragraph doesn't run off to the right. You
can turn either off in Settings.

Use the text pane when you need precision: fixing a stray character, lining
up a table, choosing how a list is marked, or pasting in Markdown from
somewhere else.

## The visual pane

The right side is the **visual editor**. It shows the same document formatted,
with headings as headings, tables as grids and links as links. It looks like a
finished page, but you can edit it directly, as in a word processor. Click
into a paragraph and type, press Enter at the end of a list item to start the
next one, or press **Ctrl+B** for bold and **Ctrl+I** for italic.

Above the visual pane is a small **Formatting** toolbar. It has a **Text
style** menu (paragraph, or heading 1 to 4), then buttons for bold, italic,
strikethrough, inline code, link, bulleted and numbered lists, quote, code
block, table and horizontal rule. A button shows as pressed when the selection
already has that formatting. [Chapter 4](04-formatting-and-rich-content.md)
goes through them.

The visual pane is good for drafting. When you are trying to get a thought
down, the symbols get in the way, and here you don't see them.

### Undo where you made the change

**Ctrl+Z** undoes and **Ctrl+Y** redoes, in whichever pane has the cursor.
Undo works most predictably in the pane where you made the change. If you make a word bold on the right, Ctrl+Z on the right takes the
bold away again, and the left follows.

## Three views

The view mode switch decides which panes you see.

| View | Shortcut | What you see |
| --- | --- | --- |
| **Split** | Ctrl+1 | Markdown source on the left, the formatted document on the right |
| **Text** | Ctrl+2 | Markdown source only |
| **Visual** | Ctrl+3 | Formatted document only |

The command palette has the same three as *View: split*, *View: text only* and
*View: visual only*. In an ordinary browser tab, Ctrl+1 to Ctrl+3 switch the
browser's own tabs, so use the toolbar or the palette there. In the installed
app (Chapter 1) the shortcuts work.

Switching views only hides a pane. Both editors keep running, so switching is
instant, and a pane you bring back is already up to date with what you typed
in the other.

On a narrow screen such as a phone, split view stacks the two panes, source
above and formatted below.

The view MD Studio starts in is a setting, **Default view mode**. If you
mostly write in one pane, set it there and you will rarely touch the switch.

## What "synced" means

**There is one document, and the two panes are two views of it.** MD Studio
doesn't copy two documents back and forth. It holds one Markdown text, the
same text that is saved to your file. The left pane shows that text as it is,
and the right pane shows what it means. An edit in either pane changes that
one text, and the other pane catches up.

When you type in the text pane, the visual pane updates shortly after you
pause, in roughly a sixth of a second. It redraws only the part around your
change, which keeps it quick on long files. A text edit never comes back to
you "tidied up" by the visual pane: what you type on the left is what ends up
in the file.

When you edit in the visual pane, the change is written back into the
Markdown a fraction of a second later. The text pane changes only the
characters that differ, so your cursor and scroll position on the left stay
where they were.

Try it with the sample document in split view. Put the cursor on a word on
the right and press **Ctrl+B**, and `**` appears on both sides of the word on
the left. Then type `## A new section` on an empty line on the left, and a
heading appears on the right.

### Why a visual edit can tidy formatting

Markdown often has more than one way to write the same thing. A bullet can
start with `-`, `*` or `+`. A top-level heading can be a line starting with
`#`, or a line underlined with `===`. These look identical in the visual pane,
because they mean the same thing.

The visual pane works with meaning, not characters. After an edit there, it
writes the document back out as Markdown in its own style. Left alone, that
would rewrite every block in the file the first time you touched the visual
pane, which hurts if you have a house style, or if you keep your notes in git
and expect a one-word change to show up as a one-line difference.

So after each visual edit, MD Studio compares the new Markdown with what was
there before and **keeps your original text for every block you didn't
change**. Only the block you edited, usually one paragraph, list or heading,
is written in the editor's style, and that may change its markers or spacing
from how you wrote it.

For example, suppose your file contains:

```markdown
Title
=====

* star bullet
* another

__strong__ and *em*

Last paragraph here.
```

In the visual pane, you click at the end of the last paragraph and type
` Edited`. The heading with its `=====` underline, the `*` bullets and the
`__strong__` paragraph come back exactly as you wrote them. Only the last
paragraph has changed.

MD Studio also checks each merge. If it can't be sure that keeping your
original text gives the same document, for instance when links are defined
elsewhere in the file and an edit could change what they point to, it uses
the visual pane's version throughout.

This matters when you care about the characters as well as the result: a file
under version control, a document with a house style for lists or emphasis,
or Markdown that another tool reads. For those, make careful edits in the
text pane, where nothing is rewritten for you. When you are just writing, use
whichever pane suits you.

## Linked scroll

In split view the two panes scroll together, so the paragraph you are reading
on one side is also in view on the other. This is **linked scroll**, and it is
on by default.

The two panes are very different heights. A table is a handful of short lines
in the text pane and a tall grid on the right; an image is one line of
Markdown and hundreds of pixels of picture. If the panes scrolled the same
distance, or the same percentage, they would drift apart within a page or two.

So linked scroll **follows headings, not pixels**. MD Studio knows where every
heading is in each pane. When you scroll, it works out which section you are
in and how far through it, say 40 percent of the way through *Budget*, and
scrolls the other pane to the same point in its own *Budget* section. At each
heading the panes line up exactly, and between headings they move
proportionally. Scroll to the bottom of one pane and the other goes to its
bottom too.

The pane you are in leads. Whichever pane has the mouse pointer over it, or
the cursor in it, drives the other. Move the pointer to the other side and
that side takes over, so the two never fight over the scrolling.

Linked scroll therefore works best in a document with headings, and the more
evenly they are spread, the closer the panes stay. A long document with no
headings has only its top and bottom to line up. [Chapter 3](03-structuring-documents.md)
has more on headings, which are useful for much more than scrolling.

To turn linked scroll off, untick **Linked scroll** in the toolbar, choose
*Toggle linked scroll* in the command palette, or clear **Link scrolling
between panes in split view** in Settings.

## The outline

**Outline** in the toolbar, or **Ctrl+Shift+O**, opens a panel listing the
document's headings. Click one to bring that section to the top of both panes.
The section you are reading is highlighted as you scroll. On a narrow screen
the outline slides over the editor instead of sitting beside it.

## The command palette

Most of what MD Studio can do is also a command, and the **command palette**
lists them. Open it with **Ctrl+K**, **Ctrl+Shift+P** or the **Commands**
button. The box says *Type a command, or # to jump to a heading*.

Start typing and the list narrows to matching commands, then press Enter to
run the highlighted one. A few letters is usually enough: `save a` finds
*Save as…*, `split` finds *View: split*, and `pdf` finds *Export as PDF*.
Commands that have a shortcut show it beside the name, which is an easy way to
pick up the keys.

Type `#` instead, and the palette lists the document's headings. Add a few
letters to narrow them down, and Enter jumps to that section. *Go to heading…*
in the palette does the same. In a long document this is often the fastest
way to move around.

Some commands are only in the palette, such as *Save as…*, *Toggle linked
scroll*, *Open the sample document*, *Go to start screen* and *Print*.
[Appendix A](appendix-a-keyboard-reference.md) lists every shortcut.

## Settings

**Settings** in the toolbar, or **Ctrl+,**, opens a short dialog. **Theme** is
**Match system**, **Light** or **Dark**. **Default view mode** is **Split**,
**Text** or **Visual**, the view MD Studio opens in. **Text size** is
**Small**, **Medium** or **Large** and applies to both panes.

Three checkboxes follow. **Wrap long lines in the Markdown pane** and **Show
line numbers in the Markdown pane** are both on by default. **Link scrolling
between panes in split view** is the same switch as the toolbar checkbox.

Changes apply immediately. Click **Done** to close the dialog. The browser
keeps your settings, so they are still there next time.

## Now you try

Open the sample document in split view and see the one document behind the
two views for yourself.

1. Type a new paragraph in the text pane and stop. Count to one, and the
   visual pane has it.
2. Click into that paragraph on the right, select a word, and press
   **Ctrl+B**. On the left the word now has `**` around it, and your cursor
   in the text pane hasn't moved.
3. Watch the style rule at work. On the left, add a heading written with an
   underline: a line `Notes`, and under it a line `=====`. The right side
   shows an ordinary heading. Now type a word into a different paragraph on
   the right, and look left: your `=====` underline is still there, because
   you didn't edit that block in the visual pane.
4. Scroll slowly through the visual pane and watch the text pane keep pace,
   lining up at each heading. Move the pointer to the left and scroll there,
   and the left leads.
5. Press **Ctrl+K**, type `#`, and jump to the last heading. Then press
   **Ctrl+2**, **Ctrl+3** and **Ctrl+1** (in the installed app, or use the
   toolbar in a browser tab), and notice that nothing reloads.
6. Open **Settings** and try a different text size and theme. Turn line
   numbers off, and decide whether you miss them.

From here on the book is about what you put in the editor, starting with how
to give a document a structure that holds up as it grows.
