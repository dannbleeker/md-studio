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
import { EMBED_NODE_NAME } from '@/domain/embeds';
import { dropEmptyLineMarkers } from '@/domain/emptyLines';
import { withMathPlaceholders } from '@/domain/mathPlaceholder';
import { rememberPosition } from '@/domain/readPositions';
import { buildAnchors, fromAnchorPosition, toAnchorPosition } from '@/domain/scrollMap';
import { t } from '@/i18n';
import { perfMeasure } from '@/services/perfMarks';
import { loadReadPositions, saveReadPositions } from '@/services/storage';
import { useStore } from '@/store';
import { registerFlush, registerPrepareForPrint } from '@/store/flush';
import { showToast } from '@/store/ui';
import { registerViewPart } from '@/store/viewState';
import { applyFull, applyIncremental } from './applyMarkdown';
import { clickSelection } from './clickSelection';
import { editors, isHidden, restoreScroll, visualHeadings } from './editorRegistry';
import { configureEmbedStringify, embeds, remarkEmbeds } from './embedNode';
import { embedNodeView } from './embedView';
import { reportFormat } from './formatState';
import { frontMatter, remarkFrontMatter } from './frontMatter';
import { visualPaneImagePlugin } from './imageSupport';
import { imageTitleFix } from './imageTitleFix';
import { imageNodeView } from './imageView';
import { keepSourceStyle } from './keepSourceStyle';
import { remarkMath } from './mathNode';
import { loadReadExtras, readHost } from './readHost';
import type { ScrollAdapter } from './scrollAdapter';
import { createVisualSync, type SyncState } from './visualSync';

/** Read view's extras load after the first paint, so typing never waits for them. */
const READ_EXTRAS_DELAY_MS = 1500;

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
          ctx.set(defaultValueCtx, withMathPlaceholders(initial));
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
            readHost,
          ]);
          ctx.update(remarkPluginsCtx, (plugins) => [
            ...plugins,
            remarkFrontMatter,
            imageTitleFix,
            remarkEmbeds,
            remarkMath,
          ]);
          configureEmbedStringify(ctx);
          ctx.update(nodeViewCtx, (views) => {
            const image: (typeof views)[number] = ['image', imageNodeView];
            const embed: (typeof views)[number] = [EMBED_NODE_NAME, embedNodeView];
            return [...views, image, embed];
          });
          ctx.update(editorViewOptionsCtx, (prev) => ({
            ...prev,
            // A function, so Read view can switch the red squiggles off.
            attributes: () => ({
              'aria-label': t('pane.visual'),
              spellcheck: useStore.getState().viewMode === 'read' ? 'false' : 'true',
            }),
            // Read view shows the document without letting it be changed.
            editable: () => useStore.getState().viewMode !== 'read',
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
        .use(embeds)
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
    let resumedOnCreate = false;

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
        } else if (next && !resumedOnCreate && mountedAt.restoreView === null) {
          resumedOnCreate = true;
          resume(useStore.getState().handleId);
        }
        // Link clicks, hover cards and the rest of Read view arrive once the page is up.
        if (next && !failed) {
          if (useStore.getState().viewMode === 'read') void loadReadExtras().catch(() => {});
          else setTimeout(() => void loadReadExtras().catch(() => {}), READ_EXTRAS_DELAY_MS);
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

    const headingOffsets = () => {
      const pm = rootEl.querySelector('.ProseMirror');
      if (!pm) return [];
      const base = scrollEl.getBoundingClientRect().top - scrollEl.scrollTop;
      return visualHeadings(pm).map((el) => el.getBoundingClientRect().top - base);
    };

    // Where the reader had got to in each file, kept across sessions: a file
    // opens again where it was left, unless the reader has already moved.
    let positions = loadReadPositions();
    let userScrolled = false;
    // Scroll events right after a load are the page being replaced, not the reader moving.
    let holdSavingUntil = 0;
    const resume = (handleId: string | null) => {
      holdSavingUntil = performance.now() + 1500;
      userScrolled = false;
      const saved = handleId ? positions[handleId] : undefined;
      if (!saved) return;
      const apply = () => {
        if (userScrolled || isHidden(scrollEl)) return;
        editors.linkedScrollPausedUntil = performance.now() + 300;
        scrollEl.scrollTop = fromAnchorPosition(
          buildAnchors(headingOffsets(), scrollEl.scrollHeight),
          saved
        );
      };
      // The layout settles for a while (images, embeds): try again as it does.
      for (const delay of [60, 350, 1000]) resumeTimers.push(setTimeout(apply, delay));
    };
    const resumeTimers: ReturnType<typeof setTimeout>[] = [];
    let saveTimer: ReturnType<typeof setTimeout> | null = null;
    const onScroll = () => {
      if (saveTimer !== null) clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        const handleId = useStore.getState().handleId;
        if (!handleId || isHidden(scrollEl) || performance.now() < holdSavingUntil) return;
        const where = toAnchorPosition(
          buildAnchors(headingOffsets(), scrollEl.scrollHeight),
          scrollEl.scrollTop
        );
        positions = rememberPosition(positions, handleId, where, Date.now());
        saveReadPositions(positions);
      }, 500);
    };
    const noteUserScroll = () => {
      userScrolled = true;
    };
    scrollEl.addEventListener('scroll', onScroll, { passive: true });
    const userEvents = ['wheel', 'touchstart', 'pointerdown', 'keydown'] as const;
    for (const type of userEvents)
      scrollEl.addEventListener(type, noteUserScroll, { passive: true });

    const unsubscribe = useStore.subscribe((state, prev) => {
      sync.onChange(read(state), read(prev));
      if ((state.viewMode === 'read') !== (prev.viewMode === 'read')) {
        // Read view lays the page out differently: keep the same heading on top.
        const where = isHidden(scrollEl)
          ? null
          : toAnchorPosition(
              buildAnchors(headingOffsets(), scrollEl.scrollHeight),
              scrollEl.scrollTop
            );
        // ProseMirror only re-reads `editable` (and its decorations) when its props are set.
        if (state.viewMode === 'read') void loadReadExtras().catch(() => {});
        editors.visual?.setProps({});
        if (where !== null) {
          editors.linkedScrollPausedUntil = performance.now() + 400;
          requestAnimationFrame(() =>
            requestAnimationFrame(() => {
              if (isHidden(scrollEl)) return;
              scrollEl.scrollTop = fromAnchorPosition(
                buildAnchors(headingOffsets(), scrollEl.scrollHeight),
                where
              );
            })
          );
        }
      }
      printFrontMatter(state.settings.exportFrontMatter);
      if (state.loadId !== prev.loadId) {
        restoreScroll(scrollEl, state.restoreView?.visualScroll ?? 0);
        // A tab visited before keeps its own spot; a file opened fresh resumes.
        if (!state.restoreView) resume(state.handleId);
      } else if (state.handleId !== prev.handleId && prev.handleId === null && !userScrolled) {
        // The restored document's file handle arrives after the document.
        resume(state.handleId);
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
    // Ctrl+P and the Print command go through printDocument; the browser's menu
    // only fires beforeprint, which can still update the tree synchronously.
    const prepare = () => sync.prepareForPrint();
    const unregisterPrepare = registerPrepareForPrint(prepare);
    window.addEventListener('beforeprint', prepare);

    const unregisterView = registerViewPart(() =>
      isHidden(scrollEl) ? {} : { visualScroll: scrollEl.scrollTop }
    );

    onAdapter({ scroller: scrollEl, headingOffsets });

    return () => {
      // Whatever unmounts the pane, an edit still in its debounce is reported, not lost.
      flush();
      onAdapter(null);
      unsubscribe();
      unregisterView();
      unregisterFlush();
      unregisterPrepare();
      window.removeEventListener('beforeprint', prepare);
      rootEl.removeEventListener('focusin', onFocus);
      scrollEl.removeEventListener('scroll', onScroll);
      for (const type of userEvents) scrollEl.removeEventListener(type, noteUserScroll);
      if (saveTimer !== null) clearTimeout(saveTimer);
      for (const timer of resumeTimers) clearTimeout(timer);
      sync.dispose();
    };
  }, [onAdapter]);

  return (
    <div ref={scroller} className="pane-scroll">
      <div ref={root} className="visual-doc" data-testid="visual-editor" />
    </div>
  );
}
