# Writing as Practice

### Plain text as a discipline

The first six chapters were about the tool: the two panes, headings and lists, formatting, files and exports. This chapter is about the habits those features make easy. There are no new buttons in it. Every move was covered somewhere in Chapters 1 to 6, and I point back to where. What this chapter adds is the order you do things in, and the reasons for it.

I think of plain text as a way of working more than as a cheaper word processor. You keep the words in a format you own, you add structure once you know what it should be, and you let every revision leave a record you can read.

## Plain text is the feature

A Markdown file is a text file with a few conventions in it. That sounds like a limitation until you think about what it means over ten or twenty years.

It stays readable. Open a `.md` file in Notepad, in a terminal, on a phone, or in an editor nobody has written yet, and you will see the words with their structure intact, because the markup was designed to be read as it is:

```markdown
# Offsite plan

We meet on **12 March** in Aarhus.

## Agenda

1. Review of last year
2. Priorities for the next two quarters
3. Open questions
```

Nobody needs to be told that `#` starts a title or that `1.` starts a numbered list, and the asterisks around the date still read as emphasis. A word-processor file from twenty years ago is a different story. You can open it today only if the right program still exists and still agrees with how the old one stored things.

It also travels. The same file opens in MD Studio, VS Code, Obsidian, on GitHub, in a static-site generator or in Pandoc. When you write Markdown you are picking a format that any of these tools can read, and the format will outlive every app built for it, this one included.

Nobody else holds it, either. MD Studio keeps your documents on your own computer, with no account, server or sync service between you and your files ([Chapter 5](05-managing-files-locally.md) covers where they live). If the app disappeared tomorrow, your files would still be ordinary files in ordinary folders. The app doesn't have to promise this, because it follows from the format, and that is my main reason for using the format in the first place.

And it is small. A year of notes is a few megabytes. Any search tool on any operating system can find a phrase in it, you can back it up by copying a folder, and a single document emails as a few kilobytes of text.

A few habits keep this working for you. Name files so that they will still mean something in five years: `2026-offsite-plan.md` will, and `Untitled (3).md` won't. Lowercase and hyphens survive every operating system and every URL. Keep a document and its `images` folder in the same folder so they move together ([Chapter 4](04-formatting-and-rich-content.md) covers how MD Studio saves pasted images next to the document). And prefer the syntax every reader understands. Headings, paragraphs, lists, links, emphasis, tables and code blocks read well everywhere, while extended syntax such as footnotes renders in some places and not others ([Chapter 6](06-exporting-and-sharing.md) has the details). Use the extras when you need them.

## Structure: when to reach for it, and when to wait

Markdown makes structure cheap. A `#` and a space gives you a heading, and a `-` and a space gives you a list. That is useful, but it also makes it easy to add structure before you know what the structure should be.

### Write first, structure second

When you don't yet know what you think, write prose. Full sentences make you connect one idea to the next with *because*, *but* and *so*. Bullets let you skip that work, and a list of five fragments can look organised while hiding the fact that you haven't decided how the fragments relate.

A first draft can be a single run of paragraphs with no headings at all. Write until you run out, then read it back and look for the seams: the places where the subject changes or a new argument starts, or where a reader would want to skip ahead. Those seams are your headings, and they fit the content because they came out of it.

Starting from a skeleton of headings and filling them in works when the shape is already known, as with a meeting agenda, a team template or a report with fixed sections. It works badly for thinking, because the headings settle the argument before you have made it.

### Reach for headings when the reader needs to move

Add a heading when a reader would benefit from skipping ahead, coming back or seeing where they are. A one-page note may need none. A ten-page document needs them, or nobody can find anything in it, including you.

Where you can, make headings say something. Here are two outlines of the same document:

```markdown
## Background
## Analysis
## Recommendation
```

```markdown
## Support tickets doubled after the March release
## Most of the increase comes from one import screen
## Fix the import screen before adding new features
```

The first outline is a set of labels, while the second gives you the whole argument in three lines. A reader who sees only the second already knows what you think, and you can check whether the argument holds just by reading the headings in order. You won't always manage this, and reference material and manuals are often better with plain labels. When a document argues for something, though, headings that state claims are a good test of whether there is an argument at all.

Keep the levels shallow: one title, sections under it, and rarely anything deeper than a third level ([Chapter 3](03-structuring-documents.md) covers heading levels as an outline). If you find yourself reaching for a fourth level, the section has probably become a document of its own.

### Reach for lists when the content is a list

Use a list when the items really are parallel, such as the options on the table, the steps of a procedure or the people invited. Numbers are for order that matters, bullets for sets where it doesn't, and a task list (`- [ ]`) for things to do.

If the items depend on each other, a list is the wrong tool. When the third bullet only makes sense because of the second, you are writing an argument, and it wants to be a paragraph. One quick test is to ask whether you could shuffle the bullets without losing meaning. If you could, it's a set. If the order matters, number it. If shuffling breaks it because each point builds on the last, write it as prose.

The same content as bullets and as a paragraph:

```markdown
- Import screen slow
- Users retry
- Duplicate records
- Support tickets
```

```markdown
The import screen is slow, so users click Import again. Each click
creates another copy of the records, and the duplicates are what
people write to support about.
```

The bullets look tidier. The paragraph is the one that explains what is going on.

## Plain text and version control

Because Markdown is plain text, it works with the tools programmers built for tracking changes to text, of which git is the best known. You don't need to be a programmer to get something out of git, and Markdown is about the friendliest thing you can keep in it.

MD Studio itself does not do git. It has no commit button, history panel or branches. It saves ordinary `.md` files to ordinary folders, and if one of those folders is a git repository, you run git alongside MD Studio on the files it saves. Write and save in MD Studio, then commit with whatever git tool you like: the command line, GitHub Desktop, or the git panel in another editor. The two never need to know about each other.

### Why Markdown and git fit together

Git compares files line by line. When you change a Markdown file, git shows exactly which lines changed, and you can read the change directly:

```diff
 ## Recommendation

-Fix the import screen before the summer release.
+Fix the import screen before adding new features. The summer
+release can wait two weeks.
```

To git, a Word document is a binary file: it can tell you the file changed, but not what changed in it. A Markdown document shows the sentence you rewrote, the paragraph you deleted and the heading you renamed, so the history becomes something you can read as well as restore from.

### One sentence per line

Line-by-line comparison works best when lines are short and each one means something. Many people who keep prose in git put **one sentence per line**, or follow the looser convention called **semantic line breaks**, which adds a new line after each sentence and, if you like, at natural pauses such as a clause or a comma.

In Markdown this costs nothing on the page. A single line break inside a paragraph renders as a space, and only a blank line starts a new paragraph. So this source:

```markdown
The import screen is slow, so users click Import again.
Each click creates another copy of the records.
The duplicates are what people write to support about.
```

shows up in the visual view as one ordinary paragraph of three sentences. Switch to the visual view and check for yourself; it makes a good first try at the two-lens habit described later in this chapter.

The benefit shows when you revise. Change one word in the second sentence and git reports one changed line instead of flagging the whole paragraph. Reordering sentences becomes moving lines, and review comments on GitHub or GitLab attach to a single sentence.

There are downsides. The source looks ragged, which some people dislike, and the habit only pays if you keep it: one paragraph written the old way among many written sentence by sentence makes the diffs uneven again. I'd treat it as an option. If you keep a document in git and revise it often, try it on that one document and decide whether the diffs are worth the ragged edge. For a one-off document I wouldn't bother.

There is one thing to know about MD Studio here. When you edit a paragraph in the visual pane, MD Studio keeps the source text of every block you didn't touch, but writes the block you edited back in the editor's own style ([Chapter 2](02-anatomy-of-the-editor.md) explains why). If you care about the exact line breaks in a paragraph, edit that paragraph in the source pane, and look at the diff before you commit.

### Commits as drafts

Without version control, drafts pile up as files: `report-v2.md`, `report-v2-final.md`, `report-v2-final-REALLY.md`. With git you keep one file, and each commit is a draft.

Commit when you finish a thought rather than when you finish a day. "Rewrite the recommendation around the import screen" is a step worth returning to, and "End of Tuesday" isn't. Write the message as an editorial note, such as "Cut the background section; nobody needs it" or "Move the cost estimate ahead of the timeline", and six months later the log tells you why the document looks the way it does. Before a big change, such as a restructure, cutting a third of the text or accepting someone's heavy edit, commit what you have first.

That last habit changes how you revise. People hold on to weak paragraphs because deleting them feels permanent. When the old version is one command away, cutting gets easy, and documents get shorter and better for it.

### Branches for alternatives

Sometimes you aren't sure which of two directions is right: a different opening, a reorganised middle, a shorter version for another reader. A git branch lets you try one direction without disturbing the other. Make a branch, restructure as much as you like, and compare the two versions with a diff or by reading both. Keep the one that works, merge it back and delete the other.

Most documents don't need branches. They earn their keep on long-lived documents with real alternatives, such as a proposal with two possible framings or a guide where you want to try a different chapter order. For a short note, a commit before the experiment is enough.

### The minimum to get started

If you have never used git, four ideas cover it, and your git tool will have a button or command for each:

1. **Initialise** a repository in the folder where your documents live (once).
2. **Stage and commit** your changes with a message each time you finish a step.
3. **Look at the history** and the diff of any commit to see what changed.
4. **Push** to a remote such as GitHub or a private server if you want a copy off your machine or want to share.

The rest can wait. The Pro Git book in [Appendix C](appendix-c-further-reading.md) covers it. Images MD Studio saves in the `images` folder next to a document are ordinary files, so they go into the repository with it.

## Two lenses on the same thinking

MD Studio shows one document two ways, with the Markdown source on the left and the formatted document on the right ([Chapter 2](02-anatomy-of-the-editor.md)). It's tempting to pick one and stay there: people who like seeing the markup live in the source, and people who don't live in the visual view.

I find both views most useful as review tools. Each shows you something about your own structure that the other hides, and that goes well beyond formatting.

### The outline as a skeleton check

Open the **Outline** (toolbar, or Ctrl+Shift+O). It lists the headings and nothing else, which gives you the bare skeleton of the document.

Read it from top to bottom. If the headings state claims, the outline on its own should carry the argument; if it reads like a list of labels, decide whether that suits this document or means you haven't worked out what each section says. Check that headings at the same level are the same kind of thing, because three sections named after problems and a fourth named after a person suggests something is in the wrong place. Check the levels too. A third-level heading that matters as much as the second-level ones around it should move up, and a section with a single subsection usually doesn't need the subsection. Finally, look for gaps, which are easier to spot in a skeleton than in prose. If the outline goes from problem to solution with nothing about cost, the reader will notice that too.

Do this whenever a document changes size, and always before you send it. It takes a minute, and it catches things a full reread misses, because reading the full text pulls you into the sentences.

You can get the same skeleton without the panel. In the command palette (Ctrl+K), type `#` to list the headings, then a few letters to jump to one. If you can't guess what a section is called, your reader won't be able to either.

### Reading in the visual view

Switch to the visual view (the **Visual** button in the toolbar, or Ctrl+3 in the installed app) and read the document the way your reader will. Leave the editing for later.

The visual view shows you things the source hides. Formatting that didn't take, like a stray asterisk, a link whose brackets don't close or a heading with no space after its `#`, looks almost right in the source and shows up as literal symbols on the page. A list item with a missing blank line or the wrong indentation can merge into the paragraph above or split a list in two, and you'll see that at once when it's formatted. A paragraph that looks reasonable in the source can turn out to be a dense block on the page. And bold on every second phrase is easy to miss when it's just asterisks, but on the page it's obvious that nothing stands out.

Before you share a document, read it once from top to bottom in the visual view. When something makes you stop, fix it and read that part again.

### Editing in the source

Switch to the source (the **Text** button, or Ctrl+2 in the installed app) to see what the formatting is. The visual view shows how things look, and the source shows what they are.

That matters more often than you'd expect. In the visual view, a short bold line and a heading can look alike, but only the heading appears in the outline, moves with linked scroll and becomes a heading in a Word export; the source tells you which one you have. The visual view shows a link's text, while the source shows its address and whether it is relative (`images/chart.png`, which travels with the folder) or absolute (a web URL, which may not). Indentation in the source decides how a list nests, so when a list behaves oddly, the source shows why. And the source is what you share when you send the `.md` file ([Chapter 6](06-exporting-and-sharing.md)) and what git tracks. If the visual view looks fine but the source is a mess, the mess is what other tools will see.

Some edits are easier in the source, like moving a section (select from its heading to the next one, cut, paste), changing a heading level by adding or removing a `#`, or fixing a table's alignment row. Others are easier in the visual view, such as rewording a sentence while you can see the paragraph around it, or building a table from scratch. Make each edit in whichever pane suits it, and glance at the other to confirm it.

### A short review routine

Together, the two views give you a review that fits in ten minutes:

1. **Outline.** Read the headings only, and fix the skeleton first, since every later fix is wasted if a section is going to move.
2. **Visual read.** Read the whole document in the visual view as a reader would, and note what makes you stop.
3. **Source pass.** Fix your notes in the source, where you can see exactly what you are changing.
4. **Commit**, if the document is in git, with a message saying what the review changed.

The order matters: structure before sentences, reading before fixing, and the source as the final word on what the document contains.

## The common thread

What ties all this together is keeping the document honest. Plain text means the file is just words and a few marks, readable by anyone and owned by you. Writing prose before adding structure means the headings and lists describe an argument you have actually made. Version control keeps every change visible and reversible, with the decisions logged. The two views let you check that what you see on the page is what is in the file.

None of this needs MD Studio. The habits work in any text editor with a git folder behind it. What MD Studio adds is the two views side by side, so checking structure costs a glance at the other pane instead of a switch to another program. I want a writing tool to make the good habits cheap and otherwise stay out of the way, and your documents should outlast it.

## Now you try

Pick a document you actually have to write this week, not an exercise.

1. Write the first draft as prose, with no headings or lists, until you run out.
2. Read it back and mark the seams. Turn them into headings, and try to make each one say something.
3. Open the outline (Ctrl+Shift+O) and read the skeleton on its own. Fix what it shows you.
4. Read the whole thing once in the visual view, then fix what you noticed in the source.
5. If you use git, commit at step 1 and again at step 4, then look at the diff between the two commits. That diff is the clearest picture you'll get of what your editing did to the draft.

The appendices that follow are reference material, and the next document you write is where the practice happens.
