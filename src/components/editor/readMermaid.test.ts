import { afterEach, describe, expect, it, vi } from 'vitest';
import { onPageThemeChange } from './readMermaid';

describe('onPageThemeChange', () => {
  afterEach(() => {
    document.documentElement.removeAttribute('data-theme');
    document.body.innerHTML = '';
  });

  it('fires when the theme or the reading theme changes, and stops when told', async () => {
    document.body.innerHTML = '<div class="split" data-read-theme="default"></div>';
    const redraw = vi.fn();
    const stop = onPageThemeChange(redraw);
    document.documentElement.setAttribute('data-theme', 'dark');
    await vi.waitFor(() => expect(redraw).toHaveBeenCalledTimes(1));
    document.querySelector('.split')?.setAttribute('data-read-theme', 'sepia');
    await vi.waitFor(() => expect(redraw).toHaveBeenCalledTimes(2));
    // Other attributes are none of its business.
    document.querySelector('.split')?.setAttribute('data-view', 'read');
    stop();
    document.documentElement.setAttribute('data-theme', 'light');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(redraw).toHaveBeenCalledTimes(2);
  });
});
