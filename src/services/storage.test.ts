import { describe, expect, it } from 'vitest';
import { createDocument } from '@/domain/document';
import { loadRecents, loadTabs, pushRecent, saveTabs } from './storage';

const recent = (fileName: string, markdown = '# x') => ({
  fileName,
  title: 'x',
  markdown,
  openedAt: 1,
});

describe('storage', () => {
  it('round-trips the open tabs', () => {
    const doc = { ...createDocument('# Hello', 'a.md'), markdown: '# Hello!' };
    const state = {
      tabs: [
        { id: 't1', doc, handleId: 'h1' },
        { id: 't2', doc: createDocument('b', 'b.md'), handleId: null },
      ],
      activeId: 't2',
    };
    saveTabs(state);
    expect(loadTabs()).toEqual(state);
  });

  it('migrates the single document older builds stored', () => {
    const doc = createDocument('# Old', 'old.md');
    localStorage.setItem('md-studio:document:v1', JSON.stringify(doc));
    localStorage.setItem('md-studio:document-handle:v1', JSON.stringify('h9'));
    expect(loadTabs()).toEqual({
      tabs: [{ id: 'restored', doc, handleId: 'h9' }],
      activeId: 'restored',
    });
    saveTabs({ tabs: [{ id: 'x', doc, handleId: null }], activeId: 'x' });
    expect(localStorage.getItem('md-studio:document:v1')).toBeNull();
    expect(localStorage.getItem('md-studio:document-handle:v1')).toBeNull();
  });

  /** Storage that refuses the tabs entry while more than `room` characters are stored. */
  function tightStorage(room: number) {
    const setItem = Storage.prototype.setItem;
    const used = () =>
      Object.keys(localStorage).reduce((n, k) => n + (localStorage.getItem(k)?.length ?? 0), 0);
    Storage.prototype.setItem = function (this: Storage, key: string, value: string) {
      if (key === 'md-studio:tabs:v1' && used() + value.length > room)
        throw new DOMException('full', 'QuotaExceededError');
      setItem.call(this, key, value);
    };
    return () => {
      Storage.prototype.setItem = setItem;
    };
  }

  it('makes room by dropping the old single document when the tabs do not fit beside it', () => {
    const doc = createDocument(`# Old\n${'text '.repeat(200)}`, 'old.md');
    localStorage.setItem('md-studio:document:v1', JSON.stringify(doc));
    const restore = tightStorage(JSON.stringify(doc).length * 1.5);
    try {
      expect(saveTabs({ tabs: [{ id: 'x', doc, handleId: null }], activeId: 'x' })).toBe(true);
    } finally {
      restore();
    }
    expect(loadTabs()?.tabs[0]?.doc.markdown).toBe(doc.markdown);
    expect(localStorage.getItem('md-studio:document:v1')).toBeNull();
  });

  it('keeps the old single document when the tabs cannot be stored at all', () => {
    const doc = createDocument('# Old draft', 'old.md');
    localStorage.setItem('md-studio:document:v1', JSON.stringify(doc));
    localStorage.setItem('md-studio:document-handle:v1', JSON.stringify('h9'));
    const restore = tightStorage(0);
    try {
      expect(saveTabs({ tabs: [{ id: 'x', doc, handleId: null }], activeId: 'x' })).toBe(false);
    } finally {
      restore();
    }
    // Nothing else holds the draft: a reload must still find it.
    expect(loadTabs()?.tabs[0]).toMatchObject({ doc: { markdown: '# Old draft' }, handleId: 'h9' });
  });

  it('ignores corrupt or foreign values', () => {
    localStorage.setItem('md-studio:document:v1', '{not json');
    expect(loadTabs()).toBeNull();
    localStorage.setItem('md-studio:document:v1', '{"markdown":42}');
    expect(loadTabs()).toBeNull();
    localStorage.setItem('md-studio:tabs:v1', JSON.stringify({ tabs: [{ id: 1, doc: {} }] }));
    expect(loadTabs()).toBeNull();
  });

  it('falls back to the first tab when the active id is unknown', () => {
    const doc = createDocument('a', 'a.md');
    localStorage.setItem(
      'md-studio:tabs:v1',
      JSON.stringify({
        tabs: [
          { id: 'a', doc },
          { id: 'b', doc, handleId: 7 },
        ],
        activeId: 'zz',
      })
    );
    expect(loadTabs()).toEqual({
      tabs: [
        { id: 'a', doc, handleId: null },
        { id: 'b', doc, handleId: null },
      ],
      activeId: 'a',
    });
  });

  it('keeps recents de-duplicated, newest first, and capped', () => {
    for (let i = 0; i < 10; i++) pushRecent(recent(`${i}.md`));
    pushRecent(recent('3.md'));
    const names = loadRecents().map((r) => r.fileName);
    expect(names[0]).toBe('3.md');
    expect(names).toHaveLength(8);
    expect(new Set(names).size).toBe(8);
  });

  it('skips oversized snapshots, but keeps a large linked file listed', () => {
    pushRecent(recent('big.md', 'x'.repeat(300 * 1024)));
    expect(loadRecents()).toEqual([]);
    pushRecent({ ...recent('linked.md', 'x'.repeat(300 * 1024)), handleId: 'h1' });
    expect(loadRecents()).toMatchObject([{ fileName: 'linked.md', handleId: 'h1', markdown: '' }]);
  });

  it('keeps a file’s line endings and BOM with its tab', () => {
    const doc = createDocument('a\n', 'win.md', { lineEnding: '\r\n', bom: true });
    saveTabs({ tabs: [{ id: 't', doc, handleId: null }], activeId: 't' });
    expect(loadTabs()?.tabs[0]?.doc.format).toEqual({ lineEnding: '\r\n', bom: true });
  });

  it('keeps a file’s encoding with its tab, and reads an unknown one as UTF-8', () => {
    const format = { lineEnding: '\n', bom: false, encoding: 'windows-1252' } as const;
    const doc = createDocument('æ\n', 'old.md', format);
    saveTabs({ tabs: [{ id: 't', doc, handleId: null }], activeId: 't' });
    expect(loadTabs()?.tabs[0]?.doc.format).toEqual(format);

    const stored = { ...doc, format: { ...format, encoding: 'koi8-r' } };
    localStorage.setItem(
      'md-studio:tabs:v1',
      JSON.stringify({ activeId: 't', tabs: [{ id: 't', doc: stored }] })
    );
    expect(loadTabs()?.tabs[0]?.doc.format).toEqual({ lineEnding: '\n', bom: false });
  });

  it('drops recent entries the start screen could not show', () => {
    const good = recent('good.md');
    localStorage.setItem(
      'md-studio:recents:v1',
      JSON.stringify([
        { ...recent('a.md'), openedAt: 'garbage' },
        { ...recent('b.md'), openedAt: Number.POSITIVE_INFINITY },
        { ...recent('c.md'), openedAt: 9e15 },
        { ...recent('d.md'), fileName: 7 },
        null,
        good,
      ])
    );
    expect(loadRecents()).toEqual([good]);
  });

  it('keeps a linked file and a same-named file without a link apart in recents', () => {
    pushRecent({ ...recent('README.md'), handleId: 'hX' });
    pushRecent(recent('README.md'));
    expect(loadRecents().map((r) => r.handleId ?? null)).toEqual([null, 'hX']);
  });

  it('stores an unchanged tab once, not twice, and reports a full storage', () => {
    const doc = createDocument('# same text', 'a.md');
    expect(saveTabs({ tabs: [{ id: 't', doc, handleId: null }], activeId: 't' })).toBe(true);
    const raw = localStorage.getItem('md-studio:tabs:v1') ?? '';
    expect(raw.match(/same text/g)).toHaveLength(1);
    expect(loadTabs()?.tabs[0]?.doc).toMatchObject({
      markdown: '# same text',
      savedMarkdown: '# same text',
    });

    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new DOMException('full', 'QuotaExceededError');
    };
    try {
      expect(saveTabs({ tabs: [{ id: 't', doc, handleId: null }], activeId: 't' })).toBe(false);
    } finally {
      Storage.prototype.setItem = setItem;
    }
  });
});
