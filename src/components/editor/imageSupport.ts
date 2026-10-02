import type { EditorView as TextView } from '@codemirror/view';
import type { Editor } from '@milkdown/kit/core';
import { insertImageCommand } from '@milkdown/kit/preset/commonmark';
import type { Node } from '@milkdown/kit/prose/model';
import { Plugin, TextSelection } from '@milkdown/kit/prose/state';
import type { NodeViewConstructor } from '@milkdown/kit/prose/view';
import { callCommand } from '@milkdown/kit/utils';
import { isRelativeUrl } from '@/domain/imagePaths';

/** The image service loads on first use: most sessions never paste one. */
const images = () => import('@/services/images');

const imageFiles = (data: DataTransfer | null): File[] =>
  Array.from(data?.files ?? []).filter((f) => f.type.startsWith('image/'));

const placeImages = (files: File[], insert: (src: string, alt: string) => void) =>
  images().then((m) => m.placeImages(files, insert));

const markdownImage = (src: string, alt: string) =>
  `![${alt.replace(/[[\]\\]/g, '\\$&')}](${src.replace(/[()\s]/g, encodeURIComponent)})`;

/** Paste/drop handlers for the text pane: images become Markdown image links at the cursor. */
export function textPaneImageHandlers(): {
  paste: (event: ClipboardEvent, view: TextView) => boolean;
  drop: (event: DragEvent, view: TextView) => boolean;
} {
  const insert = (view: TextView) => (src: string, alt: string) =>
    view.dispatch(view.state.replaceSelection(markdownImage(src, alt)));
  return {
    paste(event, view) {
      const files = imageFiles(event.clipboardData);
      if (files.length === 0) return false;
      event.preventDefault();
      void placeImages(files, insert(view));
      return true;
    },
    drop(event, view) {
      const files = imageFiles(event.dataTransfer);
      if (files.length === 0) {
        // Any other dropped file is the window's to open (useFileDrop):
        // claiming it stops CodeMirror from also pasting the file's text.
        return (event.dataTransfer?.files.length ?? 0) > 0;
      }
      event.preventDefault();
      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
      if (pos !== null) view.dispatch({ selection: { anchor: pos } });
      void placeImages(files, insert(view));
      return true;
    },
  };
}

/** ProseMirror plugin for the visual pane: pasted and dropped images become image nodes. */
export function visualPaneImagePlugin(getEditor: () => Editor | null): Plugin {
  const insert = (src: string, alt: string) =>
    getEditor()?.action(callCommand(insertImageCommand.key, { src, alt }));
  return new Plugin({
    props: {
      handlePaste(_view, event) {
        const files = imageFiles(event.clipboardData);
        if (files.length === 0) return false;
        void placeImages(files, insert);
        return true;
      },
      handleDrop(view, event) {
        const files = imageFiles(event.dataTransfer);
        if (files.length === 0) return false;
        const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
        if (pos !== undefined) {
          view.dispatch(
            view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(pos)))
          );
        }
        void placeImages(files, insert);
        return true;
      },
    },
  });
}

/**
 * Renders images in the visual pane. Relative links (images saved next to
 * the document) can't load from the app's origin, so they're read from the
 * document's folder and shown via an object URL. The node's own `src` is
 * never touched, so the Markdown keeps the relative link.
 */
export const imageNodeView: NodeViewConstructor = (initial: Node) => {
  const img = document.createElement('img');
  let current = '';
  const render = (node: Node) => {
    const src = String(node.attrs.src ?? '');
    img.alt = String(node.attrs.alt ?? '');
    img.title = String(node.attrs.title ?? '');
    if (src === current) return;
    current = src;
    if (!isRelativeUrl(src)) {
      img.src = src;
      return;
    }
    img.src = src; // shows the alt text if it can't be resolved
    void images()
      .then((m) => m.resolveRelativeImage(src))
      .then((url) => {
        if (url && current === src) img.src = url;
      });
  };
  render(initial);
  return {
    dom: img,
    update(node) {
      if (node.type !== initial.type) return false;
      render(node);
      return true;
    },
    ignoreMutation: () => true,
  };
};
