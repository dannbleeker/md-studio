import { markdown } from '@codemirror/lang-markdown';
import { syntaxHighlighting } from '@codemirror/language';
import { languages } from '@codemirror/language-data';
import { search } from '@codemirror/search';
import { Annotation, Compartment, EditorState, Transaction } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { basicSetup } from 'codemirror';
import { useEffect, useRef } from 'react';
import { findHeadings } from '@/domain/headings';
import { minimalChange } from '@/domain/textDiff';
import { t } from '@/i18n';
import { useStore } from '@/store';
import { registerViewPart } from '@/store/viewState';
import { editors, isHidden, restoreScroll } from './editorRegistry';
import { highlightStyle } from './highlight';
import { textPaneImageHandlers } from './imageSupport';
import type { ScrollAdapter } from './scrollAdapter';

/** Marks transactions that carry the other pane's edits, so they aren't echoed back. */
const fromStore = Annotation.define<boolean>();

/** Swapped at runtime when the line-wrapping setting changes. */
const wrapping = new Compartment();

const theme = EditorView.theme({
  // --editor-scale follows the font-size setting (see app.css).
  '&': { height: '100%', fontSize: 'calc(0.95rem * var(--editor-scale, 1))' },
  '.cm-scroller': { fontFamily: 'var(--font-mono)', lineHeight: '1.6' },
  '.cm-content': { padding: '1rem 0' },
  '.cm-gutters': {
    backgroundColor: 'var(--surface-2)',
    color: 'var(--text-faint)',
    border: 'none',
  },
  '.cm-activeLine': { backgroundColor: 'var(--active-line)' },
  '.cm-activeLineGutter': { backgroundColor: 'var(--active-line)' },
  '&.cm-focused': { outline: 'none' },
  '.cm-cursor': { borderLeftColor: 'var(--text)' },
});

type Props = { onAdapter: (adapter: ScrollAdapter | null) => void };

export function TextPane({ onAdapter }: Props) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!host.current) return;
    const view = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: useStore.getState().doc.markdown,
        extensions: [
          basicSetup,
          // Takes precedence over basicSetup's fallback default style.
          syntaxHighlighting(highlightStyle),
          markdown({ codeLanguages: languages }),
          // Search state for the app's find bar (its own panel stays closed).
          search(),
          wrapping.of(useStore.getState().settings.lineWrapping ? EditorView.lineWrapping : []),
          EditorView.domEventHandlers(textPaneImageHandlers()),
          EditorView.contentAttributes.of({ 'aria-label': t('pane.text') }),
          theme,
          EditorView.updateListener.of((update) => {
            if (!update.docChanged) return;
            if (update.transactions.every((tr) => tr.annotation(fromStore))) return;
            useStore.getState().setMarkdown(update.state.doc.toString(), 'text');
          }),
        ],
      }),
    });

    editors.text = view;
    const onFocus = () => {
      editors.lastFocused = 'text';
    };
    view.contentDOM.addEventListener('focus', onFocus);

    const unsubscribe = useStore.subscribe((state, prev) => {
      const { lineWrapping, lineNumbers, fontSize } = state.settings;
      if (lineWrapping !== prev.settings.lineWrapping) {
        view.dispatch({
          effects: wrapping.reconfigure(lineWrapping ? EditorView.lineWrapping : []),
        });
      }
      // Gutter visibility and font size are CSS; line heights change, so re-measure.
      if (lineNumbers !== prev.settings.lineNumbers || fontSize !== prev.settings.fontSize) {
        requestAnimationFrame(() => view.requestMeasure());
      }
      const loaded = state.loadId !== prev.loadId;
      if (!loaded && (state.doc.markdown === prev.doc.markdown || state.source === 'text')) return;
      const current = view.state.doc.toString();
      if (loaded) {
        // A tab switched back to returns to its cursor and scroll; a newly
        // opened document starts at the top.
        const at = state.restoreView;
        const clamp = (n: number) => Math.min(Math.max(n, 0), state.doc.markdown.length);
        view.dispatch({
          changes: { from: 0, to: current.length, insert: state.doc.markdown },
          selection: { anchor: clamp(at?.textAnchor ?? 0), head: clamp(at?.textHead ?? 0) },
          annotations: [fromStore.of(true), Transaction.addToHistory.of(false)],
        });
        restoreScroll(view.scrollDOM, at?.textScroll ?? 0);
        return;
      }
      // Apply only the span the visual pane changed, so the cursor and
      // scroll position here survive.
      const change = minimalChange(current, state.doc.markdown);
      if (change) view.dispatch({ changes: change, annotations: fromStore.of(true) });
    });

    const unregisterView = registerViewPart(() => {
      const { anchor, head } = view.state.selection.main;
      return isHidden(view.dom)
        ? { textAnchor: anchor, textHead: head }
        : { textAnchor: anchor, textHead: head, textScroll: view.scrollDOM.scrollTop };
    });

    onAdapter({
      scroller: view.scrollDOM,
      headingOffsets: () => {
        const doc = view.state.doc;
        return findHeadings(doc.toString())
          .filter((h) => h.line < doc.lines)
          .map((h) => view.lineBlockAt(doc.line(h.line + 1).from).top);
      },
    });

    return () => {
      onAdapter(null);
      unsubscribe();
      unregisterView();
      view.contentDOM.removeEventListener('focus', onFocus);
      if (editors.text === view) editors.text = null;
      view.destroy();
    };
  }, [onAdapter]);

  return <div ref={host} className="pane-host" data-testid="text-editor" />;
}
