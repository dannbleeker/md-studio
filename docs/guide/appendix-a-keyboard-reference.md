# Appendix A: Keyboard Reference

This appendix lists every shortcut in MD Studio, grouped by what you are doing. The app-wide shortcuts come first. After them come the keys that belong to each editor pane, because the Markdown pane and the visual pane are different editors with different habits.

Three notes apply throughout:

- **On macOS, Cmd replaces Ctrl.** Ctrl+S is Cmd+S, Ctrl+K is Cmd+K, and so on.
- **Ctrl+1, Ctrl+2 and Ctrl+3 work in the installed app.** In a normal browser tab they switch browser tabs instead, so use the toolbar or the command palette there. Installing MD Studio is covered in [Chapter 1](01-your-first-document.md).
- **Ctrl+W and Ctrl+Tab always belong to the browser.** That is why closing and switching MD Studio's own tabs uses Alt instead.

If you remember only one shortcut, make it **Ctrl+K**. The command palette lists every command by name, with its shortcut beside it, so it teaches you the rest.

## Files

| Shortcut | Action |
| --- | --- |
| Ctrl+S | **Save**. Writes back to the open file in Edge and Chrome; downloads elsewhere. A new document asks where to save. |
| Ctrl+Shift+S | **Save as…**. Always asks for a name and location. |
| Ctrl+O | **Open file…** |
| Alt+N | **New document** |
| Ctrl+P | **Print** the formatted document (the browser's print dialog). |

Saving, opening and the difference between Edge and Chrome and other browsers are covered in [Chapter 5](05-managing-files-locally.md). There is no shortcut for **Export**; use the toolbar, or type "export" in the command palette ([Chapter 6](06-exporting-and-sharing.md)).

## Tabs

| Shortcut | Action |
| --- | --- |
| Alt+W | **Close tab**. Asks first if the tab has unsaved changes. |
| Alt+PageDown | **Next tab** |
| Alt+PageUp | **Previous tab** |

With a tab in the tab bar focused (click it, or Tab to it):

| Key | Action |
| --- | --- |
| Left / Right arrow | Move to the previous or next tab. |
| Shift+Left / Shift+Right | Move the current tab one place left or right. |
| Middle click | Close that tab. |

You can also reorder tabs by dragging them.

## Views and panels

| Shortcut | Action |
| --- | --- |
| Ctrl+1 | **Split** view: Markdown source and formatted document side by side. |
| Ctrl+2 | **Text** view: Markdown source only. |
| Ctrl+3 | **Visual** view: formatted document only. |
| Ctrl+Shift+O | Show or hide the **Outline**. |
| Ctrl+, | Open **Settings**. |

**Linked scroll** has no shortcut. Toggle it with the toolbar button, in Settings, or with *Toggle linked scroll* in the command palette.

## Command palette

| Shortcut | Action |
| --- | --- |
| Ctrl+K or Ctrl+Shift+P | Open the command palette. |
| Up / Down arrow | Move through the list. |
| Enter | Run the highlighted command. |
| Escape | Close the palette. |

Type to filter; the match is forgiving, so `exp pdf` finds *Export as PDF*. Start with `#` to list the document's headings instead of commands, then type a few letters and press Enter to jump to that section. *Go to heading…* does the same.

## Find and replace

| Shortcut | Action |
| --- | --- |
| Ctrl+F | **Find**: opens the find bar above the editors. |
| Ctrl+H | **Find and replace**: the find bar with the replace field open. |
| Enter (in the find field) | Next match. |
| Shift+Enter (in the find field) | Previous match. |
| Enter (in the replace field) | **Replace** the current match. |
| Escape | Close the find bar. |

The bar searches the pane you are working in. Its option buttons, **Match case** (Aa), **Whole word** (W) and **Regular expression** (.*), are toggled with the mouse or by tabbing to them.

## Editing in both panes

| Shortcut | Action |
| --- | --- |
| Ctrl+Z | Undo, in the pane that has focus. |
| Ctrl+Y or Ctrl+Shift+Z | Redo. |
| Ctrl+V | Paste. Pasting an image file saves it next to the document or embeds it ([Chapter 5](05-managing-files-locally.md)). |
| Ctrl+A | Select all. |

Each pane keeps its own undo history. An edit you make in the visual pane is undone from the visual pane, not from the Markdown pane, and the other way round.

## The visual pane

These shortcuts come from the visual editor and work while the cursor is in the formatted document. The formatting toolbar above it does the same jobs with the mouse.

| Shortcut | Action |
| --- | --- |
| Ctrl+B | **Bold** |
| Ctrl+I | **Italic** |
| Ctrl+E | **Inline code** |
| Ctrl+Alt+X | **Strikethrough** |
| Ctrl+Alt+0 | Turn the block into a **Paragraph**. |
| Ctrl+Alt+1 to Ctrl+Alt+6 | Turn the block into a heading, level 1 to 6. |
| Ctrl+Alt+7 | **Numbered list** |
| Ctrl+Alt+8 | **Bulleted list** |
| Ctrl+Shift+B | **Quote** |
| Ctrl+Alt+C | **Code block** |
| Shift+Enter | Line break inside a paragraph. |
| Tab or Ctrl+] | Indent a list item one level. |
| Shift+Tab or Ctrl+[ | Outdent a list item one level. |

Inside a table:

| Shortcut | Action |
| --- | --- |
| Tab or Ctrl+] | Next cell. |
| Shift+Tab or Ctrl+[ | Previous cell. |
| Ctrl+Enter | Leave the table. |

On keyboard layouts where Ctrl+Alt doubles as AltGr, such as Danish, German or Norwegian on Windows, some Ctrl+Alt combinations are also how you type characters like `{` and `[`. If a combination types a character instead of formatting, or the other way round, use the formatting toolbar.

## The Markdown pane

The Markdown pane is a code editor, and it has a code editor's keys. The ones most useful for writing:

| Shortcut | Action |
| --- | --- |
| Enter | New line. In a list or block quote, continues it with the next `-`, `1.` or `>`. |
| Ctrl+] / Ctrl+[ | Indent / outdent the current line or selection. |
| Alt+Up / Alt+Down | Move the current line (or selected lines) up or down. |
| Shift+Alt+Up / Shift+Alt+Down | Copy the current line above or below. |
| Ctrl+Shift+K | Delete the current line. |
| Ctrl+Enter | Insert a blank line below, wherever the cursor is in the line. |
| Ctrl+D | Select the next occurrence of the selected word, for editing several at once. |
| Ctrl+Shift+L | Select every occurrence of the selection. |
| Ctrl+Alt+Up / Ctrl+Alt+Down | Add a cursor on the line above or below. |
| Alt+drag | Select a rectangular block of text. |
| Ctrl+/ | Wrap the line in an HTML comment (`<!-- … -->`), or remove it. |
| Ctrl+U | Undo the last cursor movement or selection change. |
| Escape | Collapse several cursors or selections back to one. |

Two differences from the visual pane are worth knowing:

- **Ctrl+B does nothing, and Ctrl+I selects** the enclosing piece of Markdown instead of italicising. In the source you type the marks yourself: `**bold**`, `*italic*`.
- **Tab moves focus out of the pane** rather than inserting a tab character, so keyboard users can always leave the editor. Use Ctrl+] to indent.

## Dialogs and messages

| Key | Action |
| --- | --- |
| Escape | Close the open dialog (Settings, Export, a confirmation) without acting. |
| Enter | Confirm the focused button. |
| Tab / Shift+Tab | Move between the controls in a dialog. |

## The short list

If this is too much to take in at once, start with these and let the command palette teach you the rest:

| Shortcut | Action |
| --- | --- |
| Ctrl+K | Command palette: any action, by name. |
| Ctrl+S | Save. |
| Ctrl+O | Open. |
| Ctrl+F | Find. |
| Ctrl+Shift+O | Outline. |
| Ctrl+B / Ctrl+I | Bold / italic (visual pane). |
| Ctrl+Z | Undo. |
