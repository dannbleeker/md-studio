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
import type { Ctx } from '@milkdown/kit/ctx';
import { clipboard } from '@milkdown/kit/plugin/clipboard';
import { history } from '@milkdown/kit/plugin/history';
import { listener, listenerCtx } from '@milkdown/kit/plugin/listener';
import { commonmark } from '@milkdown/kit/preset/commonmark';
import { gfm } from '@milkdown/kit/preset/gfm';
import { Plugin } from '@milkdown/kit/prose/state';
import { getMarkdown } from '@milkdown/kit/utils';
import { search } from 'prosemirror-search';
import { useEffect, useRef } from 'react';
import { dropEmptyLineMarkers } from '@/domain/emptyLines';
import { t } from '@/i18n';
import { perfMeasure } from '@/services/perfMarks';
import { useStore } from '@/store';
import { registerFlush } from '@/store/flush';
import { showToast } from '@/store/ui';
import { registerViewPart } from '@/store/viewState';
import { applyFull, applyIncremental } from './applyMarkdown';
import { clickSelection } from './clickSelection';
import { editors, isHidden, restoreScroll, visualHeadings } from './editorRegistry';
import { reportFormat } from './formatState';
import { frontMatter, remarkFrontMatter } from './frontMatter';
import { imageNodeView, visualPaneImagePlugin } from './imageSupport';
import { imageTitleFix } from './imageTitleFix';
import { keepSourceStyle } from './keepSourceStyle';
import type { ScrollAdapter } from './scrollAdapter';
import { createVisualSync, type SyncState } from './visualSync';

type Props = { onAdapter: (adapter: ScrollAdapter | null) => void };

export function VisualPane({ onAdapter }: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const rootEl = root.current;
    const scrollEl = scroller.current;
    if (!rootEl || !scrollEl) return;
    let editor: Editor | null = null;
    /** A user edit not yet reported to the store (see the listener below). */
    let unreported = false;
    /**
     * The pane shows an empty placeholder for a document it can't parse.
     * Nothing may reach the store from it: serializing that empty tree
     * would replace the whole document.
     */
    let failed = false;

    /**
     * Hands a user edit to the store, in the source's own style. Cleared
     * first: the store's subscribers run inside setMarkdown.
     */
    const report = (ctx: Ctx, markdown: string) => {
      unreported = false;
      if (failed) return;
      const previous = useStore.getState().doc.markdown;
      const serialized = dropEmptyLineMarkers(markdown);
      useStore.getState().setMarkdown(keepSourceStyle(ctx, previous, serialized), 'visual');
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
            clickSelection,
          ]);
          ctx.update(remarkPluginsCtx, (plugins) => [...plugins, remarkFrontMatter, imageTitleFix]);
          ctx.update(nodeViewCtx, (views) => {
            const image: (typeof views)[number] = ['image', imageNodeView];
            return [...views, image];
          });
          ctx.update(editorViewOptionsCtx, (prev) => ({
            ...prev,
            attributes: { 'aria-label': t('pane.visual'), spellcheck: 'true' },
          }));
          ctx.get(listenerCtx).markdownUpdated((listenerCtx) => {
            // Already flushed, or fired after a load (another tab, a reload
            // from disk): nothing of the user's to report. The listener's
            // own Markdown is the last user transaction's document, from
            // before any text-pane edits applied since: report the current one.
            if (unreported) report(listenerCtx, getMarkdown()(listenerCtx));
          });
        })
        .use(commonmark)
        .use(gfm)
        .use(frontMatter)
        .use(history)
        .use(clipboard)
        .use(listener)
        .create();

    const read = (state = useStore.getState()): SyncState => ({
      markdown: state.doc.markdown,
      viewMode: state.viewMode,
      loadId: state.loadId,
      source: state.source,
    });

    // Mounted again after the start screen: back to the scroll the store
    // kept, once the first editor shows the document (unless a load came first).
    const mountedAt = useStore.getState();
    let restoreOnCreate = mountedAt.restoreView !== null;

    const sync = createVisualSync<Editor>({
      read,
      create,
      destroy: (old) => {
        old?.destroy();
        rootEl.replaceChildren();
      },
      setEditor: (next) => {
        if (next && restoreOnCreate) {
          restoreOnCreate = false;
          const now = useStore.getState();
          if (now.loadId === mountedAt.loadId)
            restoreScroll(scrollEl, now.restoreView?.visualScroll ?? 0);
        }
        // The placeholder stays unregistered, so the format toolbar and
        // find bar can't act on it.
        if (next && !failed) {
          editors.visual = next.action((ctx) => ctx.get(editorViewCtx));
          editors.milkdown = next;
        } else if (editor && editors.milkdown === editor) {
          // Unregister only this pane's editor, never one that replaced it.
          editors.visual = null;
          editors.milkdown = null;
        }
        editor = next;
      },
      applyFull,
      applyIncremental,
      setFailed: (value, firstTime) => {
        if (firstTime) showToast(t('toast.visualFailed'));
        failed = value;
        rootEl.inert = value;
        rootEl.classList.toggle('visual-failed', value);
      },
      measure: perfMeasure,
    });

    // Printing shows this pane: front matter prints only when exports include it.
    const printFrontMatter = (include: boolean) =>
      rootEl.classList.toggle('print-front-matter', include);
    printFrontMatter(useStore.getState().settings.exportFrontMatter);

    const unsubscribe = useStore.subscribe((state, prev) => {
      sync.onChange(read(state), read(prev));
      printFrontMatter(state.settings.exportFrontMatter);
      if (state.loadId !== prev.loadId) {
        restoreScroll(scrollEl, state.restoreView?.visualScroll ?? 0);
      }
    });

    const onFocus = () => {
      editors.lastFocused = 'visual';
      sync.onFocus();
    };
    rootEl.addEventListener('focusin', onFocus);

    const flush = () => {
      if (unreported) editor?.action((ctx) => report(ctx, getMarkdown()(ctx)));
    };
    const unregisterFlush = registerFlush(flush);

    const unregisterView = registerViewPart(() =>
      isHidden(scrollEl) ? {} : { visualScroll: scrollEl.scrollTop }
    );

    onAdapter({
      scroller: scrollEl,
      headingOffsets: () => {
        const pm = rootEl.querySelector('.ProseMirror');
        if (!pm) return [];
        const base = scrollEl.getBoundingClientRect().top - scrollEl.scrollTop;
        return visualHeadings(pm).map((el) => el.getBoundingClientRect().top - base);
      },
    });

    return () => {
      // Whatever unmounts the pane, an edit still in its debounce is reported, not lost.
      flush();
      onAdapter(null);
      unsubscribe();
      unregisterView();
      unregisterFlush();
      rootEl.removeEventListener('focusin', onFocus);
      sync.dispose();
    };
  }, [onAdapter]);

  return (
    <div ref={scroller} className="pane-scroll">
      <div ref={root} className="visual-doc" data-testid="visual-editor" />
    </div>
  );
}
