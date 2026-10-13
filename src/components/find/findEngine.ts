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
import { EditorState } from '@milkdown/kit/prose/state';
import {
  getSearchState,
  SearchQuery as PmQuery,
  findNext as pmFindNext,
  findPrev as pmFindPrev,
  replaceAll as pmReplaceAll,
  replaceNext as pmReplaceNext,
  type SearchResult,
  setSearchState,
} from 'prosemirror-search';
import { EMBED_NODE_NAME, parseWikiRef } from '@/domain/embeds';
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

/** An embed or wikilink atom the query matches inside: its text is not in the document's text. */
type TokenHit = { node: PmNode; pos: number };

/**
 * prosemirror-search sees an atom as one placeholder character, so a file
 * name or note title that only appears inside a token could not be found,
 * counted or replaced here although the text pane finds it. This query also
 * matches the token's source text and reports the whole atom as the match;
 * replacing rewrites the token (when the result is still one valid token).
 * A match found this way is looked up in `tokenHits` by its result object.
 *
 * It also fixes a mark loss: prosemirror-search gives replacement text only
 * the marks that continue past the match's edges, so a mark that doesn't
 * extend (inline code is not inclusive) is lost when the match covers it to
 * its end: `foo` → bar dropped the backticks. Replacement text keeps every
 * mark the whole match had.
 */
class VisualQuery extends PmQuery {
  private readonly tokenHits = new WeakMap<SearchResult, TokenHit>();
  private tokenCache: { doc: PmNode; hits: SearchResult[] } | null = null;

  /** The text of `raw` as a one-paragraph document, so the library's own matching applies to it. */
  private rawState(state: EditorState, raw: string): EditorState | null {
    const { schema } = state;
    const paragraph = schema.nodes.paragraph;
    const doc =
      paragraph && schema.topNodeType.createAndFill(null, paragraph.create(null, schema.text(raw)));
    return doc ? EditorState.create({ doc }) : null;
  }

  private tokens(state: EditorState): SearchResult[] {
    if (this.tokenCache?.doc === state.doc) return this.tokenCache.hits;
    const hits: SearchResult[] = [];
    state.doc.descendants((node, pos) => {
      if (node.type.name !== EMBED_NODE_NAME) return true;
      const raw = String(node.attrs.raw ?? '');
      const temp = raw ? this.rawState(state, raw) : null;
      if (temp && super.findNext(temp, 0)) {
        const hit = { from: pos, to: pos + node.nodeSize, match: null, matchStart: pos };
        this.tokenHits.set(hit, { node, pos });
        hits.push(hit);
      }
      return false;
    });
    this.tokenCache = { doc: state.doc, hits };
    return hits;
  }

  override findNext(state: EditorState, from = 0, to = state.doc.content.size) {
    const text = super.findNext(state, from, to);
    if (!this.valid) return text;
    const token = this.tokens(state).find((h) => h.from >= from && h.to <= to);
    return token && (!text || token.from < text.from) ? token : text;
  }

  override findPrev(state: EditorState, from = state.doc.content.size, to = 0) {
    const text = super.findPrev(state, from, to);
    if (!this.valid) return text;
    let token: SearchResult | undefined;
    for (const h of this.tokens(state)) if (h.to <= from && h.from >= to) token = h;
    return token && (!text || token.from > text.from) ? token : text;
  }

  /** The token with every match inside it replaced, or null when that is no longer one token. */
  private rewritten(state: EditorState, raw: string): string | null {
    const temp = this.rawState(state, raw);
    if (!temp) return null;
    const matches: SearchResult[] = [];
    for (let pos = 0; ; ) {
      const next = super.findNext(temp, pos, temp.doc.content.size);
      if (!next) break;
      if (next.to > pos || matches.length === 0) matches.push(next);
      pos = Math.max(next.to, pos + 1);
    }
    const tr = temp.tr;
    for (const match of matches.reverse()) {
      const ranges = super.getReplacements(temp, match);
      for (let i = ranges.length - 1; i >= 0; i--) {
        const r = ranges[i];
        if (r) tr.replace(r.from, r.to, r.insert);
      }
    }
    const next = tr.doc.textContent;
    return next !== raw && parseWikiRef(next)?.raw === next ? next : null;
  }

  override getReplacements(
    state: EditorState,
    result: SearchResult
  ): ReturnType<PmQuery['getReplacements']> {
    const token = this.tokenHits.get(result);
    if (token) {
      const next = this.rewritten(state, String(token.node.attrs.raw ?? ''));
      if (next === null) return [];
      const node = token.node.type.create({ raw: next }, null, token.node.marks);
      return [{ from: result.from, to: result.to, insert: new Slice(Fragment.from(node), 0, 0) }];
    }
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
      view.dispatch(setSearchState(view.state.tr, new VisualQuery(options)));
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
