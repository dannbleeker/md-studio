import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDocument, isDirty } from '@/domain/document';
import { loadTabs } from '@/services/storage';
import { resetStoreForTest, useStore } from './index';
import { DEFAULT_SETTINGS } from './settings';
import { useUiStore } from './ui';
import { registerViewPart } from './viewState';

describe('store', () => {
  beforeEach(() => resetStoreForTest());

  it('opens on the start screen with no saved document', () => {
    expect(useStore.getState().screen).toBe('start');
  });

  it('restores the last document straight into the editor', () => {
    localStorage.setItem(
      'md-studio:document:v1',
      JSON.stringify(createDocument('# Back again', 'b.md'))
    );
    resetStoreForTest();
    const s = useStore.getState();
    expect(s.screen).toBe('editor');
    expect(s.doc.markdown).toBe('# Back again');
  });

  it('records the source of each edit and ignores no-ops', () => {
    const { setMarkdown } = useStore.getState();
    setMarkdown('a', 'text');
    expect(useStore.getState().source).toBe('text');
    setMarkdown('a', 'visual');
    expect(useStore.getState().source).toBe('text');
    setMarkdown('ab', 'visual');
    expect(useStore.getState().source).toBe('visual');
  });

  it('tracks dirty state across edit and save', () => {
    const s = useStore.getState();
    s.loadDocument(createDocument('x', 'x.md'), null);
    s.setMarkdown('xy', 'text');
    expect(isDirty(useStore.getState().doc)).toBe(true);
    useStore.getState().markSaved('x.md', null);
    expect(isDirty(useStore.getState().doc)).toBe(false);
    expect(useStore.getState().recents[0]?.markdown).toBe('xy');
  });

  it('bumps loadId on every load', () => {
    const before = useStore.getState().loadId;
    useStore.getState().loadDocument(createDocument('a'), null);
    expect(useStore.getState().loadId).toBe(before + 1);
    expect(useStore.getState().source).toBe('load');
  });

  it('leaves the document store alone when a dialog or the find bar opens', () => {
    const changes = vi.fn();
    const off = useStore.subscribe(changes);
    const ui = useUiStore.getState();
    ui.setSettingsOpen(true);
    ui.setPaletteOpen(true);
    ui.setExportOpen(true);
    ui.setFind(true, true);
    off();
    expect(changes).not.toHaveBeenCalled();
    expect(useUiStore.getState()).toMatchObject({ settingsOpen: true, findRequest: 1 });
  });

  it('persists edits after a debounce', () => {
    vi.useFakeTimers();
    useStore.getState().setMarkdown('# saved later', 'text');
    expect(loadTabs()).toBeNull();
    vi.advanceTimersByTime(350);
    expect(loadTabs()?.tabs[0]?.doc.markdown).toBe('# saved later');
    vi.useRealTimers();
  });

  it('persists settings and sanitizes garbage', () => {
    useStore.getState().updateSettings({ linkedScroll: false });
    localStorage.setItem(
      'md-studio:settings:v1',
      JSON.stringify({ linkedScroll: false, theme: 'neon', defaultViewMode: 'text' })
    );
    resetStoreForTest();
    expect(useStore.getState().settings).toEqual({
      ...DEFAULT_SETTINGS,
      theme: 'system',
      linkedScroll: false,
      defaultViewMode: 'text',
      showOutline: false,
      language: 'system',
    });
    expect(useStore.getState().viewMode).toBe('text');
  });
});

describe('tabs', () => {
  beforeEach(() => resetStoreForTest());
  const open = (md: string, name: string) =>
    useStore.getState().loadDocument(createDocument(md, name), null);
  const names = () => useStore.getState().tabs.map((t) => t.doc.fileName);

  it('opens a file in place of the blank first tab, then in new tabs', () => {
    open('# A', 'a.md');
    expect(names()).toEqual(['a.md']);
    open('# B', 'b.md');
    expect(names()).toEqual(['a.md', 'b.md']);
    expect(useStore.getState().doc.fileName).toBe('b.md');
  });

  it('keeps each tab’s edits when switching', () => {
    open('a', 'a.md');
    const first = useStore.getState().activeTabId;
    useStore.getState().setMarkdown('a edited', 'text');
    open('b', 'b.md');
    const loadId = useStore.getState().loadId;
    useStore.getState().activateTab(first);
    const s = useStore.getState();
    expect(s.doc.markdown).toBe('a edited');
    expect(isDirty(s.doc)).toBe(true);
    expect(s.source).toBe('load');
    expect(s.loadId).toBe(loadId + 1);
    expect(s.tabs.find((t) => t.doc.fileName === 'b.md')?.doc.markdown).toBe('b');
  });

  it('closing the active tab shows its neighbour; the last returns to start', () => {
    open('a', 'a.md');
    open('b', 'b.md');
    useStore.getState().closeTab(useStore.getState().activeTabId);
    expect(useStore.getState().doc.fileName).toBe('a.md');
    useStore.getState().closeTab(useStore.getState().activeTabId);
    const s = useStore.getState();
    expect(s.screen).toBe('start');
    expect(s.tabs).toHaveLength(1);
    expect(s.doc.markdown).toBe('');
  });

  it('closing a background tab leaves the active one alone', () => {
    open('a', 'a.md');
    const first = useStore.getState().activeTabId;
    open('b', 'b.md');
    const loadId = useStore.getState().loadId;
    useStore.getState().closeTab(first);
    expect(names()).toEqual(['b.md']);
    expect(useStore.getState().loadId).toBe(loadId);
  });

  it('persists every tab and restores the active one', () => {
    vi.useFakeTimers();
    open('a', 'a.md');
    open('b', 'b.md');
    useStore.getState().setMarkdown('b2', 'text');
    vi.advanceTimersByTime(350);
    vi.useRealTimers();
    resetStoreForTest();
    const s = useStore.getState();
    expect(names()).toEqual(['a.md', 'b.md']);
    expect(s.doc.markdown).toBe('b2');
    expect(s.screen).toBe('editor');
  });

  it('shows the start screen after a reload once every tab was closed', () => {
    vi.useFakeTimers();
    open('a', 'a.md');
    useStore.getState().closeTab(useStore.getState().activeTabId);
    vi.advanceTimersByTime(350);
    vi.useRealTimers();
    expect(loadTabs()?.tabs).toHaveLength(1);
    resetStoreForTest();
    expect(useStore.getState().screen).toBe('start');
  });

  it('returns to where each tab was left; new documents start at the top', () => {
    let where = { textAnchor: 3, textHead: 5, textScroll: 200, visualScroll: 90 };
    const off = registerViewPart(() => where);
    open('aaaaaa', 'a.md');
    const first = useStore.getState().activeTabId;
    open('b', 'b.md');
    expect(useStore.getState().restoreView).toBeNull();
    where = { textAnchor: 1, textHead: 1, textScroll: 0, visualScroll: 0 };
    useStore.getState().activateTab(first);
    expect(useStore.getState().restoreView).toEqual({
      textAnchor: 3,
      textHead: 5,
      textScroll: 200,
      visualScroll: 90,
    });
    off();
  });

  it('reorders tabs', () => {
    open('a', 'a.md');
    open('b', 'b.md');
    open('c', 'c.md');
    useStore.getState().moveTab(useStore.getState().activeTabId, 0);
    expect(names()).toEqual(['c.md', 'a.md', 'b.md']);
  });

  it('never writes an older copy of a tab over another window’s newer edit', () => {
    vi.useFakeTimers();
    open('v1', 'shared.md');
    vi.advanceTimersByTime(350);
    // Another window edits the same tab later and saves it.
    const stored = JSON.parse(localStorage.getItem('md-studio:tabs:v1') ?? '{}');
    stored.tabs[0].doc = {
      ...stored.tabs[0].doc,
      markdown: 'v2, theirs',
      updatedAt: Date.now() + 1000,
    };
    localStorage.setItem('md-studio:tabs:v1', JSON.stringify(stored));
    // This window, idle, is hidden or closed: nothing of its own to write.
    window.dispatchEvent(new Event('pagehide'));
    expect(loadTabs()?.tabs[0]?.doc.markdown).toBe('v2, theirs');
    // Even when it writes for another reason, the newer copy stays.
    open('other', 'other.md');
    vi.advanceTimersByTime(350);
    vi.useRealTimers();
    expect(loadTabs()?.tabs.find((t) => t.doc.fileName === 'shared.md')?.doc.markdown).toBe(
      'v2, theirs'
    );
  });

  it('does not bring back a blank tab that an opened file took the place of', () => {
    vi.useFakeTimers();
    open('a', 'a.md');
    useStore.getState().closeTab(useStore.getState().activeTabId);
    vi.advanceTimersByTime(350);
    open('b', 'b.md');
    vi.advanceTimersByTime(350);
    vi.useRealTimers();
    resetStoreForTest();
    expect(names()).toEqual(['b.md']);
  });

  it('keeps tabs another window saved instead of overwriting them', () => {
    vi.useFakeTimers();
    open('mine', 'mine.md');
    vi.advanceTimersByTime(350);
    // Another window of the app saves a tab this window has never seen.
    const other = {
      id: 'other-window',
      doc: createDocument('theirs', 'theirs.md'),
      handleId: null,
    };
    const now = JSON.parse(localStorage.getItem('md-studio:tabs:v1') ?? '{}');
    localStorage.setItem(
      'md-studio:tabs:v1',
      JSON.stringify({ ...now, tabs: [...now.tabs, other] })
    );
    useStore.getState().setMarkdown('mine, edited', 'text');
    vi.advanceTimersByTime(350);
    vi.useRealTimers();
    expect(loadTabs()?.tabs.map((t) => t.doc.fileName)).toEqual(['mine.md', 'theirs.md']);
  });
});
