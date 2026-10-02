import {
  defaultValueCtx,
  Editor,
  editorViewCtx,
  editorViewOptionsCtx,
  nodeViewCtx,
  prosePluginsCtx,
  remarkPluginsCtx,
  rootCtx,
} from '@milkdown/kit/core';
import { clipboard } from '@milkdown/kit/plugin/clipboard';
import { history } from '@milkdown/kit/plugin/history';
import { listener, listenerCtx } from '@milkdown/kit/plugin/listener';
import { commonmark } from '@milkdown/kit/preset/commonmark';
import { gfm } from '@milkdown/kit/preset/gfm';
import { Plugin } from '@milkdown/kit/prose/state';
import { getMarkdown } from '@milkdown/kit/utils';
import { search } from 'prosemirror-search';
import { useEffect, useRef } from 'react';
import { tooDeeplyNested } from '@/domain/nesting';
import { t } from '@/i18n';
import { perfMeasure } from '@/services/perfMarks';
import { useStore } from '@/store';
import { registerFlush } from '@/store/flush';
import { showToast } from '@/store/ui';
import { registerViewPart } from '@/store/viewState';
import { applyFull, applyIncremental } from './applyMarkdown';
import { editors, isHidden, restoreScroll } from './editorRegistry';
import { reportFormat } from './formatState';
import { imageNodeView, visualPaneImagePlugin } from './imageSupport';
import { imageTitleFix } from './imageTitleFix';
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
    /** A user edit not yet reported to the store (see the listener below). */
    let unreported = false;
    let pending: ReturnType<typeof setTimeout> | undefined;
    let reconcileTimer: ReturnType<typeof setTimeout> | undefined;
    /** An incremental update hasn't been checked against a full parse yet. */
    let reconcileDue = false;
    // The Markdown the visual document currently represents.
    let appliedMd = useStore.getState().doc.markdown;
    // Text-only view: the hidden pane skips updates and catches up when shown.
    let staleWhileHidden = false;

    // A document the parser can't handle (thousands of nested quotes or
    // emphasis markers overflow its stack) can't be shown here, and the
    // overflow leaves Milkdown's parser broken for later documents too. The
    // pane is rebuilt empty and kept inert until the Markdown parses again:
    // an edit to a stale tree would be serialized over the Markdown.
    // Documents known to be too deep (domain/nesting.ts) aren't even tried:
    // deep brackets don't overflow, but take seconds to parse.
    let failed = false;
    const setFailed = (value: boolean) => {
      if (value && !failed) showToast(t('toast.visualFailed'));
      failed = value;
      rootEl.inert = value;
      rootEl.classList.toggle('visual-failed', value);
    };

    const applyAll = (markdown: string) => {
      if (!editor) return;
      clearTimeout(reconcileTimer);
      reconcileDue = false;
      if (failed || tooDeeplyNested([markdown])) {
        if (markdown !== appliedMd || !failed) void mount(markdown);
        return;
      }
      try {
        applyFull(editor, markdown);
        appliedMd = markdown;
      } catch {
        void mount(markdown);
      }
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
      if (failed || tooDeeplyNested([doc.markdown])) {
        applyAll(doc.markdown);
        return;
      }
      const started = performance.now();
      let incremental = false;
      try {
        incremental = applyIncremental(editor, appliedMd, doc.markdown);
      } catch {
        // Settled by the full parse below, which rebuilds the pane if it fails too.
      }
      if (!incremental) applyAll(doc.markdown);
      perfMeasure(incremental ? 'visual-sync:incremental' : 'visual-sync:full', started);
      if (incremental) {
        appliedMd = doc.markdown;
        clearTimeout(reconcileTimer);
        reconcileDue = true;
        reconcileTimer = setTimeout(() => {
          const t0 = performance.now();
          applyAll(useStore.getState().doc.markdown);
          perfMeasure('visual-sync:reconcile', t0);
        }, RECONCILE_AFTER_MS);
      }
    };

    const create = (initial: string) =>
      Editor.make()
        .config((ctx) => {
          ctx.set(rootCtx, rootEl);
          ctx.set(defaultValueCtx, initial);
          // Match highlighting and search state for the app's find bar.
          // + the format toolbar's view of the selection, after every change
          // (a mark toggle changes formatting without moving the selection).
          ctx.update(prosePluginsCtx, (plugins) => [
            ...plugins,
            search(),
            new Plugin({ view: () => ({ update: (view) => reportFormat(view.state) }) }),
            // A user edit the debounced listener hasn't reported yet. Store
            // updates are applied with addToHistory false and don't count.
            new Plugin({
              appendTransaction: (trs) => {
                if (trs.some((tr) => tr.docChanged && tr.getMeta('addToHistory') !== false))
                  unreported = true;
                return null;
              },
            }),
            visualPaneImagePlugin(() => editor),
          ]);
          ctx.update(remarkPluginsCtx, (plugins) => [...plugins, imageTitleFix]);
          ctx.update(nodeViewCtx, (views) => {
            const image: (typeof views)[number] = ['image', imageNodeView];
            return [...views, image];
          });
          ctx.update(editorViewOptionsCtx, (prev) => ({
            ...prev,
            attributes: { 'aria-label': t('pane.visual'), spellcheck: 'true' },
          }));
          ctx.get(listenerCtx).markdownUpdated((listenerCtx, markdown) => {
            // Already flushed, or fired after a load (another tab, a reload
            // from disk): nothing of the user's to report.
            if (!unreported) return;
            unreported = false;
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
        .create();

    /** (Re)builds the editor showing `markdown`, or empty and inert if it can't be parsed. */
    const mount = (markdown: string): Promise<void> => {
      const previous = editor;
      editor = null;
      if (previous && editors.milkdown === previous) {
        editors.visual = null;
        editors.milkdown = null;
      }
      previous?.destroy();
      rootEl.replaceChildren();
      clearTimeout(reconcileTimer);
      reconcileDue = false;
      appliedMd = markdown;
      const created = tooDeeplyNested([markdown])
        ? Promise.reject(new Error('nested too deeply'))
        : create(markdown);
      return created
        .then((created) => {
          setFailed(false);
          return created;
        })
        .catch(() => {
          rootEl.replaceChildren();
          setFailed(true);
          return create('');
        })
        .then((created) => {
          if (disposed) {
            created.destroy();
            return;
          }
          editor = created;
          editors.visual = created.action((ctx) => ctx.get(editorViewCtx));
          editors.milkdown = created;
          // The text pane may have changed while Milkdown was booting.
          flush();
        });
    };
    void mount(appliedMd);

    const unsubscribe = useStore.subscribe((state, prev) => {
      if (state.loadId !== prev.loadId) {
        if (state.viewMode === 'text') staleWhileHidden = true;
        else applyAll(state.doc.markdown);
        restoreScroll(scrollEl, state.restoreView?.visualScroll ?? 0);
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
        reconcileDue = false;
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
      // Settle any incremental update before the user edits this tree:
      // once they type, the tree is serialized as the truth, and a
      // divergence from a full parse would become permanent.
      if (reconcileDue) applyAll(useStore.getState().doc.markdown);
    };
    rootEl.addEventListener('focusin', onFocus);

    const unregisterFlush = registerFlush(() => {
      if (!unreported || !editor) return;
      unreported = false;
      editor.action((ctx) => {
        const previous = useStore.getState().doc.markdown;
        useStore
          .getState()
          .setMarkdown(keepSourceStyle(ctx, previous, getMarkdown()(ctx)), 'visual');
      });
    });

    const unregisterView = registerViewPart(() =>
      isHidden(scrollEl) ? {} : { visualScroll: scrollEl.scrollTop }
    );

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
      unregisterView();
      unregisterFlush();
      rootEl.removeEventListener('focusin', onFocus);
      if (editor && editors.milkdown === editor) {
        editors.visual = null;
        editors.milkdown = null;
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
