import { parseCallout } from '@/domain/callouts';

/** A line break inside a paragraph comes out of the serializer as a span holding one space. */
const isBreak = (node: Node | null): boolean =>
  node instanceof Element &&
  node.localName === 'span' &&
  node.childElementCount === 0 &&
  /^\s*$/.test(node.textContent ?? '');

/**
 * Obsidian callouts inside a transcluded note. The note is rendered to
 * plain DOM, so the Read view's decorations do not reach it: a quote that
 * opens with `[!type]` gets the same frame and classes here, with the marker
 * taken out and the rest of its first line made the title. Works on the
 * note's own copy of the DOM; the file is never touched.
 */
export function calloutize(root: ParentNode): void {
  for (const quote of Array.from(root.querySelectorAll('blockquote'))) {
    const first = quote.firstElementChild;
    const text = first?.localName === 'p' ? first.firstChild : null;
    const callout = text?.nodeType === Node.TEXT_NODE ? parseCallout(text.nodeValue ?? '') : null;
    if (!first || !text || !callout) continue;
    quote.classList.add('callout', `callout-${callout.kind}`);
    quote.setAttribute('data-callout-label', callout.label);
    const next = text.nextSibling;
    if (callout.title) {
      quote.setAttribute('data-callout-titled', '');
      const title = quote.ownerDocument.createElement('span');
      title.className = 'callout-title';
      title.textContent = callout.title;
      text.replaceWith(title);
    } else {
      text.remove();
    }
    if (isBreak(next)) next?.remove();
  }
}
