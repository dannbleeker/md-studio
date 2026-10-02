import { describe, expect, it } from 'vitest';
import { createDocument } from './document';
import { closeTab, isBlank, neighbourTab, openTab, type Tab, tabForHandle } from './tabs';

const tab = (id: string, markdown = id, handleId: string | null = null): Tab => ({
  id,
  doc: createDocument(markdown, `${id}.md`),
  handleId,
});
const blank = (id: string): Tab => ({ id, doc: createDocument(), handleId: null });
const ids = (tabs: Tab[]) => tabs.map((t) => t.id);

describe('isBlank', () => {
  it('is true only for an untouched untitled document without a file', () => {
    expect(isBlank(blank('a'))).toBe(true);
    expect(isBlank({ ...blank('a'), doc: { ...createDocument(), markdown: 'x' } })).toBe(false);
    expect(isBlank({ ...blank('a'), handleId: 'h' })).toBe(false);
    expect(isBlank(tab('a', ''))).toBe(false);
  });
});

describe('openTab', () => {
  it('inserts after the active tab and activates it', () => {
    const r = openTab({ tabs: [tab('a'), tab('b')], activeId: 'a' }, tab('c'));
    expect(ids(r.tabs)).toEqual(['a', 'c', 'b']);
    expect(r.activeId).toBe('c');
  });

  it('replaces a blank active tab', () => {
    const r = openTab({ tabs: [tab('a'), blank('b')], activeId: 'b' }, tab('c'));
    expect(ids(r.tabs)).toEqual(['a', 'c']);
  });

  it('appends when the active id is unknown', () => {
    expect(ids(openTab({ tabs: [tab('a')], activeId: 'x' }, tab('c')).tabs)).toEqual(['a', 'c']);
  });
});

describe('closeTab', () => {
  const state = { tabs: [tab('a'), tab('b'), tab('c')], activeId: 'b' };

  it('activates the right neighbour, or the left at the end', () => {
    expect(closeTab(state, 'b')).toMatchObject({ activeId: 'c' });
    expect(closeTab({ ...state, activeId: 'c' }, 'c')).toMatchObject({ activeId: 'b' });
  });

  it('keeps the active tab when closing another', () => {
    const r = closeTab(state, 'a');
    expect(ids(r.tabs)).toEqual(['b', 'c']);
    expect(r.activeId).toBe('b');
  });

  it('reports no active tab when the last one closes', () => {
    expect(closeTab({ tabs: [tab('a')], activeId: 'a' }, 'a')).toEqual({
      tabs: [],
      activeId: null,
    });
  });

  it('ignores unknown ids', () => {
    expect(closeTab(state, 'x')).toBe(state);
  });
});

describe('neighbourTab', () => {
  const state = { tabs: [tab('a'), tab('b'), tab('c')], activeId: 'a' };
  it('steps and wraps both ways', () => {
    expect(neighbourTab(state, 1)).toBe('b');
    expect(neighbourTab(state, -1)).toBe('c');
    expect(neighbourTab({ ...state, activeId: 'c' }, 1)).toBe('a');
  });
});

describe('tabForHandle', () => {
  it('finds the tab showing a file', () => {
    const tabs = [tab('a', 'a', 'h1'), tab('b', 'b', 'h2')];
    expect(tabForHandle(tabs, 'h2')?.id).toBe('b');
    expect(tabForHandle(tabs, null)).toBeUndefined();
    expect(tabForHandle(tabs, 'h3')).toBeUndefined();
  });
});
