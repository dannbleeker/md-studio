# Managing Files Locally

### File access on Windows, local persistence, working across devices

Most writing apps answer the question "where is my document?" with "in our cloud". MD Studio answers it with "wherever you put it". There is no account to sign into and no server holding a copy. Your document is a `.md` file on your own disk, and the browser keeps a second copy as a safety net while you work.

That is simple, but it is not what most people are used to. This chapter covers where your words live, what Save does in each browser, what the browser remembers for you, and how to carry work between machines without a sync service.

## Two places your document lives

A document you are editing in MD Studio can exist in two places at once. The first is the file on disk, a real `.md` file in a folder you chose: Documents, a project folder, a synced OneDrive folder. That is the durable copy, the one you back up, commit to git, attach to an email or open in another editor next year.

The second is the browser's copy. Every open document, saved or not, is also kept in the browser's local storage, which is how your tabs come back when you close the window and open MD Studio again tomorrow.

The unsaved-changes dot next to the file name marks the gap between the two. With no dot, the file on disk matches what you see. With a dot, some of your edits exist only in the browser so far. Press **Ctrl+S** and the dot goes away.

The browser copy protects you from accidents in the next five minutes. The file protects you from everything else.

## Saving in Edge and Chrome

Edge and Chrome (and other Chromium-based browsers on the desktop) support the File System Access API. That is a browser feature that lets a web app read and write a file you have explicitly handed to it. MD Studio uses it so that saving works the way it does in a desktop editor.

Here is the everyday loop:

1. Open a file with **Open file…** on the start screen, **Open** in the toolbar, or **Ctrl+O**. The system's file picker appears; choose `notes.md`.
2. Edit. The unsaved-changes dot appears.
3. Press **Ctrl+S** (or **Save** in the toolbar). MD Studio writes straight back to `notes.md`, in place, and a toast confirms: "Saved notes.md".

Nothing is downloaded, and no `notes (1).md` piles up in your Downloads folder.

A brand-new document has no file yet, so its first **Save** asks where to put it and what to call it. After that it behaves like any opened file. **Save as…** (**Ctrl+Shift+S**) always asks, which is how you branch a copy: save `proposal.md` as `proposal-v2.md`, and from then on Save writes to the new file, leaving the original untouched.

The link to the file survives closing the app. Close the window, come back tomorrow, press **Ctrl+S**, and the save still goes to the same `notes.md`. The browser may ask once more whether MD Studio may edit the file. That is expected: browsers check file permission again after a restart, and one click restores it.

### What you are granting

When the browser asks whether MD Studio may edit `notes.md`, the answer covers that one file. MD Studio cannot browse your disk, list your folders, or open other files on its own. It only sees what you pick in a file picker or drop onto the window.

If you say no, nothing breaks. Save simply falls back to asking for a location, as if the document were new.

### Three ways in, one difference

You can bring a file into MD Studio in three ways, and they differ in one detail that matters for saving. **Open file…** (or **Ctrl+O**) links the document to the file, so Save writes back. Double-clicking a `.md` file on Windows does the same once MD Studio is installed as an app; the first time, right-click the file, choose *Open with* and pick MD Studio.

Dropping a file onto the window is different. It opens the contents, but browsers do not hand over a writable link for dropped files, so the first Save asks where to put it. Drag and drop is fine for a quick read. For a file you mean to keep editing, use **Open file…** or double-click it.

## Saving in Firefox, Safari and on phones

Firefox, Safari and mobile browsers do not offer the File System Access API. MD Studio still works there, but files move in and out differently. Opening uses the standard file picker: you pick a file, MD Studio reads its contents, and its connection to the file ends there. Saving downloads the document. The toast says "Downloaded notes.md" instead of "Saved notes.md", and the file lands wherever your browser puts downloads.

So you manage the files by hand. If you opened `Documents/notes.md` and saved, the new version is in Downloads, and your browser may have named it `notes (1).md` to avoid a clash. Move it back over the original when you are done, or set your browser to ask where to save each download, which gets you close to the desktop experience.

The unsaved-changes dot clears after a download, because the content has left the app. MD Studio cannot tell whether you put the file back where it belongs.

## The Recent list

The start screen's **Recent** list holds the files you have opened or saved, most recent first. Each entry carries a label that tells you what clicking it will do.

An entry marked **File on disk** (Edge and Chrome only) still has its link to the file. Clicking it reopens the file itself and reads its current content from disk, so you see changes made in another editor, and Save writes back to it. An entry marked **Saved copy** is only a snapshot of the content as it was when you last opened or saved it. That is what you get in other browsers, and for files that were dropped rather than opened.

When a **File on disk** entry cannot be reached, MD Studio falls back to the snapshot and tells you why. If the file was moved or deleted, you see "Couldn’t find notes.md on disk any more, so opened the saved copy." If you declined the browser's permission prompt, you see "Opened the saved copy of notes.md. Allow file access to work on the file itself." Either way you get your words back, but you are no longer connected to the file.

The list keeps your most recent handful of files. Very large documents are left out of it, to protect the browser's storage. The **×** beside an entry removes it, and **Clear list** removes them all after asking "Clear the recent list?". As the dialog says, the files themselves are not touched; they just stop being listed.

## The safety net: browser storage

MD Studio keeps everything you have open in the browser's local storage, without being asked. Every tab and every unsaved change is written a fraction of a second after you stop typing, and again the moment you switch away from the window.

If you close the browser tab by accident, reopening MD Studio brings it all back: the start screen offers **Continue editing** with your document's name, and your tabs are where you left them. A browser crash or a Windows restart for updates ends the same way, with at most the last moment of typing missing. When an update to MD Studio arrives, a toast says "A new version of MD Studio is ready." with a **Reload** button, and reloading is safe because your open documents are already stored.

That comfort is also where people get into trouble, because browser storage has limits a file on disk does not. It belongs to one browser on one device: your Edge at work and your Edge at home do not share it, and neither do Edge and Chrome on the same machine. It can be cleared by "Clear browsing data" with site data selected, by a privacy cleaner, by a reset browser profile, or by a managed work laptop that wipes data on sign-out, and none of them ask MD Studio first. An InPrivate or Incognito window throws its storage away when it closes. And each site gets only a few megabytes; plain text fits easily, a document stuffed with embedded images may not.

Treat the browser copy as an airbag. It is there for accidents. Saving to a file is what makes your work durable.

## What "local-first" means here

"Local-first" gets stretched to mean many things. In MD Studio it means you never sign in, because there is no account. Your documents are never uploaded: the website delivers the app to your browser and then stays out of the way. MD Studio does not copy your documents between devices either, and it could not, since nothing of yours leaves the device.

It also means the app works offline once it has loaded. The first time it is ready, a toast says "MD Studio is ready to work offline." Install it (see [Chapter 1](01-your-first-document.md)) and it opens like any other program, network or not.

What you get is privacy, speed and files you own outright. In return, you decide where those files live.

## Images and the folder next to your document

Images complicate "a document is a file", because a picture is a second file. MD Studio handles this in one of two ways, depending on whether it can reach the folder your document sits in. ([Chapter 4](04-formatting-and-rich-content.md) covers images as content; this is the file side.)

In Edge and Chrome, with the document saved on disk, paste an image (**Ctrl+V**) or drop one into either pane, and the first time MD Studio asks "Save images next to the document?". Choose **Choose folder…**, pick the folder that contains your document, and from then on images go into an `images` folder beside it:

```
Reports/
├── quarterly-review.md
└── images/
    ├── image-20261002-091544.png
    └── image-20261002-093012.png
```

The document links to them with a short relative path such as `images/image-20261002-091544.png`. Your Markdown stays small and readable, and the pictures travel with the folder: copy the folder, sync it, or commit it to git, and everything still lines up. If you pick the wrong folder, MD Studio says so ("That folder doesn’t contain quarterly-review.md. Choose the folder the document is in.") and embeds that one image instead; the next paste asks again.

In other browsers, before the document has been saved, or if you choose **Cancel** in that dialog, the image is shrunk to at most 1600 pixels on its longest side and embedded in the document itself. You get one self-contained file with no folder to keep track of. The cost is size: a few screenshots can turn a 10 KB text file into a 2 MB one, and the source pane fills with a long line of encoded data. When an embedded image makes the document large, MD Studio warns you and suggests saving to disk so images can go in a folder instead.

So save a new document to disk *before* you start pasting images into it, and your Markdown stays clean.

## Working across devices

MD Studio does not sync, so moving between a work laptop, a home desktop and a phone comes down to where you keep the files. You probably have the right tool already.

### A synced folder

Keep your `.md` files in a folder that OneDrive, Dropbox, iCloud Drive or Google Drive already synchronises. Then:

1. On the work laptop, open `OneDrive/Writing/plan.md` in MD Studio, write, and press **Ctrl+S**. The file is saved in place, and OneDrive uploads it in the background.
2. At home, open the same file from the same synced folder. You are looking at the version you saved at work.

MD Studio does the editing and the sync client does the moving, and neither needs to know about the other. Images saved into the `images` folder ride along, because they live in the same synced folder.

Two habits keep this smooth. First, save before you leave a machine: unsaved changes live only in that browser's storage and will not follow you home.

Second, reopen rather than continue. If the file may have changed on another machine, start from **Recent** (a **File on disk** entry reads the current content) or from **Open file…**, not from a tab that has been sitting open since yesterday. A tab that is already open keeps what it had, and saving it would write the old version over the newer one. Close the stale tab first, then open the file again.

### A git repository

If you write documentation, or simply want a full history of every draft, keep your files in a git repository. MD Studio saves the `.md` file and the `images` folder in place, and you commit them with whatever git tool you already use. Git was built for plain text, and every change shows up as a readable line-by-line diff. [Chapter 7](07-writing-as-practice.md) says more about Markdown and version control.

### Phones and tablets

On a phone, the system file picker can usually reach iCloud Drive, OneDrive, Dropbox or Google Drive. Save downloads a copy rather than writing in place, so you move the saved file back yourself. That works for reading and quick fixes. For long sessions, a desktop with Edge or Chrome is smoother.

## Recovering from a closed tab or a crash

Roughly in order of how often they happen, these are the usual mishaps and what to do about each.

If you closed the browser tab or window, open MD Studio again. Your documents are still there, with any unsaved changes, under **Continue editing** and in their tabs. Press **Ctrl+S** to get them onto disk.

If you closed an MD Studio tab inside the app and it had unsaved changes, MD Studio asked first ("Discard unsaved changes?"). If you clicked **Discard**, those edits are gone. If the tab was saved, reopen it from **Recent**.

A browser crash or a restart is handled like a closed window: reopen MD Studio. At most the last moment of typing is missing.

If browser data was cleared, the open tabs and the Recent list are gone, because they lived in that storage. Your files on disk are untouched; open them again with **Open file…**. This is the case that makes regular saving worth the keystroke.

If you saved over something you wanted, MD Studio cannot help much, because it keeps no version history of its own. Undo (**Ctrl+Z**) works for as long as the document is open in that pane. Beyond that, your safety lies outside the app: OneDrive's and Dropbox's version history, Windows File History, Time Machine on a Mac, or git. If the document matters, make sure one of those is running.

## Now you try

Ten minutes is enough to see this chapter in action.

1. In Edge or Chrome, create a new document and press **Ctrl+S**. Save it as `practice.md` in a folder your cloud service syncs. Note the toast: "Saved practice.md".
2. Type a sentence. Watch the unsaved-changes dot appear. Close the whole browser window without saving.
3. Open MD Studio again. Your sentence is there, the dot is still there. Press **Ctrl+S**; the browser may ask for permission to edit the file; allow it.
4. Open `practice.md` in Notepad or any other editor. Your sentence is in the file.
5. Paste a screenshot into the document. Choose **Choose folder…**, pick the folder, and look in it: a new `images` folder with your screenshot inside.
6. Go to the start screen and find `practice.md` under **Recent**, labelled **File on disk**.

If you have a second computer, open the same file there from the synced folder. That is all cross-device work in MD Studio involves: a file in a folder you already trust.

The next chapter takes the same file outward, into formats for people who do not use Markdown at all: [Chapter 6](06-exporting-and-sharing.md).
