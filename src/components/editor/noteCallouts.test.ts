import { describe, expect, it } from 'vitest';
import { calloutize } from './noteCallouts';

const render = (html: string): HTMLElement => {
  const root = document.createElement('div');
  root.innerHTML = html;
  calloutize(root);
  return root;
};

describe('calloutize', () => {
  it('frames a titled callout and turns its first line into the title', () => {
    const root = render(
      '<blockquote><p>[!warning] Careful<span> </span>Body text</p></blockquote>'
    );
    const quote = root.querySelector('blockquote');
    expect(quote?.className).toBe('callout callout-warning');
    expect(quote?.getAttribute('data-callout-label')).toBe('Warning');
    expect(quote?.hasAttribute('data-callout-titled')).toBe(true);
    expect(root.querySelector('.callout-title')?.textContent).toBe('Careful');
    expect(root.querySelector('p')?.textContent).toBe('CarefulBody text');
  });

  it('shows the type as the title when the author wrote none', () => {
    const root = render('<blockquote><p>[!note]<span> </span>Bare</p></blockquote>');
    const quote = root.querySelector('blockquote');
    expect(quote?.className).toBe('callout callout-note');
    expect(quote?.hasAttribute('data-callout-titled')).toBe(false);
    expect(root.querySelector('p')?.textContent).toBe('Bare');
  });

  it('knows unfold marks and unknown types', () => {
    const root = render('<blockquote><p>[!custom]- Hidden</p></blockquote>');
    expect(root.querySelector('blockquote')?.className).toBe('callout callout-note');
    expect(root.querySelector('.callout-title')?.textContent).toBe('Hidden');
  });

  it('leaves an ordinary quote and a marker in the middle alone', () => {
    const html =
      '<blockquote><p>plain</p></blockquote><blockquote><p>see [!note] here</p></blockquote>';
    const root = render(html);
    expect(root.innerHTML).toBe(html);
  });

  it('frames a callout inside a list or another quote', () => {
    const root = render(
      '<blockquote><p>outer</p><blockquote><p>[!tip] Inner</p></blockquote></blockquote>'
    );
    expect(root.querySelectorAll('.callout-tip').length).toBe(1);
  });
});
