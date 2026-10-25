import type { Node as PmNode } from '@milkdown/kit/prose/model';
import { Decoration } from '@milkdown/kit/prose/view';
import { type FrontMatterCard, parseFrontMatterCard } from '@/domain/frontMatterCard';
import { textHash } from '@/domain/textHash';

const el = (tag: string, className: string, text?: string): HTMLElement => {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

/** The card's DOM. Only textContent is used, so nothing in the YAML can become markup. */
function cardElement(card: FrontMatterCard): HTMLElement {
  const root = el('aside', 'read-card');
  root.contentEditable = 'false';
  if (card.title) root.append(el('div', 'read-card-title', card.title));
  if (card.tags.length > 0) {
    const tags = el('div', 'read-card-tags');
    for (const tag of card.tags) tags.append(el('span', 'read-tag', `#${tag}`));
    root.append(tags);
  }
  if (card.fields.length > 0) {
    const list = el('dl', 'read-card-fields');
    for (const { key, value } of card.fields) {
      list.append(el('dt', 'read-card-key', key), el('dd', 'read-card-value', value));
    }
    root.append(list);
  }
  return root;
}

/**
 * Read view shows the front matter block as a card (title, tags, fields)
 * instead of raw YAML. The raw block is hidden, not removed, so nothing
 * changes in the document. A block with nothing to show stays as it is.
 */
export function frontMatterDecorations(node: PmNode, pos: number): Decoration[] {
  const card = parseFrontMatterCard(node.textContent);
  if (!card) return [];
  return [
    Decoration.node(pos, pos + node.nodeSize, { class: 'read-folded' }),
    Decoration.widget(pos, () => cardElement(card), {
      side: -1,
      key: `card-${textHash(node.textContent)}`,
      ignoreSelection: true,
    }),
  ];
}
