import { keymap } from '@milkdown/kit/prose/keymap';
import { Plugin } from '@milkdown/kit/prose/state';
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
