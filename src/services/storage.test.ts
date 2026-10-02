import { describe, expect, it } from 'vitest';
import { createDocument } from '@/domain/document';
import { loadDocument, loadRecents, pushRecent, saveDocument } from './storage';

const recent = (fileName: string, markdown = '# x') => ({
  fileName,
  title: 'x',
  markdown,
  openedAt: 1,
});

describe('storage', () => {
  it('round-trips the open document', () => {
    const doc = { ...createDocument('# Hello', 'a.md'), markdown: '# Hello!' };
    saveDocument(doc);
    expect(loadDocument()).toEqual(doc);
  });

  it('ignores corrupt or foreign values', () => {
    localStorage.setItem('md-studio:document:v1', '{not json');
    expect(loadDocument()).toBeNull();
    localStorage.setItem('md-studio:document:v1', '{"markdown":42}');
    expect(loadDocument()).toBeNull();
  });

  it('keeps recents de-duplicated, newest first, and capped', () => {
    for (let i = 0; i < 10; i++) pushRecent(recent(`${i}.md`));
    pushRecent(recent('3.md'));
    const names = loadRecents().map((r) => r.fileName);
    expect(names[0]).toBe('3.md');
    expect(names).toHaveLength(8);
    expect(new Set(names).size).toBe(8);
  });

  it('skips oversized snapshots', () => {
    pushRecent(recent('big.md', 'x'.repeat(300 * 1024)));
    expect(loadRecents()).toEqual([]);
  });
});
