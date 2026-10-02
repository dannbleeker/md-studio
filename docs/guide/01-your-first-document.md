# Your First Document

### Opening, creating, saving, installing

Open [MD Studio](https://md-studio.struktureretsundfornuft.dk/) in your
browser. You don't sign up for anything or download anything first. The first
time you visit, you land on the **start screen**.

This chapter covers what you do around the writing: starting a document,
giving it a name, opening files you already have, saving them back, and
installing MD Studio so it behaves like the other apps on your computer. By
the end you will have a `.md` file on your disk that you made yourself.

## The start screen

At the top of the start screen is the name, **MD Studio**, and the tagline
*Local-first Markdown, visual and raw side by side.* Below that is a row of
large buttons:

- **Continue editing** takes you back to the document you were working on. It
  shows the file name and the document's first heading, so you can tell which
  one it is, and it only appears when there is something to continue.
- **New document** starts a blank page.
- **Open file…** lets you pick a Markdown file from your computer.
- **Try the sample document** opens a short tour of MD Studio and Markdown as
  a new, unsaved document, so you can experiment with it freely.

Under the buttons is the **Recent** list. The first time, it just says *Files
you open or save appear here.* Once you have opened or saved a few files, it
lists each one with its name, its first heading and when you last had it open.
The end of this chapter comes back to it.

At the bottom is a hint, *Tip: drop a .md file anywhere to open it.*, and
links to this book as a PDF and an EPUB.

You won't see the start screen every time. When you come back to MD Studio
later, it opens straight into the documents you had open, where you left
them. To get to the start screen from the editor, click **MD Studio** at the
far left of the toolbar (on a narrow screen it just says **MD**).

## Creating a document

Click **New document**. The editor opens with an empty page called
`Untitled.md`, and that name appears at the top left of the toolbar.

On a wide screen the page is split in two. The left side is the **Markdown
source**, the raw text. The right side is the **visual editor**, the same text
formatted. [Chapter 2](02-anatomy-of-the-editor.md) explains the two halves
properly. For now, click in the left side and type:

```markdown
# Shopping for the weekend

Things we need before **Saturday**:

- bread
- coffee
- something for the barbecue
```

A moment after you stop typing, the right side shows a large heading, a
sentence with *Saturday* in bold, and a bulleted list. You typed plain text
with a few symbols, and the right side shows what the symbols mean.

Look at the toolbar. A small dot has appeared next to `Untitled.md`. It means
**unsaved changes**: the document has changes that are not yet in a file on
your disk. Nothing asked you to save before you started, and you don't have
to.

### Your work is kept as you type

MD Studio keeps every open document in your browser, a fraction of a second
after each change. Close the tab, close the browser or restart the computer,
and when you open MD Studio again, `Untitled.md` is still there with the dot
still showing.

Treat that as a safety net. A document that only lives in the browser is tied
to that browser on that computer. If you want a file you can back up, share
and open anywhere, save it.

## Saving, and giving the document a name

Click **Save** in the toolbar, or press **Ctrl+S** (**Cmd+S** on a Mac). What
happens next depends on your browser.

In Edge and Chrome on a computer, a normal save dialog opens with
`Untitled.md` filled in as the name. Pick a folder, type a better name, say
`weekend.md`, and click Save. A short message confirms *Saved weekend.md*, the
toolbar shows the new name, and the dot is gone.

From then on, **Save writes straight back to that same file** without asking.
Edit, press Ctrl+S, and `weekend.md` on your disk is updated in place, as it
would be in a desktop app. This keeps working after you close and reopen MD
Studio. The browser may ask you once to allow access to the file again; after
that it saves silently.

Firefox, Safari and phone browsers don't let a web page write to your files.
There, Save **downloads** the document under its current name, and the
message says *Downloaded Untitled.md*. The file lands wherever your browser
puts downloads, and each Save is a new download, so if you work this way, move
the file to where it belongs and rename it there.
[Chapter 5](05-managing-files-locally.md) has more on working in these
browsers.

### Save as

**Save as…** (**Ctrl+Shift+S**) always asks where to save, even when the
document already has a file. Use it to make a copy under a new name or to put
your work in a different folder. After a Save as, Save writes to the new file.

There is no toolbar button for Save as. You find it in the command palette,
which opens with **Ctrl+K** and holds the commands you need less often.
[Chapter 2](02-anatomy-of-the-editor.md) introduces the palette.

## Opening a file you already have

The usual way is the file picker. Click **Open file…** on the start screen or
**Open** in the toolbar, or press **Ctrl+O**, and choose a file. It opens with
a short message, *Opened notes.md*. The picker looks for Markdown files with
the extensions `.md`, `.markdown`, `.mdown` and `.mkd`.

If the folder is already open on your screen, dragging is quicker. Drag a
`.md` file (or a `.txt` file) from your file manager and drop it anywhere on the
window. It opens in its own tab, wherever you let go. You can drop several
files at once.

On Windows, once MD Studio is installed as an app (see below), you can open a
file from Explorer: right-click it, choose *Open with*, and pick MD Studio. If
Windows uses MD Studio for `.md` files, a double-click opens them there too.

In Edge and Chrome, a file you open with the picker or from Explorer stays
connected to the file on disk, so Save writes back to it. A dropped file is a
copy. It opens with its content, but the first Save asks where to put it, as
it does for a new document.

### Every file gets its own tab

Opening a file never replaces the document you are working on. Each new
document or opened file gets its own tab, and as soon as two documents are
open, a **tab bar** appears above the editor. Click a tab to switch to it.
Each tab remembers its own cursor and scroll position.

These keys make tabs quicker:

| Shortcut | What it does |
| --- | --- |
| Alt+PageDown | Next tab |
| Alt+PageUp | Previous tab |
| Alt+W | Close tab |

They use Alt because the browser keeps Ctrl+W and Ctrl+Tab for its own tabs.
You can also click the **×** on a tab. If the tab has unsaved changes, MD
Studio asks *Discard unsaved changes?* first. Choose **Discard** to close it
anyway, or **Cancel** to go back and save. Closing the last tab takes you back
to the start screen.

If you open a file that is already open, MD Studio switches to its tab instead
of opening a second copy.

## The Recent list

The **Recent** list on the start screen grows as you open and save files.
Click an entry to reopen it. Each entry is marked in one of two ways:

- **File on disk** means MD Studio still has a connection to the real file
  (Edge and Chrome only). Clicking it opens the file's current content, even
  if you changed it in another program in the meantime, and Save writes back
  to it. The browser may ask you to allow access first.
- **Saved copy** means MD Studio opens the copy it kept of the document. You
  see this in other browsers and for dropped files. It also happens when the
  file has moved or been deleted, or when you decline access, and MD Studio
  then tells you it opened the saved copy.

The **×** at the end of a row removes that entry, and **Clear list** removes
them all after asking *Clear the recent list?* Neither touches the files
themselves.

## Installing MD Studio as an app

You can install MD Studio like an app, with its own window and icon and no
address bar. An installed MD Studio opens like your other programs and works
offline, and shortcuts the browser would otherwise take, such as **Ctrl+1** to
**Ctrl+3**, go to MD Studio instead.

Edge and Chrome offer **Install app** in the address bar while MD Studio is
open. Confirm it, and MD Studio opens in its own window from then on. On
Windows, the installed app is also what makes *Open with* in Explorer
possible.

On a phone or tablet, whether and how you can add MD Studio to the home screen
depends on the browser; look in its menu for *Add to Home Screen*. On a phone,
open documents from inside the app with **Open file…**. Split view stacks the
panes one above the other on a narrow screen.

Once MD Studio has everything it needs, it shows the message *MD Studio is
ready to work offline.* After that it starts without a connection.

### How updates arrive

You never download an update by hand. When a new version is published, MD
Studio fetches it in the background the next time it runs with a connection.
When the update is ready, the message *A new version of MD Studio is ready.*
appears with a **Reload** button. Click it when it suits you, and the app
restarts on the new version with your documents as you left them. If you
ignore the message, nothing changes under your cursor; the new version takes
over once you have closed MD Studio and opened it again.

## Now you try

Make a real file, start to finish, in five minutes.

1. From the start screen, click **New document**. Type a heading line starting
   with `# `, a sentence, and a short list where each line starts with `- `.
   Watch the right side format it, and watch the dot appear next to
   `Untitled.md`.
2. Close the browser tab and open MD Studio again. The document is still
   there, dot and all.
3. Press **Ctrl+S** and save it under a proper name in a folder you will find
   again. Check that the dot is gone and the toolbar shows the new name.
4. Change a word and press **Ctrl+S** again. In Edge or Chrome, open the file
   in Notepad or TextEdit: your change is there, and the file is just text.
5. Click **MD Studio** in the toolbar to go to the start screen. Your file is
   in the **Recent** list. Drop another `.md` file on the start screen and
   watch the tab bar appear.
6. Click **Try the sample document**. It is a short tour of the editor and of
   Markdown, and a good scratch pad for the next chapter.

The next chapter looks at what happens between opening and saving: the two
panes, and what it means that they are synced.
