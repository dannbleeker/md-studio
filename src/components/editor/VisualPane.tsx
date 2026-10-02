import {
  defaultValueCtx,
  Editor,
  editorViewCtx,
  editorViewOptionsCtx,
  prosePluginsCtx,
  rootCtx,
} from '@milkdown/kit/core';
import { clipboard } from '@milkdown/kit/plugin/clipboard';
import { history } from '@milkdown/kit/plugin/history';
import { listener, listenerCtx } from '@milkdown/kit/plugin/listener';
import { commonmark } from '@milkdown/kit/preset/commonmark';
import { gfm } from '@milkdown/kit/preset/gfm';
import { search } from 'prosemirror-search';
import { useEffect, useRef } from 'react';
import { t } from '@/i18n';
import { perfMeasure } from '@/services/perfMarks';
import { useStore } from '@/store';
import { applyFull, applyIncremental } from './applyMarkdown';
import { editors } from './editorRegistry';
import { keepSourceStyle } from './keepSourceStyle';
import type { ScrollAdapter } from './scrollAdapter';

/** Text-pane edits are batched for this long before the visual tree is updated. */
const TEXT_TO_VISUAL_DEBOUNCE_MS = 150;

/**
 * After incremental updates, one full parse once typing has paused this
 * long guarantees the panes can never drift apart.
 */
const RECONCILE_AFTER_MS = 2500;

const HEADINGS = ':scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6';

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
    let reconcileTimer: ReturnType<typeof setTimeout> | undefined;
    // The Markdown the visual document currently represents.
    let appliedMd = useStore.getState().doc.markdown;
    // Text-only view: the hidden pane skips updates and catches up when shown.
    let staleWhileHidden = false;

    const applyAll = (markdown: string) => {
      if (!editor) return;
      clearTimeout(reconcileTimer);
      applyFull(editor, markdown);
      appliedMd = markdown;
    };

    const flush = () => {
      clearTimeout(pending);
      pending = undefined;
      if (!editor) return;
      const { doc, viewMode } = useStore.getState();
      if (viewMode === 'text') {
        staleWhileHidden = true;
        return;
      }
      staleWhileHidden = false;
      const started = performance.now();
      const incremental = applyIncremental(editor, appliedMd, doc.markdown);
      if (!incremental) applyAll(doc.markdown);
      perfMeasure(incremental ? 'visual-sync:incremental' : 'visual-sync:full', started);
      if (incremental) {
        appliedMd = doc.markdown;
        clearTimeout(reconcileTimer);
        reconcileTimer = setTimeout(() => {
          const t0 = performance.now();
          applyAll(useStore.getState().doc.markdown);
          perfMeasure('visual-sync:reconcile', t0);
        }, RECONCILE_AFTER_MS);
      }
    };

    Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, rootEl);
        ctx.set(defaultValueCtx, useStore.getState().doc.markdown);
        // Match highlighting and search state for the app's find bar.
        ctx.update(prosePluginsCtx, (plugins) => [...plugins, search()]);
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
        editors.visual = created.action((ctx) => ctx.get(editorViewCtx));
        // The text pane may have changed while Milkdown was booting.
        flush();
      });

    const unsubscribe = useStore.subscribe((state, prev) => {
      if (state.loadId !== prev.loadId) {
        if (state.viewMode === 'text') staleWhileHidden = true;
        else applyAll(state.doc.markdown);
        scrollEl.scrollTop = 0;
        return;
      }
      if (staleWhileHidden && state.viewMode !== 'text' && prev.viewMode === 'text') {
        flush();
        return;
      }
      if (state.doc.markdown === prev.doc.markdown) return;
      if (state.source === 'visual') {
        // This pane made the edit: its document is the truth, and a pending
        // reconcile could only disturb the cursor.
        appliedMd = state.doc.markdown;
        clearTimeout(reconcileTimer);
        return;
      }
      clearTimeout(pending);
      pending = setTimeout(flush, TEXT_TO_VISUAL_DEBOUNCE_MS);
    });

    // About to type here: land any batched text-pane edits first, so the
    // visual tree never edits a stale copy of the document.
    const onFocus = () => {
      editors.lastFocused = 'visual';
      if (pending || staleWhileHidden) flush();
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
      clearTimeout(reconcileTimer);
      onAdapter(null);
      unsubscribe();
      rootEl.removeEventListener('focusin', onFocus);
      if (editor && editors.visual === editor.action((ctx) => ctx.get(editorViewCtx))) {
        editors.visual = null;
      }
      editor?.destroy();
    };
  }, [onAdapter]);

  return (
    <div ref={scroller} className="pane-scroll">
      <div ref={root} className="visual-doc" data-testid="visual-editor" />
    </div>
  );
}
