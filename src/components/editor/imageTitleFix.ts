import type { RemarkPlugin } from '@milkdown/kit/transformer';

type MdNode = { type: string; title?: string | null; children?: MdNode[] };

/**
 * Milkdown hands remark's `title: null` (an image with no title, i.e. most
 * of them) straight to ProseMirror, whose attribute validation then throws
 * "Expected value of type string for attribute title on type image" and
 * the visual pane stops rendering. Normalising to '' fixes it; the Markdown
 * serializer omits empty titles, so the source is unchanged.
 */
export const imageTitleFix: RemarkPlugin = {
  plugin: () => (tree) => {
    const visit = (node: MdNode) => {
      if (node.type === 'image' && node.title == null) node.title = '';
      for (const child of node.children ?? []) visit(child);
    };
    visit(tree as unknown as MdNode);
  },
  options: {},
};
