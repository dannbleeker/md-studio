import { describe, expect, it } from 'vitest';
import { isNotePath, opensAsDocument, withoutNoteExtension } from './noteFiles';

describe('isNotePath', () => {
  it('knows the note extensions in any case', () => {
    expect(['a.md', 'B.MARKDOWN', 'c.mkd', 'd.mdown', 'dir/e.md'].every(isNotePath)).toBe(true);
    expect(['a.png', 'b.txt', 'md', 'a.md.bak', '.md/x', ''].some(isNotePath)).toBe(false);
  });
});

describe('opensAsDocument', () => {
  it('takes notes and plain text, nothing else', () => {
    expect(['a.md', 'B.MKD', 'notes.txt', 'N.TXT'].every(opensAsDocument)).toBe(true);
    expect(['a.png', 'a.pdf', 'txt', 'md', 'a.txt.zip'].some(opensAsDocument)).toBe(false);
  });
});

describe('withoutNoteExtension', () => {
  it('drops a note extension and keeps everything else', () => {
    expect(withoutNoteExtension('Ideas.md')).toBe('Ideas');
    expect(withoutNoteExtension('v1.2 Notes.MARKDOWN')).toBe('v1.2 Notes');
    expect(withoutNoteExtension('dir/Plan.mkd')).toBe('dir/Plan');
    expect(withoutNoteExtension('photo.png')).toBe('photo.png');
    expect(withoutNoteExtension('notes.txt')).toBe('notes.txt');
    expect(withoutNoteExtension('.md')).toBe('.md');
    expect(withoutNoteExtension('README')).toBe('README');
  });
});
