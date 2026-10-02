# Appendix C: Further Reading

This book is deliberately practical. It has enough Markdown to write well in MD Studio and enough method to make plain text pay off. If you want to go further into the format, into working with plain text and version control, or into writing itself, these are the places I would look, with a note on what each is good for.

## On Markdown itself

**John Gruber, *Markdown*** ([daringfireball.net/projects/markdown](https://daringfireball.net/projects/markdown/)). The original description, published in 2004 with help from Aaron Swartz. The [syntax page](https://daringfireball.net/projects/markdown/syntax) is still worth reading, more for its philosophy than for its rules. Gruber wanted Markdown source to read as plain text without looking marked up, and that goal is why the format has lasted. The page is informal and leaves many edge cases open, which is why the specifications below exist.

**The CommonMark specification** ([commonmark.org](https://commonmark.org/), spec at [spec.commonmark.org](https://spec.commonmark.org/)). A precise, tested definition of core Markdown, written to settle the ambiguities in Gruber's original so that the same file renders the same way in different tools. It is long and exact, and you won't read it cover to cover. Go to it when something renders in a way you didn't expect, such as a list that won't nest or a line break that doesn't appear. The spec explains the behaviour and gives an example for every rule. The site also has a short interactive tutorial for newcomers.

**The GitHub Flavored Markdown specification** ([github.github.com/gfm](https://github.github.com/gfm/)). GFM is CommonMark plus the extensions most people now expect: tables, task lists, strikethrough and automatic links. It is written as a strict superset of the CommonMark spec, with the extensions marked. If you share Markdown on GitHub, or anywhere that follows its conventions, this is the definition that applies. [Chapter 4](04-formatting-and-rich-content.md) and [Appendix B](appendix-b-markdown-syntax-reference.md) note which syntax is core and which is GFM.

**The Markdown Guide** ([markdownguide.org](https://www.markdownguide.org/)). A friendly, free reference with a basic syntax page, an extended syntax page and a cheat sheet. Its notes on which applications support which features help when a document has to move between tools. Start here if the specifications feel like too much.

## On converting and publishing

**Pandoc** ([pandoc.org](https://pandoc.org/)). A free command-line tool that converts between dozens of document formats, including Markdown to and from Word, HTML and LaTeX, and Markdown to PDF and EPUB. MD Studio's own exports ([Chapter 6](06-exporting-and-sharing.md)) cover the everyday cases. Pandoc is where to go when you need more, such as citations and a bibliography, a custom Word template, or a book assembled from many chapter files. Its user's guide is long but well organised, and it documents Pandoc's own Markdown dialect, which has many useful extensions. Pandoc's author, John MacFarlane, is also one of the authors of the CommonMark specification.

## On plain text and version control

**Semantic Line Breaks** ([sembr.org](https://sembr.org/)). A short specification of the convention described in [Chapter 7](07-writing-as-practice.md): break lines at sentences and natural pauses so that diffs show meaningful changes. It fits on one page, explains its reasoning and collects the history of the idea. Read it before you decide whether the convention is worth adopting for your own documents.

**Brandon Rhodes, "Semantic Linefeeds".** The blog post that brought the idea to a modern audience. Rhodes traces it back to advice Brian Kernighan gave early Unix users: start each new sentence on a new line, so that edits stay local. It is a quick read, and it shows the technique is much older than git.

**Scott Chacon and Ben Straub, *Pro Git*** ([git-scm.com/book](https://git-scm.com/book)). The standard introduction to git, free to read online and translated into many languages. Chapters 1 and 2 are all you need to commit, read history and compare versions of your documents. The chapter on branching comes next, when you want to try alternatives as described in Chapter 7. You can skip everything about servers and team workflows until you need it.

**Kieran Healy, *The Plain Person's Guide to Plain Text Social Science*.** An essay by a sociologist on why and how to do academic writing in plain text, with Markdown, Pandoc and version control. It is written for researchers, but its case for plain text, and its frank account of what it costs, applies to anyone with documents they want to keep.

## On writing

None of these books mention Markdown. They are about the writing itself, which the format is there to serve.

**Barbara Minto, *The Pyramid Principle*.** The classic method for structuring business writing: start with the answer, group the supporting points beneath it, and order each group logically. It treats in full the idea from Chapter 7 that headings should state claims, since an outline that reads as an argument is a pyramid seen from above. It is dense and repays a slow read, especially before you write a recommendation or a report.

**William Zinsser, *On Writing Well*.** A guide to clear non-fiction, and a long argument against clutter. Its chapters on simplicity and on rewriting pair well with version control, because Zinsser's advice to cut is much easier to follow once deleting is safe.

**Anne Lamott, *Bird by Bird*.** A book about the writing life, and the best-known case for the bad first draft. If Chapter 7's advice to write prose first and structure later feels uncomfortable, read her chapter on first drafts. She is also very funny.

**Steven Pinker, *The Sense of Style*.** A modern style guide grounded in linguistics and psychology. Its discussion of the "curse of knowledge", the difficulty of imagining what your reader doesn't already know, explains why reading your own document in the visual view, the way a reader would, catches so much.

## On the tool

MD Studio is open source. The application code is licensed under Apache 2.0 and this book under Creative Commons BY-NC 4.0. The live app, the repository and the project's dashboard are linked from [md-studio.struktureretsundfornuft.dk](https://md-studio.struktureretsundfornuft.dk/). If a chapter here describes something the app no longer does in exactly that way, the repository is the source of truth, and a good place to report the difference.

## The shortest possible reading list

If you read only one more thing, make it Gruber's syntax page. It takes ten minutes, it explains why Markdown looks the way it does, and everything else on this list builds on it. After that, write something real; you will learn more from a week of using the format than from more reading.
