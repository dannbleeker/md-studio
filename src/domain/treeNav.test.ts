import { describe, expect, it } from 'vitest';
import { buildTree } from './folderTree';
import { treeKey, visibleRows } from './treeNav';

const tree = buildTree(['a.md', 'docs/b.md', 'docs/deep/c.md', 'z/y.md']);
const open = (...paths: string[]) => new Set(paths);

describe('visibleRows', () => {
  it('shows a folder before its notes, and contents only while open', () => {
    expect(visibleRows(tree, open()).map((r) => r.path)).toEqual(['docs', 'z', 'a.md']);
    const rows = visibleRows(tree, open('docs'));
    expect(rows.map((r) => r.path)).toEqual(['docs', 'docs/deep', 'docs/b.md', 'z', 'a.md']);
    expect(rows.map((r) => r.level)).toEqual([1, 2, 2, 1, 1]);
    expect(rows[2]).toMatchObject({ parent: 'docs', isDir: false });
    expect(rows[0]).toMatchObject({ expanded: true, parent: null });
  });

  it('ignores an open folder that is inside a closed one', () => {
    expect(visibleRows(tree, open('docs/deep')).map((r) => r.path)).toEqual(['docs', 'z', 'a.md']);
  });
});

describe('treeKey', () => {
  const rows = visibleRows(tree, open('docs'));

  it('steps through the visible rows without wrapping', () => {
    expect(treeKey(rows, 'docs', 'ArrowDown')).toEqual({ focus: 'docs/deep' });
    expect(treeKey(rows, 'docs/deep', 'ArrowUp')).toEqual({ focus: 'docs' });
    expect(treeKey(rows, 'docs', 'ArrowUp')).toBeNull();
    expect(treeKey(rows, 'a.md', 'ArrowDown')).toBeNull();
  });

  it('jumps to the first and last row', () => {
    expect(treeKey(rows, 'z', 'Home')).toEqual({ focus: 'docs' });
    expect(treeKey(rows, 'docs', 'End')).toEqual({ focus: 'a.md' });
    expect(treeKey(rows, 'docs', 'Home')).toBeNull();
  });

  it('opens a closed folder with Right, then enters it', () => {
    expect(treeKey(rows, 'z', 'ArrowRight')).toEqual({ expand: 'z' });
    expect(treeKey(rows, 'docs', 'ArrowRight')).toEqual({ focus: 'docs/deep' });
    expect(treeKey(rows, 'a.md', 'ArrowRight')).toBeNull();
  });

  it('closes an open folder with Left, then climbs to the parent', () => {
    expect(treeKey(rows, 'docs', 'ArrowLeft')).toEqual({ collapse: 'docs' });
    expect(treeKey(rows, 'docs/b.md', 'ArrowLeft')).toEqual({ focus: 'docs' });
    expect(treeKey(rows, 'z', 'ArrowLeft')).toBeNull();
    expect(treeKey(rows, 'a.md', 'ArrowLeft')).toBeNull();
  });

  it('opens a note and toggles a folder with Enter or Space', () => {
    expect(treeKey(rows, 'a.md', 'Enter')).toEqual({ activate: 'a.md' });
    expect(treeKey(rows, 'docs/b.md', ' ')).toEqual({ activate: 'docs/b.md' });
    expect(treeKey(rows, 'z', 'Enter')).toEqual({ expand: 'z' });
    expect(treeKey(rows, 'docs', ' ')).toEqual({ collapse: 'docs' });
  });

  it('ignores other keys and a row that is not shown', () => {
    expect(treeKey(rows, 'a.md', 'x')).toBeNull();
    expect(treeKey(rows, 'gone.md', 'ArrowDown')).toBeNull();
    expect(treeKey([], 'a.md', 'Enter')).toBeNull();
  });
});
