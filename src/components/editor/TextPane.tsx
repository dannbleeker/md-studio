import { markdown } from '@codemirror/lang-markdown';
import { syntaxHighlighting } from '@codemirror/language';
import { languages } from '@codemirror/language-data';
import { search } from '@codemirror/search';
import { Annotation, EditorState, Transaction } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { basicSetup } from 'codemirror';
import { useEffect, useRef } from 'react';
import { findHeadings } from '@/domain/headings';
import { minimalChange } from '@/domain/textDiff';
import { t } from '@/i18n';
import { useStore } from '@/store';
import { editors } from './editorRegistry';
import { highlightStyle } from './highlight';
import { textPaneImageHandlers } from './imageSupport';
import type { ScrollAdapter } from './scrollAdapter';

/** Marks transactions that carry the other pane's edits, so they aren't echoed back. */
const fromStore = Annotation.define<boolean>();

const theme = EditorView.theme({
  '&': { height: '100%', fontSize: '0.95rem' },
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
          EditorView.lineWrapping,
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
      const loaded = state.loadId !== prev.loadId;
      if (!loaded && (state.doc.markdown === prev.doc.markdown || state.source === 'text')) return;
      const current = view.state.doc.toString();
      if (loaded) {
        view.dispatch({
          changes: { from: 0, to: current.length, insert: state.doc.markdown },
          selection: { anchor: 0 },
          annotations: [fromStore.of(true), Transaction.addToHistory.of(false)],
        });
        view.scrollDOM.scrollTop = 0;
        return;
      }
      // Apply only the span the visual pane changed, so the cursor and
      // scroll position here survive.
      const change = minimalChange(current, state.doc.markdown);
      if (change) view.dispatch({ changes: change, annotations: fromStore.of(true) });
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
      view.contentDOM.removeEventListener('focus', onFocus);
      if (editors.text === view) editors.text = null;
      view.destroy();
    };
  }, [onAdapter]);

  return <div ref={host} className="pane-host" data-testid="text-editor" />;
}
