import { describe, expect, it } from 'vitest';
import { headingLink, headingSlug, linkTarget, wikilinkTarget } from './linkTarget';

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

  it('opens relative Markdown notes, with the heading they name', () => {
    expect(linkTarget('other.md')).toEqual({
      kind: 'note',
      path: 'other.md',
      fragment: null,
      markdown: true,
    });
    expect(linkTarget('../notes/My%20Note.md#Part%20two')).toEqual({
      kind: 'note',
      path: '../notes/My Note.md',
      fragment: 'Part two',
      markdown: true,
    });
    expect(linkTarget('<a b.markdown>').kind).toBe('note');
  });

  it('ignores everything else', () => {
    for (const href of [
      'javascript:alert(1)',
      'data:text/html,x',
      'JaVaScRiPt:alert(1)',
      'file:///etc/passwd',
      '//evil.example/a.md',
      'photo.png',
      'doc.pdf',
      'noextension',
      '#',
      '',
    ])
      expect(linkTarget(href)).toEqual({ kind: 'none' });
  });
});

describe('wikilinkTarget', () => {
  it('opens the note a wikilink names', () => {
    expect(wikilinkTarget('[[Note]]')).toEqual({
      kind: 'note',
      path: 'Note',
      fragment: null,
      markdown: false,
    });
    expect(wikilinkTarget('[[Folder/Note#Some Heading|alias]]')).toEqual({
      kind: 'note',
      path: 'Folder/Note',
      fragment: 'Some Heading',
      markdown: false,
    });
  });

  it('scrolls to a heading of the same note', () => {
    expect(wikilinkTarget('[[#Some Heading]]')).toEqual({ kind: 'anchor', slug: 'some-heading' });
  });

  it('does nothing for embeds and text that is not a token', () => {
    expect(wikilinkTarget('![[Note]]')).toEqual({ kind: 'none' });
    expect(wikilinkTarget('not a token')).toEqual({ kind: 'none' });
  });
});

describe('headingSlug', () => {
  it('matches the GitHub form', () => {
    expect(headingSlug('Hello, World!')).toBe('hello-world');
    expect(headingSlug('  Sådan gør du  ')).toBe('sådan-gør-du');
    expect(headingSlug('a_b - c')).toBe('a_b---c');
  });
});

describe('headingLink', () => {
  it('links a heading of a Markdown file by name', () => {
    expect(headingLink('My note (v2).md', 'Part [two], done!')).toBe(
      '[Part two, done!](My%20note%20%28v2%29.md#part-two-done)'
    );
  });

  it('is just an anchor when the document is not a Markdown file', () => {
    expect(headingLink('notes.txt', 'Intro')).toBe('[Intro](#intro)');
  });
});
