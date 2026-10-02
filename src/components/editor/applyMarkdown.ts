import { type Editor, editorViewCtx, parserCtx } from '@milkdown/kit/core';
import { Mark, type Node } from '@milkdown/kit/prose/model';
import { changedRegion } from '@/domain/changedRegion';

/**
 * Bringing the visual pane up to date with new Markdown.
 *
 * A full parse of a 3,000-line document takes ~250 ms on the main thread,
 * and running it after every short typing pause made typing in the text
 * pane stutter. `applyIncremental` re-parses only the changed blocks (plus
 * one neighbour each side for context) and swaps just those top-level
 * nodes; `applyFull` is the always-correct path it falls back to.
 *
 * Both dispatch with `addToHistory: false`: the other pane's edits stay
 * out of this pane's undo stack, and Milkdown's listener skips such
 * transactions, so nothing echoes back to the text pane.
 */

/** Full parse; replaces only the top-level range that differs, so selection and scroll stay put. */
export function applyFull(editor: Editor, markdown: string): void {
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

/**
 * Node equality that ignores generated attributes: Milkdown fills heading
 * `id`s in a later transaction, so a freshly parsed heading has `id: ""`
 * while the same heading in the live document has `id: "section-22"`.
 */
function same(a: Node, b: Node): boolean {
  if (a === b) return true;
  if (a.type !== b.type || !Mark.sameSet(a.marks, b.marks)) return false;
  for (const key of new Set([...Object.keys(a.attrs), ...Object.keys(b.attrs)])) {
    if (key !== 'id' && a.attrs[key] !== b.attrs[key]) return false;
  }
  if (a.isText) return a.text === b.text;
  if (a.childCount !== b.childCount) return false;
  for (let i = 0; i < a.childCount; i++) if (!same(a.child(i), b.child(i))) return false;
  return true;
}

const children = (node: Node): Node[] => {
  const out: Node[] = [];
  node.forEach((child) => {
    out.push(child);
  });
  return out;
};

/** Index of the run of top-level nodes equal to `run`, searching outward from the expected spot. */
function findRun(doc: Node, run: Node[], position: number): number {
  const last = doc.childCount - run.length;
  if (last < 0 || run.length === 0) return -1;
  const expected = Math.min(last, Math.max(0, Math.round(position * doc.childCount)));
  const matches = (at: number) => run.every((node, j) => same(doc.child(at + j), node));
  for (let d = 0; d <= last; d++) {
    if (expected - d >= 0 && matches(expected - d)) return expected - d;
    if (d > 0 && expected + d <= last && matches(expected + d)) return expected + d;
    if (expected - d < 0 && expected + d > last) break;
  }
  return -1;
}

/**
 * Applies only the changed region. Returns false (having changed nothing)
 * whenever it can't be sure the result equals a full parse: the region is
 * large, the context blocks parse differently on their own (loose lists,
 * footnotes, reference links), or the old nodes can't be located.
 */
export function applyIncremental(editor: Editor, oldMd: string, newMd: string): boolean {
  const region = changedRegion(oldMd, newMd);
  if (!region) return true;
  if (region.share > 0.5 || !region.oldText || !region.newText) return false;
  return editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    const parse = ctx.get(parserCtx);
    const oldDoc = parse(region.oldText);
    const newDoc = parse(region.newText);
    if (!oldDoc || !newDoc) return false;
    const oldNodes = children(oldDoc);
    const newNodes = children(newDoc);
    if (newNodes.length === 0) return false;
    // The context blocks must parse the same on both sides, or the edit
    // reaches beyond the region (e.g. it turned a paragraph into a list
    // item that now merges with its neighbour).
    if (region.leadingContext && !same(newNodes[0]!, oldNodes[0]!)) return false;
    if (region.trailingContext && !same(newNodes.at(-1)!, oldNodes.at(-1)!)) return false;

    const doc = view.state.doc;
    const at = findRun(doc, oldNodes, region.position);
    if (at < 0) return false;
    let from = 0;
    for (let i = 0; i < at; i++) from += doc.child(i).nodeSize;
    let to = from;
    for (let j = 0; j < oldNodes.length; j++) to += doc.child(at + j).nodeSize;
    view.dispatch(view.state.tr.replaceWith(from, to, newNodes).setMeta('addToHistory', false));
    return true;
  });
}
