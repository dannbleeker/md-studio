import type { Node as PmNode } from '@milkdown/kit/prose/model';
import { Decoration } from '@milkdown/kit/prose/view';
import { parseCallout } from '@/domain/callouts';

/**
 * Obsidian callouts for Read view. A blockquote that opens with `[!type]`
 * gets a coloured frame, its marker is hidden and the first line becomes its
 * title (the type's name when the author wrote none). Decorations only: the
 * marker stays in the document and in the file.
 */
export function calloutDecorations(doc: PmNode): Decoration[] {
  const out: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== 'blockquote') return true;
    const paragraph = node.firstChild;
    const text = paragraph?.type.name === 'paragraph' ? paragraph.firstChild : null;
    const callout = text?.isText ? parseCallout(text.text ?? '') : null;
    if (!callout) return true;
    out.push(
      Decoration.node(pos, pos + node.nodeSize, {
        class: `callout callout-${callout.kind}`,
        'data-callout-label': callout.label,
        ...(callout.title ? { 'data-callout-titled': '' } : {}),
      })
    );
    // The text starts after the blockquote's and the paragraph's opening tokens.
    const start = pos + 2;
    out.push(Decoration.inline(start, start + callout.hideLength, { class: 'callout-marker' }));
    if (callout.title)
      out.push(
        Decoration.inline(start + callout.hideLength, start + callout.titleEnd, {
          class: 'callout-title',
        })
      );
    return true;
  });
  return out;
}
