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

/**
 * Full parse; replaces only the top-level blocks that differ, compared with
 * `same` (ProseMirror's own diff would count Milkdown's generated heading
 * ids, treat every heading as changed and replace everything after it,
 * taking the undo history and selection of untouched blocks with it).
 */
export function applyFull(editor: Editor, markdown: string): void {
  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    const next = ctx.get(parserCtx)(markdown);
    if (!next) return;
    const current = view.state.doc;
    const cur = current.childCount;
    const nxt = next.childCount;
    let head = 0;
    while (head < cur && head < nxt && same(current.child(head), next.child(head))) head++;
    if (head === cur && head === nxt) return;
    let tail = 0;
    while (
      tail < cur - head &&
      tail < nxt - head &&
      same(current.child(cur - 1 - tail), next.child(nxt - 1 - tail))
    )
      tail++;
    let from = 0;
    for (let i = 0; i < head; i++) from += current.child(i).nodeSize;
    let to = from;
    for (let i = head; i < cur - tail; i++) to += current.child(i).nodeSize;
    const nodes: Node[] = [];
    for (let i = head; i < nxt - tail; i++) nodes.push(next.child(i));
    view.dispatch(view.state.tr.replaceWith(from, to, nodes).setMeta('addToHistory', false));
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

/**
 * Index of the run of top-level nodes equal to `run`, or -1 when it isn't
 * there or appears more than once. A repeated run (the same short blocks
 * in several places) can't be located safely: picking the wrong copy would
 * put the edit in the wrong place, so the caller falls back to a full parse.
 */
function findRun(doc: Node, run: Node[]): number {
  const last = doc.childCount - run.length;
  if (last < 0 || run.length === 0) return -1;
  let found = -1;
  for (let at = 0; at <= last; at++) {
    if (!run.every((node, j) => same(doc.child(at + j), node))) continue;
    if (found >= 0) return -1;
    found = at;
  }
  return found;
}

/** A link reference definition (`[id]: url`) or footnote syntax: both act at a distance. */
const DEFINITION = /^ {0,3}\[[^\]]+\]:/m;
const actsAtDistance = (markdown: string) => DEFINITION.test(markdown) || markdown.includes('[^');

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
  // A definition changes how text far away renders, and a reference only
  // resolves against definitions elsewhere: parsing the region alone would
  // get either wrong.
  if (actsAtDistance(region.oldText) || actsAtDistance(region.newText)) return false;
  if (DEFINITION.test(newMd) && /\[[^\]]*\]/.test(region.newText)) return false;
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
    const at = findRun(doc, oldNodes);
    if (at < 0) return false;
    // Leave the unchanged context blocks in place: replacing them too would
    // drop the visual pane's undo history and selection inside them.
    const skipStart = region.leadingContext ? 1 : 0;
    const skipEnd = region.trailingContext ? 1 : 0;
    const replaceOld = oldNodes.length - skipStart - skipEnd;
    const replacement = newNodes.slice(skipStart, newNodes.length - skipEnd);
    if (replaceOld < 0 || replacement.length < 0) return false;
    let from = 0;
    for (let i = 0; i < at + skipStart; i++) from += doc.child(i).nodeSize;
    let to = from;
    for (let j = 0; j < replaceOld; j++) to += doc.child(at + skipStart + j).nodeSize;
    view.dispatch(view.state.tr.replaceWith(from, to, replacement).setMeta('addToHistory', false));
    return true;
  });
}
