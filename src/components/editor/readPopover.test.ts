import { afterEach, describe, expect, it } from 'vitest';
import { hidePopover, popoverAnchor, showPopover } from './readPopover';

const pressEscape = () => {
  const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
  document.body.dispatchEvent(event);
  return event;
};

describe('the Read view popover', () => {
  afterEach(() => {
    hidePopover();
    document.body.innerHTML = '';
  });

  it('shows plain text by its anchor and describes it', () => {
    const link = document.createElement('a');
    document.body.append(link);
    showPopover(link, '<b>Title</b>', 'Body');
    const card = document.getElementById('read-popover');
    expect(card?.textContent).toBe('<b>Title</b>Body');
    expect(card?.querySelector('b')).toBeNull();
    expect(link.getAttribute('aria-describedby')).toBe('read-popover');
    expect(popoverAnchor()).toBe(link);
  });

  it('closes on Escape and claims it, so focus mode stays on', () => {
    const link = document.createElement('a');
    document.body.append(link);
    showPopover(link, null, 'Body');
    expect(pressEscape().defaultPrevented).toBe(true);
    expect(document.getElementById('read-popover')).toBeNull();
    expect(link.hasAttribute('aria-describedby')).toBe(false);
    // With no card showing, Escape is not its to take.
    expect(pressEscape().defaultPrevented).toBe(false);
  });
});
