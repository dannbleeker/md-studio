import { keymap } from '@milkdown/kit/prose/keymap';
import { Plugin } from '@milkdown/kit/prose/state';
import type { RemarkPlugin } from '@milkdown/kit/transformer';
import { $nodeSchema, $prose } from '@milkdown/kit/utils';
import remarkFrontmatter from 'remark-frontmatter';
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
  },
  options: {},
};

const NAME = 'front_matter';

export const frontMatterSchema = $nodeSchema(NAME, () => ({
  content: 'text*',
  group: 'block',
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
      state.openNode(type);
      if (typeof node.value === 'string' && node.value) state.addText(node.value);
      state.closeNode();
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === NAME,
    runner: (state, node) => {
      state.addNode('yaml', undefined, node.textContent);
    },
  },
}));

/**
 * Front matter only means anything as the document's first block; anywhere
 * else it would be written out as `---` lines that read back as a rule and
 * a heading. A block moved or pasted there becomes a YAML code block.
 */
const keepAtStart = $prose(
  () =>
    new Plugin({
      appendTransaction: (trs, _old, state) => {
        if (!trs.some((tr) => tr.docChanged)) return null;
        const type = state.schema.nodes[NAME];
        const code = state.schema.nodes.code_block;
        if (!type || !code) return null;
        let tr = state.tr;
        state.doc.forEach((node, offset, index) => {
          if (index > 0 && node.type === type) {
            tr = tr.setNodeMarkup(offset, code, { language: 'yaml' });
          }
        });
        return tr.docChanged ? tr : null;
      },
    })
);

/** Backspace in empty front matter removes the block. */
const removeWhenEmpty = $prose(() =>
  keymap({
    Backspace: (state, dispatch) => {
      const { $from, empty } = state.selection;
      const block = $from.parent;
      if (!empty || block.type.name !== NAME || block.content.size > 0) return false;
      dispatch?.(state.tr.delete($from.before(), $from.after()).scrollIntoView());
      return true;
    },
  })
);

export const frontMatter = [frontMatterSchema, keepAtStart, removeWhenEmpty].flat();
