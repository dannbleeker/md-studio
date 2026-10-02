# Foreword

Markdown is plain text with a few conventions: a `#` in front of a heading, a
`-` in front of a list item, two asterisks around a **bold** word. Any text
editor on any computer made in the last forty years can open it, and there is
no reason to think the next forty will be different.

So why a book, and why another editor?

## Why another Markdown editor

Most Markdown editors make you choose. You can write the raw text and squint
at the symbols, or you can write on a polished, word-processor surface that
hides the symbols and now and then quietly rewrites them. The first is tiring
to read. With the second, you are never quite sure what is in the file.

[MD Studio](https://md-studio.struktureretsundfornuft.dk/) shows **one
document in two views**, side by side. On the left is the Markdown as written,
character for character, the text that ends up in the file. On the right is
the same document formatted, the way a reader will see it. You can type on
either side, and the other side follows a moment later.

Day to day that is a small convenience, but it changes how you write. While
drafting, you can stay in the formatted view and forget about syntax. When
you want to check the structure, a glance at the raw text tells you which line
is a heading and which is only bold, and if something looks wrong you can see
why. When you edit in the formatted view, MD Studio keeps your original text
for every block you did not touch, so a small change doesn't reshuffle the
whole file.

The other reason is ownership. MD Studio runs in your browser, with **no
server and no account**. The browser keeps your document while you work, and
when you save, it becomes an ordinary `.md` file on your own disk. In Edge and
Chrome, Save writes straight back to the file you opened, as a desktop app
would. You can put that file in OneDrive, Dropbox or a git repository, open it
in Notepad, or email it to someone who has never heard of MD Studio. The file
doesn't depend on the app that wrote it.

That is what I want from plain text: files that stay yours, and that outlive
whatever tool you happen to use this year, this one included.

## Who this book is for

This book is for people who write things down and want them to last: meeting
notes, project documentation, a README, the draft of a report, a reading log,
the first chapters of something longer. If you have ever lost work to a
proprietary format, an expired subscription or an app nobody maintains any
more, you are the reader I have in mind.

You don't need to know Markdown already. [Chapter 1](01-your-first-document.md)
starts from a blank page, and the syntax arrives a little at a time, always
next to what it looks like formatted. If you already write Markdown in another
editor, skim the first two chapters for the places where MD Studio behaves
differently and use the rest as reference.

You don't need to be technical either. MD Studio is a web page you can install
as an app. There is nothing to configure before you start, and nothing in
this book asks you to open a terminal. Git and sync folders come up as
options; you can ignore them.

## How the book is organized

Chapters 1 to 6 cover the tool.

- [Chapter 1, Your First Document](01-your-first-document.md), gets a real
  file on your screen: the start screen, creating, opening and saving, and
  installing MD Studio as an app.
- [Chapter 2, Anatomy of the Editor](02-anatomy-of-the-editor.md), explains
  the two panes and what it means that they are "synced". Read this one
  slowly, because the rest of the book builds on it.
- [Chapter 3, Structuring Documents](03-structuring-documents.md), is about
  headings, lists and sections, and keeping a document navigable as it grows.
- [Chapter 4, Formatting and Rich Content](04-formatting-and-rich-content.md),
  covers links, images, tables, code blocks and footnotes.
- [Chapter 5, Managing Files Locally](05-managing-files-locally.md), goes
  further into where your document lives, what the browser may do with your
  files, and how to move work between devices.
- [Chapter 6, Exporting and Sharing](06-exporting-and-sharing.md), is about
  getting a document out, either as the `.md` file itself or as a web page,
  PDF, Word document or plain text.

[Chapter 7, Writing as Practice](07-writing-as-practice.md), covers the
practice. It steps back from features to the habits plain text supports:
when to reach for structure and when to just write, why Markdown and version
control get along, and how switching between the two views can become a way
of checking your own thinking.

The appendices are reference. [Appendix A](appendix-a-keyboard-reference.md)
has every keyboard shortcut, [Appendix B](appendix-b-markdown-syntax-reference.md)
the Markdown syntax on one page, and
[Appendix C](appendix-c-further-reading.md) where to read more.

Read Chapters 1 and 2 in order. After that, jump to whatever you need. Every
chapter quotes buttons and shortcuts exactly as the app shows them, so you can
follow along with MD Studio open in another window. The book itself is
written in Markdown.

Your document is kept as you type. Close the tab and it is still there
tomorrow. Let's begin.
