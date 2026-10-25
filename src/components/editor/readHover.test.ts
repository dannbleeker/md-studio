import type { EditorView } from '@milkdown/kit/prose/view';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetStoreForTest, useStore } from '@/store';
import { readHover, showFor } from './readHover';
import { hidePopover } from './readPopover';

const handlers = readHover.props.handleDOMEvents as Required<
  NonNullable<typeof readHover.props.handleDOMEvents>
>;

/** A Read view page with one footnote reference and its definition. */
function page() {
  const dom = document.createElement('div');
  dom.innerHTML =
    '<p>Text<sup data-type="footnote_reference" data-label="1">1</sup></p>' +
    '<dl data-type="footnote_definition" data-label="1"><dd>The footnote.</dd></dl>';
  document.body.append(dom);
  const ref = dom.querySelector('sup') as Element;
  return { view: { dom } as unknown as EditorView, ref };
}

const over = (view: EditorView, target: Element) =>
  handlers.mouseover.call(readHover, view, { target } as unknown as MouseEvent);
const out = (view: EditorView, target: Element) =>
  handlers.mouseout.call(readHover, view, { target } as unknown as MouseEvent);
const card = () => document.getElementById('read-popover');

describe('Read view hover cards', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetStoreForTest();
    useStore.setState({ viewMode: 'read' });
  });
  afterEach(() => {
    hidePopover();
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('show a footnote on hover and go when the pointer leaves', () => {
    const { view, ref } = page();
    over(view, ref);
    vi.advanceTimersByTime(200);
    expect(card()?.textContent).toBe('The footnote.');
    out(view, ref);
    vi.advanceTimersByTime(300);
    expect(card()).toBeNull();
  });

  it('stay when the pointer goes from the card back to its anchor', () => {
    const { view, ref } = page();
    over(view, ref);
    vi.advanceTimersByTime(200);
    card()?.dispatchEvent(new Event('pointerenter'));
    card()?.dispatchEvent(new Event('pointerleave'));
    over(view, ref);
    vi.advanceTimersByTime(300);
    expect(card()).not.toBeNull();
  });

  it('do not come back after the pointer left, when a click came in between', () => {
    const { view, ref } = page();
    over(view, ref);
    // A click within the hover delay shows the card at once (as a tap would).
    showFor(view, ref, 0);
    vi.advanceTimersByTime(0);
    out(view, ref);
    vi.advanceTimersByTime(300);
    expect(card()).toBeNull();
  });
});
