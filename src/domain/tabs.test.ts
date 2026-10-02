import { describe, expect, it } from 'vitest';
import { createDocument } from './document';
import {
  closeTab,
  isBlank,
  moveTab,
  neighbourTab,
  openTab,
  type Tab,
  tabForFile,
  tabLabels,
} from './tabs';

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

describe('tabForFile', () => {
  const tabs = [tab('a', 'a', 'h1'), tab('b', 'b')];
  const file = (fileName: string, markdown: string, handleId: string | null = null) => ({
    fileName,
    markdown,
    handleId,
  });

  it('matches a handle id exactly', () => {
    expect(tabForFile(tabs, file('x.md', 'x', 'h1'))?.id).toBe('a');
    expect(tabForFile(tabs, file('a.md', 'a', 'h9'))).toBeUndefined();
  });

  it('without a handle, matches name and opened content of a handle-less tab', () => {
    expect(tabForFile(tabs, file('b.md', 'b'))?.id).toBe('b');
    expect(tabForFile(tabs, file('b.md', 'other'))).toBeUndefined();
    expect(tabForFile(tabs, file('a.md', 'a'))).toBeUndefined(); // that one has a file handle
  });

  it('still matches after the tab was edited', () => {
    const edited = { ...tab('b'), doc: { ...tab('b').doc, markdown: 'b, edited' } };
    expect(tabForFile([edited], file('b.md', 'b'))?.id).toBe('b');
  });
});

describe('tabLabels', () => {
  const named = (id: string, fileName: string, markdown: string): Tab => ({
    id,
    doc: createDocument(markdown, fileName),
    handleId: null,
  });

  it('leaves unique names alone', () => {
    expect(tabLabels([named('1', 'a.md', '# A'), named('2', 'b.md', '# B')])).toEqual([
      'a.md',
      'b.md',
    ]);
  });

  it('adds the first heading to tell same-named tabs apart', () => {
    expect(
      tabLabels([
        named('1', 'notes.md', '# Plan'),
        named('2', 'notes.md', '# Log'),
        named('3', 'x.md', ''),
      ])
    ).toEqual(['notes.md · Plan', 'notes.md · Log', 'x.md']);
  });

  it('falls back to numbers when headings do not differ', () => {
    expect(
      tabLabels([
        named('1', 'Untitled.md', ''),
        named('2', 'Untitled.md', ''),
        named('3', 'Untitled.md', '# T'),
      ])
    ).toEqual(['Untitled.md (1)', 'Untitled.md (2)', 'Untitled.md · T']);
  });
});

describe('moveTab', () => {
  it('moves and clamps', () => {
    const tabs = [tab('a'), tab('b'), tab('c')];
    expect(ids(moveTab(tabs, 'a', 2))).toEqual(['b', 'c', 'a']);
    expect(ids(moveTab(tabs, 'c', -5))).toEqual(['c', 'a', 'b']);
    expect(ids(moveTab(tabs, 'x', 0))).toEqual(['a', 'b', 'c']);
  });
});
