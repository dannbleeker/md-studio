import type { EditorView as TextView } from '@codemirror/view';
import { type Editor, editorViewCtx } from '@milkdown/kit/core';
import { insertImageCommand } from '@milkdown/kit/preset/commonmark';
import { Plugin, TextSelection } from '@milkdown/kit/prose/state';
import { callCommand } from '@milkdown/kit/utils';
import { EMBED_NODE_NAME, MEDIA_KINDS } from '@/domain/embeds';
import { t } from '@/i18n';
import type { PlacedAttachment } from '@/services/images';
import { showToast } from '@/store/ui';
import { embedMarks } from './embedNode';

/** The attachment service loads on first use: most sessions never paste a file. */
const images = () => import('@/services/images');

const isImage = (f: File) => f.type.startsWith('image/');

/** Dropped Markdown and text files are the window's to open (useFileDrop). */
const isMarkdownFile = (f: File) => /\.(md|markdown|mdown|mkd|txt)$/i.test(f.name);

/**
 * Files a paste takes over: images always; any other file only when the
 * clipboard carries no text, so a spreadsheet copy (cells plus a preview
 * picture) still pastes as text.
 */
function pastedFiles(data: DataTransfer | null): File[] {
  const files = Array.from(data?.files ?? []);
  if (files.length === 0) return [];
  if (files.every(isImage)) return files;
  return data?.getData('text/plain') ? [] : files;
}

const droppedFiles = (data: DataTransfer | null): File[] =>
  Array.from(data?.files ?? []).filter((f) => !isMarkdownFile(f));

const paste = (files: File[], insert: (p: PlacedAttachment) => void) =>
  images().then((m) => m.placeFiles(files, 'paste', insert));

/** placeFiles explains its own failures; this covers files it would never take. */
const drop = (files: File[], insert: (p: PlacedAttachment) => void) =>
  images().then(async (m) => {
    if (m.isHandledDrop(files)) await m.placeFiles(files, 'drop', insert);
    else showToast(t('attachment.saveUnsupported'));
  });

/**
 * Paste/drop handlers for the text pane: files become links at the cursor
 * (a wikilink embed or a Markdown link, per the vault conventions).
 */
export function textPaneImageHandlers(): {
  paste: (event: ClipboardEvent, view: TextView) => boolean;
  drop: (event: DragEvent, view: TextView) => boolean;
} {
  // One callback per event: each file goes in where the previous one left
  // the caret, later ones on their own line. A plain user transaction, so
  // it is undoable and reaches the store.
  const inserter = (view: TextView) => {
    let first = true;
    return (p: PlacedAttachment) => {
      const text = p.via === 'wikilink' ? p.raw : p.text;
      view.dispatch(view.state.replaceSelection(first ? text : `\n${text}`));
      first = false;
    };
  };
  return {
    paste(event, view) {
      const files = pastedFiles(event.clipboardData);
      if (files.length === 0) return false;
      event.preventDefault();
      void paste(files, inserter(view));
      return true;
    },
    drop(event, view) {
      if ((event.dataTransfer?.files.length ?? 0) === 0) return false;
      const files = droppedFiles(event.dataTransfer);
      // Claiming the event also stops CodeMirror from pasting file names.
      if (files.length === 0) return true;
      event.preventDefault();
      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
      if (pos !== null) view.dispatch({ selection: { anchor: pos } });
      void drop(files, inserter(view));
      return true;
    },
  };
}

/** ProseMirror plugin for the visual pane: pasted and dropped files become embed or image nodes. */
export function visualPaneImagePlugin(getEditor: () => Editor | null): Plugin {
  // Focus first: a drop doesn't focus the pane, and focusing lands any
  // text-pane edits not yet applied, which the insert would otherwise overwrite.
  const insert = (p: PlacedAttachment) =>
    getEditor()?.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      view.focus();
      const { state } = view;
      if (p.via === 'data' || (p.via === 'markdown' && MEDIA_KINDS.has(p.kind))) {
        callCommand(insertImageCommand.key, { src: p.src, alt: p.alt })(ctx);
        return;
      }
      if (p.via === 'markdown') {
        // Other files and notes are `[name](path)` links: an image node would
        // serialize with a bang, which shows a broken image elsewhere.
        const link = state.schema.marks.link;
        const inCode = state.selection.$from.parent.type.spec.code;
        view.dispatch(
          (link && !inCode
            ? state.tr.replaceSelectionWith(
                state.schema.text(p.alt || p.src, [link.create({ href: p.src })]),
                false
              )
            : state.tr.insertText(p.text)
          ).scrollIntoView()
        );
        return;
      }
      const embed = state.schema.nodes[EMBED_NODE_NAME];
      const { $from } = state.selection;
      const marks = state.storedMarks ?? $from.marks();
      // The token is text inside code, where nodes cannot go: a code block, or
      // an inline code span (an embed there would be written as empty backticks).
      const inCode = $from.parent.type.spec.code || marks.some((m) => m.type.spec.code);
      // No inherited marks: a link would swallow the token (the scanner never
      // reads one in link text); only the ones Markdown can write around it stay.
      view.dispatch(
        (embed && !inCode
          ? state.tr.replaceSelectionWith(
              embed.create({ raw: p.raw }, null, embedMarks(marks)),
              false
            )
          : state.tr.insertText(p.raw)
        ).scrollIntoView()
      );
    });
  return new Plugin({
    props: {
      handlePaste(_view, event) {
        const files = pastedFiles(event.clipboardData);
        if (files.length === 0) return false;
        void paste(files, insert);
        return true;
      },
      handleDrop(view, event) {
        const files = droppedFiles(event.dataTransfer);
        if (files.length === 0) return false;
        const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
        if (pos !== undefined) {
          view.dispatch(
            view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(pos)))
          );
        }
        void drop(files, insert);
        return true;
      },
    },
  });
}
