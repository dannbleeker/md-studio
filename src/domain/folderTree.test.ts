import { describe, expect, it } from 'vitest';
import { buildTree, isNotePath, notePaths } from './folderTree';

describe('folderTree', () => {
  it('knows which files are notes', () => {
    expect(['a.md', 'B.MARKDOWN', 'c.mkd', 'd.mdown'].every(isNotePath)).toBe(true);
    expect(['a.png', 'b.txt', 'md', 'a.md.bak'].some(isNotePath)).toBe(false);
  });

  it('builds folders first, then notes, in natural order, leaving out other files', () => {
    const tree = buildTree([
      'z.md',
      'notes/10 later.md',
      'notes/2 first.md',
      'img/a.png',
      'notes/deep/x.md',
      'A.md',
    ]);
    expect(tree.map((n) => n.name)).toEqual(['notes', 'A.md', 'z.md']);
    const notes = tree[0];
    expect(notes?.path).toBe('notes');
    expect(notes?.children?.map((n) => n.name)).toEqual(['deep', '2 first.md', '10 later.md']);
    expect(notes?.children?.[0]?.children?.[0]).toEqual({
      name: 'x.md',
      path: 'notes/deep/x.md',
      children: null,
    });
  });

  it('lists the notes alone, sorted', () => {
    expect(notePaths(['b.md', 'a.png', 'a.md', 'c/n.md'])).toEqual(['a.md', 'b.md', 'c/n.md']);
  });

  it('is empty for no notes', () => {
    expect(buildTree([])).toEqual([]);
    expect(buildTree(['a.png'])).toEqual([]);
  });

  it('scales linearly in the number of paths', { tags: ['stress'] }, () => {
    const time = (n: number) => {
      const paths = Array.from({ length: n }, (_, i) => `d${i % 50}/e${i % 7}/n${i}.md`);
      const start = performance.now();
      buildTree(paths);
      return performance.now() - start;
    };
    time(2000);
    const small = Math.max(time(20_000), 1);
    expect(time(40_000)).toBeLessThan(small * 6);
  });
});
