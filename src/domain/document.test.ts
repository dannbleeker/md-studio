import { describe, expect, it } from 'vitest';
import { createDocument, documentTitle, isDirty, normalizeFileName } from './document';

describe('document', () => {
  it('starts clean and becomes dirty on edit', () => {
    const doc = createDocument('# hi');
    expect(isDirty(doc)).toBe(false);
    expect(isDirty({ ...doc, markdown: '# hi!' })).toBe(true);
  });

  it('normalizes file names', () => {
    expect(normalizeFileName('notes')).toBe('notes.md');
    expect(normalizeFileName('notes.txt')).toBe('notes.md');
    expect(normalizeFileName('NOTES.TXT')).toBe('NOTES.md');
    expect(normalizeFileName('README.markdown')).toBe('README.markdown');
    expect(normalizeFileName('a/b:c?.md')).toBe('abc.md');
    expect(normalizeFileName('   ')).toBe('Untitled.md');
  });

  it('derives a title from the first heading or line', () => {
    expect(documentTitle('\n\n## Plan\nbody')).toBe('Plan');
    expect(documentTitle('just text')).toBe('just text');
    expect(documentTitle('')).toBe('');
    expect(documentTitle('x'.repeat(100))).toHaveLength(80);
  });

  it('takes the front matter’s title, and otherwise looks past it', () => {
    expect(documentTitle('---\ntitle: From YAML\n---\n\n# Heading\n')).toBe('From YAML');
    expect(documentTitle('---\ndate: 2024\n---\n\n# Heading\n')).toBe('Heading');
    // A block scalar's text is on the lines below: not worth reading.
    expect(documentTitle('---\ntitle: >-\n  My Post\n---\n\n# Heading\n')).toBe('Heading');
  });
});
