import { describe, expect, it } from 'vitest';
import { headingSlug, linkTarget } from './linkTarget';

describe('linkTarget', () => {
  it('opens web, mail and phone links outside the app', () => {
    expect(linkTarget('https://example.com/a')).toEqual({
      kind: 'external',
      url: 'https://example.com/a',
    });
    expect(linkTarget('mailto:a@b.dk').kind).toBe('external');
    expect(linkTarget('tel:+4512345678').kind).toBe('external');
  });

  it('scrolls to heading anchors', () => {
    expect(linkTarget('#my-heading')).toEqual({ kind: 'anchor', slug: 'my-heading' });
    expect(linkTarget('#s%C3%A5dan')).toEqual({ kind: 'anchor', slug: 'sådan' });
    expect(linkTarget('#bad%')).toEqual({ kind: 'anchor', slug: 'bad%' });
  });

  it('ignores everything else', () => {
    for (const href of ['javascript:alert(1)', 'data:text/html,x', 'notes/other.md', '#', ''])
      expect(linkTarget(href)).toEqual({ kind: 'none' });
  });
});

describe('headingSlug', () => {
  it('matches the GitHub form', () => {
    expect(headingSlug('Hello, World!')).toBe('hello-world');
    expect(headingSlug('  Sådan gør du  ')).toBe('sådan-gør-du');
    expect(headingSlug('a_b - c')).toBe('a_b---c');
  });
});
