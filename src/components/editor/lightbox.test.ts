import { afterEach, describe, expect, it } from 'vitest';
import { openLightbox } from './lightbox';

const key = (init: KeyboardEventInit) => {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  (document.activeElement ?? document.body).dispatchEvent(event);
  return event;
};

describe('the image lightbox', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('opens over the page with focus on its close button, and Escape returns it', () => {
    document.body.innerHTML = '<button id="opener">image</button>';
    const opener = document.getElementById('opener') as HTMLButtonElement;
    opener.focus();
    openLightbox('blob:x', 'A cat');
    expect(document.querySelector('.lightbox')?.getAttribute('aria-label')).toBe('A cat');
    expect(document.activeElement?.className).toBe('lightbox-close');
    expect(key({ key: 'Escape' }).defaultPrevented).toBe(true);
    expect(document.querySelector('.lightbox')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('keeps Tab inside, as a modal must', () => {
    document.body.innerHTML = '<button id="behind">toolbar</button>';
    openLightbox('blob:x', '');
    expect(key({ key: 'Tab' }).defaultPrevented).toBe(true);
    expect(key({ key: 'Tab', shiftKey: true }).defaultPrevented).toBe(true);
    expect(document.activeElement?.className).toBe('lightbox-close');
  });
});
