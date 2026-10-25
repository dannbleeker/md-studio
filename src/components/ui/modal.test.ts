import { afterEach, describe, expect, it } from 'vitest';
import { modalOpen } from './modal';

describe('modalOpen', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('sees an open dialog and the lightbox overlay', () => {
    expect(modalOpen()).toBe(false);
    document.body.innerHTML = '<dialog open></dialog>';
    expect(modalOpen()).toBe(true);
    document.body.innerHTML = '<div role="dialog" aria-modal="true"></div>';
    expect(modalOpen()).toBe(true);
  });

  it('ignores a closed dialog, whatever its attributes', () => {
    document.body.innerHTML = '<dialog></dialog><dialog aria-modal="true"></dialog>';
    expect(modalOpen()).toBe(false);
  });
});
