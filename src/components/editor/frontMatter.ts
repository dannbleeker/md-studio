import { chainCommands } from '@milkdown/kit/prose/commands';
import { isHistoryTransaction } from '@milkdown/kit/prose/history';
import { keydownHandler } from '@milkdown/kit/prose/keymap';
import type { Node } from '@milkdown/kit/prose/model';
import {
  type Command,
  type EditorState,
  Plugin,
  PluginKey,
  TextSelection,
  type Transaction,
} from '@milkdown/kit/prose/state';
import type { RemarkPlugin } from '@milkdown/kit/transformer';
import { $nodeSchema, $prose } from '@milkdown/kit/utils';
import remarkFrontmatter from 'remark-frontmatter';
import { frontMatterEnd } from '@/domain/frontMatter';
import { t } from '@/i18n';

/**
 * YAML front matter in the visual pane: one plain-text metadata block at
 * the top, edited as raw text like a code block. Without this, CommonMark
 * reads the opening `---` as a rule and the closing one as a setext
 * underline, so the metadata showed as a heading.
 *
 * `remark-frontmatter` adds both the parse and the serialize side, so a
 * `yaml` node round-trips as `---\n…\n---`.
 */
export const remarkFrontMatter: RemarkPlugin = {
  // Milkdown passes its options object along; the plugin's default (YAML
  // only) is what's wanted, so it gets none.
  plugin: function (this: ThisParameterType<typeof remarkFrontmatter>) {
    remarkFrontmatter.call(this);
    // Registered before the presets' plugins, so this runs before their
    // transformers and they see the re-parsed nodes too.
    return (tree, file) => {
      const processor = this as unknown as { parse: (md: string) => unknown };
      const parse = (md: string) => processor.parse(md) as MdRoot;
      pandocFrontMatter(tree as unknown as MdRoot, String(file.value), parse);
    };
  },
  options: {},
};

type MdNode = { type: string; value?: unknown; data?: Record<string, unknown> | undefined };
type MdRoot = { children: MdNode[] };

/**
 * `remark-frontmatter` closes front matter only at `---` and takes an
 * opening fence followed by a blank line too. The document follows
 * Pandoc's rules (`frontMatterEnd`), so the visual pane would otherwise
 * swallow body text into the metadata, or miss a block closed by `...`.
 * Where the two disagree, the tree is rebuilt: the front matter as the
 * rules read it, and the rest re-parsed as ordinary Markdown (after a line
 * break, so its first `---` can't open front matter again).
 */
function pandocFrontMatter(
  tree: MdRoot,
  source: string,
  parse: (markdown: string) => MdRoot
): void {
  const end = frontMatterEnd(source);
  const parsedAsYaml = tree.children[0]?.type === 'yaml';
  if (end < 0 && !parsedAsYaml) return;
  const closeStart = source.lastIndexOf('\n', end - 1) + 1;
  const byDots = end >= 0 && source[closeStart] === '.';
  if (end >= 0 && parsedAsYaml && !byDots) return;
  const body = parse(`\n${end < 0 ? source : source.slice(end + 1)}`).children;
  if (end < 0) {
    tree.children = body;
    return;
  }
  const value = source.slice(source.indexOf('\n') + 1, closeStart).replace(/\r?\n$/, '');
  tree.children = [{ type: 'yaml', value, data: { close: byDots ? '...' : '---' } }, ...body];
}

const NAME = 'front_matter';

export const frontMatterSchema = $nodeSchema(NAME, () => ({
  content: 'text*',
  group: 'block',
  // The closing fence as written: `...` (Pandoc) or `---`.
  attrs: { close: { default: '---' } },
  marks: '',
  code: true,
  defining: true,
  // No parseDOM: a copied block pastes as an ordinary code block, never as
  // front matter in the middle of the document.
  toDOM: () => [
    'pre',
    { class: 'front-matter', 'data-label': t('pane.frontMatter'), spellcheck: 'false' },
    ['code', 0],
  ],
  parseMarkdown: {
    match: ({ type }) => type === 'yaml',
    runner: (state, node, type) => {
      const close = (node.data as { close?: unknown } | undefined)?.close;
      state.openNode(type, { close: close === '...' ? '...' : '---' });
      if (typeof node.value === 'string' && node.value) state.addText(node.value);
      state.closeNode();
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === NAME,
    runner: (state, node) => {
      const text = node.textContent;
      // The `yaml` serializer always closes with `---`; written out raw,
      // a block closed by `...` keeps its fence.
      if (node.attrs.close === '...')
        state.addNode('html', undefined, `---\n${text ? `${text}\n` : ''}...`);
      else state.addNode('yaml', undefined, text);
    },
  },
}));

/** A line that would close the block early when written out: no escape exists for it. */
const FENCE_LINE = /^(?:---|\.\.\.)[ \t]*$/m;
const converted = new PluginKey('frontMatterConverted');

/**
 * Front matter only means anything as the document's first block; anywhere
 * else it would be written out as `---` lines that read back as a rule and
 * a heading. A block moved or pasted there becomes a YAML code block, and
 * so does one given a `---` or `...` line of its own (typed or pasted), so
 * the pane shows what the Markdown will mean.
 */
const keepAtStart = $prose(
  () =>
    new Plugin({
      appendTransaction: (trs, _old, state) => {
        if (!trs.some((tr) => tr.docChanged)) return null;
        const type = state.schema.nodes[NAME];
        const code = state.schema.nodes.code_block;
        if (!type || !code) return null;
        const tr = state.tr;
        state.doc.descendants((node, pos, parent, index) => {
          if (node.type !== type) return !node.isTextblock;
          const atStart = parent === state.doc && index === 0;
          if (!atStart || FENCE_LINE.test(node.textContent)) {
            tr.setNodeMarkup(pos, code, { language: 'yaml' });
          }
          return false;
        });
        return tr.docChanged ? tr.setMeta(converted, true) : null;
      },
    })
);

/** The document's front matter block, as [start, end] positions, or null. */
function frontMatterRange(doc: Node): [number, number] | null {
  const first = doc.firstChild;
  return first?.type.name === NAME ? [0, first.nodeSize] : null;
}

/** Whether the selection starts inside the front matter (select-all doesn't). */
export function selectionInFrontMatter(state: EditorState): boolean {
  const range = frontMatterRange(state.doc);
  const { from } = state.selection;
  return range !== null && from > range[0] && from < range[1];
}

/**
 * Commands meant for the body must not take the front matter apart. A
 * user edit is refused when the block it started with no longer stands
 * whole as the first block: wrapped (a quote, a list), split (a rule or a
 * table inserted inside), turned into another block type, or joined with
 * the paragraph after it. Removing it entirely is fine, as is the sync
 * from the text pane (`addToHistory: false`).
 */
function keepsFrontMatter(tr: Transaction, state: EditorState): boolean {
  // Undo and redo restore states that were already allowed.
  const exempt =
    tr.getMeta('addToHistory') === false || tr.getMeta(converted) || isHistoryTransaction(tr);
  if (!tr.docChanged || exempt) return true;
  const range = frontMatterRange(state.doc);
  if (!range) return true;
  const start = tr.mapping.map(range[0], 1);
  const end = tr.mapping.map(range[1], -1);
  if (end <= start) return true;
  const first = tr.doc.firstChild;
  return start === 0 && first?.type.name === NAME && first.nodeSize === end;
}

/**
 * Replacing a selection that runs from inside the front matter into the
 * body would join the two, pulling body text into the metadata. Each side
 * loses its selected part instead, and the typed text goes where the
 * selection started.
 */
function replaceAcross(state: EditorState, text: string): Transaction | null {
  const range = frontMatterRange(state.doc);
  const { from, to } = state.selection;
  if (!range || from <= range[0] || from >= range[1] || to <= range[1]) return null;
  const tr = state.tr.replace(range[1], to);
  tr.delete(from, range[1] - 1);
  if (text) tr.insertText(text, from);
  return tr.setSelection(TextSelection.create(tr.doc, from + text.length)).scrollIntoView();
}

const deleteAcross: Command = (state, dispatch) => {
  const tr = replaceAcross(state, '');
  if (!tr) return false;
  dispatch?.(tr);
  return true;
};

/**
 * Backspace at the start of the block after the front matter would select
 * the block (and a second press delete it); it does nothing there.
 */
const stopAtFrontMatter: Command = (state) => {
  const { $from, empty } = state.selection;
  return (
    empty &&
    $from.depth === 1 &&
    $from.parentOffset === 0 &&
    $from.index(0) === 1 &&
    state.doc.firstChild?.type.name === NAME
  );
};

/** Backspace in empty front matter removes the block. */
const removeWhenEmpty: Command = (state, dispatch) => {
  const { $from, empty } = state.selection;
  const block = $from.parent;
  if (!empty || block.type.name !== NAME || block.content.size > 0) return false;
  dispatch?.(state.tr.delete($from.before(), $from.after()).scrollIntoView());
  return true;
};

const guard = $prose(
  () =>
    new Plugin({
      filterTransaction: keepsFrontMatter,
      props: {
        // Ahead of the base keymap, whose Backspace would select the block.
        handleKeyDown: keydownHandler({
          Backspace: chainCommands(deleteAcross, stopAtFrontMatter, removeWhenEmpty),
          Delete: deleteAcross,
          'Mod-Backspace': deleteAcross,
          'Mod-Delete': deleteAcross,
        }),
        handleTextInput: (view, _from, _to, text) => {
          const tr = replaceAcross(view.state, text);
          if (tr) view.dispatch(tr);
          return tr !== null;
        },
        // A paste lands where the selection starts, in the metadata, which
        // is plain text: the slice's text, split across like typing.
        handlePaste: (view, _event, slice) => {
          const tr = replaceAcross(
            view.state,
            slice.content.textBetween(0, slice.content.size, '\n')
          );
          if (tr) view.dispatch(tr);
          return tr !== null;
        },
        handleDOMEvents: {
          // An IME replaces the selection with what it composes, an edit the
          // filter would refuse (losing the input). Removing the selected
          // parts first lets it compose at a plain cursor in the block.
          compositionstart: (view) => {
            const tr = replaceAcross(view.state, '');
            if (tr) view.dispatch(tr);
            return false;
          },
        },
      },
    })
);

export const frontMatter = [frontMatterSchema, keepAtStart, guard].flat();
