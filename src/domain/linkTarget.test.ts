import { describe, expect, it } from 'vitest';
import { fileOpenMode, headingLink, headingSlug, linkTarget, wikilinkTarget } from './linkTarget';

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
      'Dr. Smith',
      'noextension',
      '#',
      '',
    ])
      expect(linkTarget(href)).toEqual({ kind: 'none' });
  });
});

describe('file links', () => {
  it('opens a relative path to a file that is not a note', () => {
    expect(linkTarget('doc.pdf')).toEqual({ kind: 'file', path: 'doc.pdf', markdown: true });
    expect(linkTarget('files/My%20sheet.xlsx#page=2')).toEqual({
      kind: 'file',
      path: 'files/My sheet.xlsx',
      markdown: true,
    });
    expect(linkTarget('photo.png?raw=1').kind).toBe('file');
  });

  it('reads an attachment wikilink as a file and any other as a note', () => {
    expect(wikilinkTarget('[[report.pdf]]')).toEqual({
      kind: 'file',
      path: 'report.pdf',
      markdown: false,
    });
    expect(wikilinkTarget('[[a/photo.png|My photo]]').kind).toBe('file');
    expect(wikilinkTarget('[[Note.v2]]').kind).toBe('note');
    expect(wikilinkTarget('[[Plain]]').kind).toBe('note');
  });

  it('views what a browser only draws and downloads the rest', () => {
    for (const p of ['a.pdf', 'a.png', 'B.JPG', 'a.mp3', 'a.mp4'])
      expect(fileOpenMode(p)).toBe('view');
    for (const p of ['a.svg', 'a.html', 'a.htm', 'a.xlsx', 'a.js', 'a.xml', 'noext'])
      expect(fileOpenMode(p)).toBe('download');
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
