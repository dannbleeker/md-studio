import {
  SearchQuery as CmQuery,
  findNext as cmFindNext,
  findPrevious as cmFindPrevious,
  replaceAll as cmReplaceAll,
  replaceNext as cmReplaceNext,
  getSearchQuery,
  setSearchQuery,
} from '@codemirror/search';
import type { EditorView as TextView } from '@codemirror/view';
import { Fragment, type Mark, type Node as PmNode, Slice } from '@milkdown/kit/prose/model';
import type { EditorState } from '@milkdown/kit/prose/state';
import {
  getSearchState,
  SearchQuery as PmQuery,
  findNext as pmFindNext,
  findPrev as pmFindPrev,
  replaceAll as pmReplaceAll,
  replaceNext as pmReplaceNext,
  setSearchState,
} from 'prosemirror-search';
import { editors } from '../editor/editorRegistry';

/**
 * One find & replace interface over both panes: CodeMirror's search for
 * the Markdown source, prosemirror-search for the visual pane. A replace in
 * either pane reaches the other through the normal sync.
 */

export type FindOptions = {
  search: string;
  replace: string;
  caseSensitive: boolean;
  regexp: boolean;
  wholeWord: boolean;
};

export type FindTarget = 'text' | 'visual';

/** Counting stops here; "1000+" is plenty of signal. */
const MAX_COUNT = 1000;

export type MatchInfo = { total: number; current: number; valid: boolean };

type Engine = {
  apply(options: FindOptions): MatchInfo;
  next(): void;
  prev(): void;
  replace(): void;
  replaceAll(): void;
  clear(): void;
  info(): MatchInfo;
  focus(): void;
};

// Engines are stateless: the active query lives in each editor's own
// search state, so it survives between calls and pane switches.

function textEngine(): Engine | null {
  const view = editors.text;
  if (!view) return null;
  const query = () => getSearchQuery(view.state);
  const info = (): MatchInfo => {
    const q = query();
    if (!q.valid) return { total: 0, current: 0, valid: q.search === '' };
    const sel = view.state.selection.main;
    let total = 0;
    let current = 0;
    const cursor = q.getCursor(view.state);
    for (let m = cursor.next(); !m.done && total < MAX_COUNT; m = cursor.next()) {
      total++;
      if (m.value.from === sel.from && m.value.to === sel.to) current = total;
    }
    return { total, current, valid: true };
  };
  // CodeMirror's commands open its own search panel when the query is
  // invalid; the app's find bar replaces that panel, so skip instead.
  const run = (command: (v: TextView) => boolean) => {
    if (query().valid) command(view);
  };
  return {
    apply(options) {
      view.dispatch({ effects: setSearchQuery.of(new CmQuery(options)) });
      return info();
    },
    next: () => run(cmFindNext),
    prev: () => run(cmFindPrevious),
    replace: () => run(cmReplaceNext),
    replaceAll: () => run(cmReplaceAll),
    clear: () => view.dispatch({ effects: setSearchQuery.of(new CmQuery({ search: '' })) }),
    info,
    focus: () => view.focus(),
  };
}

/** Marks every text node between `from` and `to` carries. */
function sharedMarks(doc: PmNode, from: number, to: number): readonly Mark[] {
  let shared: readonly Mark[] | null = null;
  doc.nodesBetween(from, to, (node) => {
    if (!node.isText) return true;
    shared = shared ? shared.filter((m) => m.isInSet(node.marks)) : node.marks;
    return false;
  });
  return shared ?? [];
}

/**
 * prosemirror-search gives replacement text only the marks that continue
 * past the match's edges, so a mark that doesn't extend (inline code is
 * not inclusive) is lost when the match covers it to its end: `foo` → bar
 * dropped the backticks. Replacement text keeps every mark the whole match
 * had.
 */
class MarkKeepingQuery extends PmQuery {
  override getReplacements(
    state: EditorState,
    result: Parameters<PmQuery['getReplacements']>[1]
  ): ReturnType<PmQuery['getReplacements']> {
    const replacements = super.getReplacements(state, result);
    const marks = sharedMarks(state.doc, result.from, result.to);
    if (marks.length === 0) return replacements;
    const withMarks = (node: PmNode) =>
      node.isText ? node.mark(marks.reduce((set, m) => m.addToSet(set), node.marks)) : node;
    return replacements.map((r) => {
      const nodes: PmNode[] = [];
      r.insert.content.forEach((node) => {
        nodes.push(withMarks(node));
      });
      return {
        ...r,
        insert: new Slice(Fragment.fromArray(nodes), r.insert.openStart, r.insert.openEnd),
      };
    });
  }
}

function visualEngine(): Engine | null {
  const view = editors.visual;
  if (!view) return null;
  const query = () => getSearchState(view.state)?.query ?? new PmQuery({ search: '' });
  const info = (): MatchInfo => {
    const q = query();
    if (!q.valid) return { total: 0, current: 0, valid: q.search === '' };
    const { from, to } = view.state.selection;
    let total = 0;
    let current = 0;
    let pos = 0;
    for (
      let m = q.findNext(view.state, pos);
      m && total < MAX_COUNT;
      m = q.findNext(view.state, pos)
    ) {
      total++;
      if (m.from === from && m.to === to) current = total;
      pos = m.to > m.from ? m.to : m.to + 1;
    }
    return { total, current, valid: true };
  };
  const run = (command: typeof pmFindNext) => {
    if (query().valid) command(view.state, view.dispatch);
  };
  return {
    apply(options) {
      view.dispatch(setSearchState(view.state.tr, new MarkKeepingQuery(options)));
      return info();
    },
    next: () => run(pmFindNext),
    prev: () => run(pmFindPrev),
    replace: () => run(pmReplaceNext),
    replaceAll: () => run(pmReplaceAll),
    clear: () => view.dispatch(setSearchState(view.state.tr, new PmQuery({ search: '' }))),
    info,
    focus: () => view.focus(),
  };
}

/** The pane find acts on: the one in view, or in split view the one last worked in. */
export function findTarget(viewMode: 'split' | 'text' | 'visual'): FindTarget {
  if (viewMode === 'split') return editors.lastFocused;
  return viewMode;
}

export function engineFor(target: FindTarget): Engine | null {
  return target === 'text' ? textEngine() : visualEngine();
}
