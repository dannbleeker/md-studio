# Structuring Documents

### Headings, lists and sections, and keeping a document navigable as it grows

A short note needs no structure. You write it, read it, and move on. Documents
grow, though. The meeting note becomes a project brief, the brief becomes a plan,
and one day you spend half a minute scrolling for the paragraph about the budget.

Markdown gives you headings, lists and blank lines to deal with this. MD Studio
reads that structure back to you through the outline, the heading jump in the
command palette, and linked scroll, and all three work only as well as your
headings do.

## Headings are the outline

A heading is a line that starts with one to six `#` characters and a space. The
number of `#` signs is the level.

```markdown
# Office move 2027

## Why we are moving

## Options

### Stay and refit

### Move to the harbour site

## Timeline
```

The visual pane renders this as a large title, three section headings, and two
smaller sub-headings under *Options*. The Markdown pane reads almost the same
way, because the hash marks are the structure and you can see them in both
views.

Most documents do well with one H1 at the top for the title (one in total, not
one per section), H2 for the sections you would list in a table of contents, and
H3 now and then when a section has parts of its own. If you find yourself
reaching for H4, ask whether that section wants to be its own document. The end
of this chapter comes back to that.

Do not skip levels. An H4 directly under an H2 renders fine, but it tells the
reader a layer is missing, and the outline shows the gap as an odd jump in
indentation.

Keep headings short and write them as labels. *Timeline* is a good heading. *Here
is when we think everything will happen* is a paragraph in a heading's clothes.
Someone skimming the outline should be able to guess what is under each label.

### Making headings in either pane

In the Markdown pane you type the hash marks. In the visual pane, put the cursor
in a paragraph and pick a level from the **Text style** menu at the left of the
format toolbar: **Paragraph**, **Heading 1**, **Heading 2**, **Heading 3** or
**Heading 4**. Choosing **Paragraph** turns a heading back into ordinary text.
The editor library behind the visual pane is also set up to convert `## ` typed
at the start of an empty line into a heading.

Levels 5 and 6 exist in Markdown but are not in the menu. If you need them, type
them in the Markdown pane, and then ask yourself again whether you need them.

### The other kind of heading

Markdown has a second, older way to write the first two levels: underline the
text with `=` for level 1 or `-` for level 2.

```markdown
Office move 2027
================

Why we are moving
-----------------
```

These are *setext* headings, and the `#` style is called *ATX*. Both are
standard, both render the same, and MD Studio recognises both, so a file written
with setext headings needs no converting. For your own writing, ATX is the better
habit. It covers all six levels, and a line of dashes has another meaning (see
*Horizontal rules* in [Chapter 4](04-formatting-and-rich-content.md)).

## What MD Studio counts as a heading

The outline, the heading jump and linked scroll all read the same list of
headings. MD Studio finds **top-level ATX and setext headings**, the ones that
sit directly in the document and that a renderer turns into section titles. It
skips a `#` line inside a fenced or indented code block (a shell comment, say), a
heading written inside a block quote or a list item, and `#hashtag` with no space
after the hash, which is just a paragraph.

So if a heading you expected is missing from the outline, check whether it has
ended up inside a quote or a list, or whether the space after the `#` is missing.

## Seeing the shape: the outline

Press **Ctrl+Shift+O**, or click **Outline** in the toolbar, and a panel opens
beside the editors with every heading in the document, indented by level. Click
one and that section comes to the top of both panes. As you scroll, the heading
of the section you are reading is highlighted, so the panel also tells you where
you are. On a narrow screen the outline covers the editors instead of sitting
beside them. In a document with no headings yet, the panel says *Headings appear
here.*

Reading the outline top to bottom, without the body text, is the quickest
structural review there is. Does it tell the story of the document, in the order
a reader needs it? You will see problems there that you cannot see from inside
the prose.

When you know where you want to go, the command palette is faster. Press
**Ctrl+K** and type `#`. The palette, whose placeholder reads *Type a command, or
\# to jump to a heading*, switches from commands to headings. Type a few letters
of the heading and press **Enter**. The matching is forgiving, so `#harb` finds
*Move to the harbour site*. If you would rather pick a command, **Go to heading…**
in the palette does the same thing.

## Lists: sets, sequences and to-dos

Markdown has three kinds of list, and each says something different about its
items.

A bulleted list is a set: the items belong together and their order is not the
point. Start each line with `-`, `*` or `+` and a space.

```markdown
- Meeting rooms
- Bike storage
- Parking
```

A numbered list is a sequence. Use one when the order matters, as in steps,
rankings, or a procedure someone will follow.

```markdown
1. Give notice on the current lease.
2. Sign the new lease.
3. Book the movers.
```

Markdown takes the number of the first item and counts on from there. You can
write every item as `1.` and let the renderer number them, which saves
renumbering when you insert a step in the middle. A list that starts at `4.`
renders as 4, 5, 6, handy when a list picks up again after a paragraph of
explanation.

A task list is a list of to-dos. It is a GitHub Flavored Markdown extension: a
bulleted item that starts with `[ ]` or `[x]`.

```markdown
- [x] Measure the new floor plan
- [ ] Get quotes from three movers
- [ ] Tell the post office
```

The visual pane shows each item with an empty or ticked box. To tick an item
off, change `[ ]` to `[x]` in the Markdown pane. That one character holds the
whole state, which is why task lists survive any tool that reads text.

### Nesting

Indent a list item under another to nest it. Line the child up with the text of
its parent: two spaces under a `-` bullet, three under `1.`.

```markdown
1. Pack
   - Label every box with a room
   - Keep one box of essentials
2. Move
```

Nesting is structure in the same way headings are. Two levels are common and
three are sometimes right. At four, the list usually wants to be a section with a
heading.

### Tight and loose lists

A list with no blank lines between its items is *tight*, with each item on its
own compact line. Put a blank line between items and the list becomes *loose*:
each item is rendered as a paragraph, with more space around it. Tight lists suit
short items, and loose ones suit items that run to several sentences. You can mix
the two in one list, but you rarely mean to.

### Lists from the toolbar

In the visual pane, **Bulleted list** and **Numbered list** in the format toolbar
turn the current paragraph into a list. The visual editor is also set up to start
a list when you type `- ` or `1. ` at the start of a line.

## Blank lines are structure too

A blank line ends a paragraph. A single line break inside a paragraph does not:

```markdown
The lease ends in March.
We have six months to decide.

The new site is available from January.
```

This renders as two paragraphs, and the first one reads *The lease ends in March.
We have six months to decide.* on a single line. That means you can break lines
in the Markdown pane wherever you like without changing the result. One sentence
per line is a popular habit, because it makes changes easy to compare. When you
do want a line break inside a paragraph, end the line with a backslash.

Blank lines also keep blocks apart. Put one before and after every heading, list,
quote, table and code block, and two blocks will never merge into one by
surprise.

## Sections as movable units

In Markdown, a section is a heading and everything after it up to the next
heading at the same or a higher level. In the example at the top of this chapter,
the *Options* section includes both H3 subsections and stops at *Timeline*.
Nothing opens or closes a section. The heading marks the boundary.

That makes sections easy to move. Work in the Markdown pane: select from a
heading down to the line before the next heading at its level, cut, put the
cursor at the start of the heading it should go before, and paste. The outline
gets you to both places quickly. The section is plain text, so its subsections go
with it.

This works best when each section stands on its own. A section that says *as
described above* breaks when it moves, so name the thing instead: *as described
under Options*. Heading levels matter here too. A sub-point written as an H2 when
it belongs under another H2 will not move with its parent.

**Find and replace** helps with structure as well. Press **Ctrl+F** in the
Markdown pane, switch on **Regular expression** (the `.*` button) and search for
`^## ` to step through every H2, with a count of how many there are. Searching
for `^#{4,} ` finds every heading at level 4 or deeper, a quick check on whether
the document has grown too deep.

## Headings double as scroll anchors

In split view, linked scroll keeps both panes on the same part of the document.
It goes by headings rather than pixels, because the two panes render the same
text at very different heights. A table is a few short lines in the Markdown pane
and a tall grid in the visual one, so matching pixel positions would drift apart
within a page. MD Studio works out which section you are in and how far through
it, and puts the other pane at the same point. [Chapter
2](02-anatomy-of-the-editor.md) covers how to switch it on and off.

In practice, your headings are the anchors. Between two headings the panes follow
each other proportionally, which is close enough over a few screens of text. A
long stretch with no headings gives linked scroll nothing to hold on to, and the
panes can drift noticeably out of step in the middle of it. When that happens,
the stretch usually needs a heading anyway.

## Visual edits and your source style

Markdown often has several spellings for the same thing: `-` or `*` for bullets,
`**` or `__` for bold, ATX or setext for headings. When you edit in the Markdown
pane, what you type is what is saved.

When you edit in the visual pane, MD Studio rewrites **only the blocks you
changed**, and those blocks come out in the visual editor's own style: `-`
bullets, `**` for bold, ATX headings. Every block you did not touch keeps its
original text exactly, spacing included. If your file uses `*` bullets and you
add an item to one list in the visual pane, that list switches to `-` and the
rest of the document stays as it was.

Usually this does not matter. If you want a consistent source style, for small
git diffs or a colleague's house style, make those edits in the Markdown pane.
[Chapter 2](02-anatomy-of-the-editor.md) explains why the trade-off exists.

## When a document has outgrown its structure

A structure that worked at two pages can be a maze at twenty. Watch for an
outline that no longer fits on the screen, so that you scroll the table of
contents to find the table of contents. H4s are another sign. They are not always
wrong, but they often mean one section has become a document of its own. So is a
single section that holds most of the text, with the other headings pointing into
one sprawling room. A section called *Misc*, *Other* or *Notes* is a drawer
things fall into, and it only grows. And if you have started using Find to get
around, searching for a word you know is in there, the headings have stopped
telling you where things are.

The first fix is to restructure in place. Read the outline and rename headings
until they say what is under them. Promote a sprawling H3 to an H2, merge two thin
sections, and empty the *Misc* drawer into the sections where its contents
belong.

The second fix is to split. Pick a section that stands on its own, cut it, and
start a **New** document (**Alt+N**). Paste it in, promote its heading to the H1,
and save it next to the original under a clear name. Both documents stay open as
tabs, so you can go back and forth while you tidy the seams. Then leave a
pointer where the section used to be:

```markdown
## Budget

The full budget is in [budget.md](budget.md).
```

This is a relative link. It names a file in the same folder, so it keeps working
wherever the folder goes, and GitHub and most Markdown tools follow it. [Chapter
5](05-managing-files-locally.md) has more on keeping a folder of related
documents together.

Once you have several files, a short index document that links each of them, with
a line of explanation apiece, gives the set the outline that a single document
gets from its headings.

## Now you try

Open a document of your own, or start one with three or four sections you know
well, such as a project, a trip or a recipe collection.

1. Give it one H1 and make every section an H2. Open the outline with
   **Ctrl+Shift+O** and read only the headings. Rename any that do not say what is
   under them.
2. Add a bulleted list, a numbered list and a task list where each fits the
   content. Tick one task off by changing `[ ]` to `[x]`, and look at its box in
   the visual pane.
3. Press **Ctrl+K**, type `#` and a few letters, and jump to your last section.
4. Move one section above another by cutting and pasting it in the Markdown pane.
   Check the outline to see that it moved whole.
5. Search for `^## ` with **Regular expression** on, and count your sections.
6. If one section is pulling away from the rest, split it into its own file and
   link to it.

The next chapter covers what goes inside the sections: emphasis, links, images,
tables and code.
