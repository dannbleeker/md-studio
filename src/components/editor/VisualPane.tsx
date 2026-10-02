import {
  defaultValueCtx,
  Editor,
  editorViewCtx,
  editorViewOptionsCtx,
  parserCtx,
  rootCtx,
} from '@milkdown/kit/core';
import { clipboard } from '@milkdown/kit/plugin/clipboard';
import { history } from '@milkdown/kit/plugin/history';
import { listener, listenerCtx } from '@milkdown/kit/plugin/listener';
import { commonmark } from '@milkdown/kit/preset/commonmark';
import { gfm } from '@milkdown/kit/preset/gfm';
import { useEffect, useRef } from 'react';
import { t } from '@/i18n';
import { useStore } from '@/store';
import { keepSourceStyle } from './keepSourceStyle';
import type { ScrollAdapter } from './scrollAdapter';

/** Text-pane edits are batched for this long before the visual tree is re-parsed. */
const TEXT_TO_VISUAL_DEBOUNCE_MS = 150;

const HEADINGS = ':scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6';

/**
 * Replaces only the top-level range that differs, so the selection and
 * scroll position in the visual pane stay put. `addToHistory: false` keeps
 * the other pane's edits out of this pane's undo stack and, because
 * Milkdown's listener skips such transactions, stops them echoing back.
 */
function applyMarkdown(editor: Editor, markdown: string) {
  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    const next = ctx.get(parserCtx)(markdown);
    if (!next) return;
    const current = view.state.doc;
    const start = current.content.findDiffStart(next.content);
    if (start == null) return;
    const end = current.content.findDiffEnd(next.content);
    let endA = end?.a ?? current.content.size;
    let endB = end?.b ?? next.content.size;
    const overlap = start - Math.min(endA, endB);
    if (overlap > 0) {
      endA += overlap;
      endB += overlap;
    }
    view.dispatch(
      view.state.tr.replace(start, endA, next.slice(start, endB)).setMeta('addToHistory', false)
    );
  });
}

type Props = { onAdapter: (adapter: ScrollAdapter | null) => void };

export function VisualPane({ onAdapter }: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const rootEl = root.current;
    const scrollEl = scroller.current;
    if (!rootEl || !scrollEl) return;
    let disposed = false;
    let editor: Editor | null = null;
    let pending: ReturnType<typeof setTimeout> | undefined;

    const flush = () => {
      clearTimeout(pending);
      pending = undefined;
      if (editor) applyMarkdown(editor, useStore.getState().doc.markdown);
    };

    Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, rootEl);
        ctx.set(defaultValueCtx, useStore.getState().doc.markdown);
        ctx.update(editorViewOptionsCtx, (prev) => ({
          ...prev,
          attributes: { 'aria-label': t('pane.visual'), spellcheck: 'true' },
        }));
        ctx.get(listenerCtx).markdownUpdated((listenerCtx, markdown) => {
          const previous = useStore.getState().doc.markdown;
          useStore
            .getState()
            .setMarkdown(keepSourceStyle(listenerCtx, previous, markdown), 'visual');
        });
      })
      .use(commonmark)
      .use(gfm)
      .use(history)
      .use(clipboard)
      .use(listener)
      .create()
      .then((created) => {
        if (disposed) {
          created.destroy();
          return;
        }
        editor = created;
        // The text pane may have changed while Milkdown was booting.
        flush();
      });

    const unsubscribe = useStore.subscribe((state, prev) => {
      if (state.loadId !== prev.loadId) {
        flush();
        scrollEl.scrollTop = 0;
        return;
      }
      if (state.doc.markdown === prev.doc.markdown || state.source === 'visual') return;
      clearTimeout(pending);
      pending = setTimeout(flush, TEXT_TO_VISUAL_DEBOUNCE_MS);
    });

    // About to type here: land any batched text-pane edits first, so the
    // visual tree never edits a stale copy of the document.
    const onFocus = () => {
      if (pending) flush();
    };
    rootEl.addEventListener('focusin', onFocus);

    onAdapter({
      scroller: scrollEl,
      headingOffsets: () => {
        const pm = rootEl.querySelector('.ProseMirror');
        if (!pm) return [];
        const base = scrollEl.getBoundingClientRect().top - scrollEl.scrollTop;
        return Array.from(pm.querySelectorAll<HTMLElement>(HEADINGS)).map(
          (el) => el.getBoundingClientRect().top - base
        );
      },
    });

    return () => {
      disposed = true;
      clearTimeout(pending);
      onAdapter(null);
      unsubscribe();
      rootEl.removeEventListener('focusin', onFocus);
      editor?.destroy();
    };
  }, [onAdapter]);

  return (
    <div ref={scroller} className="pane-scroll">
      <div ref={root} className="visual-doc" data-testid="visual-editor" />
    </div>
  );
}
