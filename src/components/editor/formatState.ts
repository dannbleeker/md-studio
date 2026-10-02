import type { EditorState } from '@milkdown/kit/prose/state';
import { type FormatState, useUiStore } from '@/store/ui';

/**
 * Publishes what the visual pane's selection is formatted with, so the
 * format toolbar can show its buttons pressed. Marks count when they cover
 * the whole selection (or, for a cursor, apply to what's typed next).
 */
export function reportFormat(state: EditorState): void {
  const { from, to, empty, $from } = state.selection;
  const schema = state.schema;
  const has = (name: string) => {
    const type = schema.marks[name];
    if (!type) return false;
    if (empty) return !!type.isInSet(state.storedMarks ?? $from.marks());
    let all = true;
    state.doc.nodesBetween(from, to, (node) => {
      if (node.isText && !type.isInSet(node.marks)) all = false;
    });
    return all;
  };
  const linkMark = schema.marks.link?.isInSet(
    empty ? $from.marks() : state.doc.resolve(from + 1).marks()
  );
  const parent = $from.parent;
  const block =
    parent.type.name === 'heading'
      ? Number(parent.attrs.level)
      : parent.type.name === 'paragraph'
        ? 0
        : -1;

  const next: FormatState = {
    strong: has('strong'),
    emphasis: has('emphasis'),
    strike: has('strike_through'),
    code: has('inlineCode'),
    link: linkMark ? String(linkMark.attrs.href ?? '') : null,
    block,
  };
  const prev = useUiStore.getState().format;
  if ((Object.keys(next) as (keyof FormatState)[]).some((k) => next[k] !== prev[k])) {
    useUiStore.setState({ format: next });
  }
}
