import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDocument, isDirty } from '@/domain/document';
import { loadDocument } from '@/services/storage';
import { resetStoreForTest, useStore } from './index';

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

  it('persists edits after a debounce', () => {
    vi.useFakeTimers();
    useStore.getState().setMarkdown('# saved later', 'text');
    expect(loadDocument()).toBeNull();
    vi.advanceTimersByTime(350);
    expect(loadDocument()?.markdown).toBe('# saved later');
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
      theme: 'system',
      linkedScroll: false,
      defaultViewMode: 'text',
      showOutline: false,
      language: 'system',
    });
    expect(useStore.getState().viewMode).toBe('text');
  });
});
