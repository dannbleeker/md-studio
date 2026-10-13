import { describe, expect, it } from 'vitest';
import {
  addToIndex,
  baseName,
  buildVaultIndex,
  dirOf,
  extOf,
  joinPath,
  normalizePath,
  relativePath,
  resolveTarget,
  shortestUniquePath,
  type VaultIndex,
} from './vaultIndex';

const index = (paths: string[]): VaultIndex => buildVaultIndex(paths);

/** Resolve against a fresh index; `note` is the note path (null for unsaved). */
const at = (
  paths: string[],
  target: string,
  note: string | null = null,
  opts?: { note?: boolean; markdown?: boolean }
) => resolveTarget(index(paths), target, note, opts);

describe('normalizePath', () => {
  it('collapses dots, empty segments and backslashes', () => {
    expect(normalizePath('a//b/./c/../d')).toBe('a/b/d');
    expect(normalizePath('a\\b\\c.png')).toBe('a/b/c.png');
    expect(normalizePath('/a/b/')).toBe('a/b');
  });

  it('returns null when the path climbs above the root', () => {
    expect(normalizePath('..')).toBeNull();
    expect(normalizePath('a/../../x')).toBeNull();
  });

  it('returns the empty string for the root', () => {
    expect(normalizePath('')).toBe('');
    expect(normalizePath('./')).toBe('');
  });
});

describe('path helpers', () => {
  it('joinPath resolves against a folder, returns null on escape', () => {
    expect(joinPath('a/b', '../x.png')).toBe('a/x.png');
    expect(joinPath('', 'x.png')).toBe('x.png');
    expect(joinPath('a', '../../x')).toBeNull();
  });

  it('dirOf and baseName split on the last slash', () => {
    expect(dirOf('a/b/c.png')).toBe('a/b');
    expect(dirOf('c.png')).toBe('');
    expect(baseName('a/b/c.png')).toBe('c.png');
    expect(baseName('c.png')).toBe('c.png');
  });

  it('extOf is lower case, uses the last dot, and is empty without one', () => {
    expect(extOf('IMG.PNG')).toBe('png');
    expect(extOf('Note v1.2')).toBe('2');
    expect(extOf('a.dir/README')).toBe('');
  });

  it('relativePath gives the fewest ../ and never a leading ./', () => {
    expect(relativePath('Notes/Daily', 'images/x.png')).toBe('../../images/x.png');
    expect(relativePath('a/b', 'a/b/x.png')).toBe('x.png');
    expect(relativePath('a/b', 'a/c/x.png')).toBe('../c/x.png');
    expect(relativePath('', 'x.png')).toBe('x.png');
    expect(relativePath('a', 'a')).toBe('../a');
  });
});

describe('buildVaultIndex and addToIndex', () => {
  it('drops entries that normalise to nothing and duplicates, keeps input order', () => {
    const built = buildVaultIndex(['b.md', '../x', './a.md', 'b.md', 'b/../a.md', 'c.md']);
    expect(built.paths).toEqual(['b.md', 'a.md', 'c.md']);
  });

  it('an empty index resolves nothing', () => {
    expect(buildVaultIndex([]).paths).toEqual([]);
    expect(resolveTarget(buildVaultIndex([]), 'x.png', null)).toBeNull();
  });

  it('addToIndex returns a new index and leaves the old one unchanged', () => {
    const before = index(['a.md']);
    const after = addToIndex(before, 'b/c.md');
    expect(before.paths).toEqual(['a.md']);
    expect(after.paths).toEqual(['a.md', 'b/c.md']);
    expect(resolveTarget(after, 'c', null)?.path).toBe('b/c.md');
    expect(resolveTarget(before, 'c', null)).toBeNull();
  });

  it('addToIndex returns the same index for a duplicate or an invalid path', () => {
    const base = index(['a.md']);
    expect(addToIndex(base, 'a.md')).toBe(base);
    expect(addToIndex(base, './a.md')).toBe(base);
    expect(addToIndex(base, '../x.md')).toBe(base);
  });
});

describe('resolveTarget, wikilink order', () => {
  it('an exact vault path wins over a bare name elsewhere', () => {
    expect(at(['x.png', 'a/x.png'], 'x.png', 'a/n.md')).toEqual({
      path: 'x.png',
      ambiguous: false,
      candidates: 1,
    });
  });

  it('a bare name matches its one file in any folder', () => {
    expect(at(['deep/er/photo.png'], 'photo.png', 'n.md')).toEqual({
      path: 'deep/er/photo.png',
      ambiguous: false,
      candidates: 1,
    });
  });

  it('resolves the same name in two folders to the one nearest each note', () => {
    const paths = ['A/img/x.png', 'B/img/x.png'];
    expect(at(paths, 'x.png', 'A/n.md')).toEqual({
      path: 'A/img/x.png',
      ambiguous: true,
      candidates: 2,
    });
    expect(at(paths, 'x.png', 'B/m.md')?.path).toBe('B/img/x.png');
  });

  it('without a note path the shortest path wins, then plain string order', () => {
    expect(at(['a/b/x.png', 'a/x.png'], 'x.png')).toEqual({
      path: 'a/x.png',
      ambiguous: true,
      candidates: 2,
    });
    expect(at(['B/x.png', 'A/x.png'], 'x.png')?.path).toBe('A/x.png');
  });

  it('a suffix matches whole segments only', () => {
    expect(at(['q/a/b/c.png'], 'b/c.png')?.path).toBe('q/a/b/c.png');
    expect(at(['q/ab/c.png'], 'b/c.png')).toBeNull();
  });

  it('a suffix shared by two files is ambiguous', () => {
    expect(at(['x/b/c.png', 'y/b/c.png'], 'b/c.png', 'z/n.md')).toEqual({
      path: 'x/b/c.png',
      ambiguous: true,
      candidates: 2,
    });
  });

  it('[[Note]] resolves to Folder/Note.md', () => {
    expect(at(['Folder/Note.md'], 'Note', 'n.md')?.path).toBe('Folder/Note.md');
  });

  it('an explicit Note.md resolves to the note', () => {
    expect(at(['Note.md', 'Other/Note.md'], 'Note.md', null)?.path).toBe('Note.md');
  });

  it('Note v1.2 and Meeting 2024.01.15 resolve to their .md notes', () => {
    expect(at(['Note v1.2.md'], 'Note v1.2')?.path).toBe('Note v1.2.md');
    expect(at(['Meeting 2024.01.15.md'], 'Meeting 2024.01.15')?.path).toBe('Meeting 2024.01.15.md');
    expect(at(['Dr. Smith.md'], 'Dr. Smith')?.path).toBe('Dr. Smith.md');
  });

  it('an attachment name is tried as given before any .md variant', () => {
    expect(at(['x.zip', 'x.zip.md'], 'x.zip')?.path).toBe('x.zip');
    expect(at(['x.zip.md'], 'x.zip')?.path).toBe('x.zip.md');
  });

  it('IMG.PNG matches img.png case-insensitively', () => {
    expect(at(['IMG.PNG'], 'img.png')?.path).toBe('IMG.PNG');
    expect(at(['img.png'], 'IMG.PNG')?.path).toBe('img.png');
  });

  it('matches case-sensitively first and case-insensitively as a fallback', () => {
    expect(at(['photos/a.png', 'Photos/A.png'], 'a.png')).toEqual({
      path: 'photos/a.png',
      ambiguous: false,
      candidates: 1,
    });
    expect(at(['photos/IMG_1.png'], 'img_1.PNG')?.path).toBe('photos/IMG_1.png');
    expect(at(['Q/B/c.png'], 'b/c.png')?.path).toBe('Q/B/c.png');
  });

  it('./ and ../ resolve from the note first', () => {
    expect(at(['a/x.png', 'x.png'], './x.png', 'a/n.md')?.path).toBe('a/x.png');
    expect(at(['a/x.png'], '../x.png', 'a/b/n.md')?.path).toBe('a/x.png');
    expect(at(['x.png'], './x.png', 'n.md')?.path).toBe('x.png');
  });

  it('a ../ target that climbs above the root is null', () => {
    expect(at(['x.png'], '../../../x', 'a/b/n.md')).toBeNull();
    expect(at(['x.png'], '../x', null)).toBeNull();
  });

  it('a leading slash is vault-absolute: exact path only', () => {
    expect(at(['x.png', 'a/x.png'], '/a/x.png', 'z/n.md')?.path).toBe('a/x.png');
    expect(at(['q/a/x.png'], '/a/x.png', 'z/n.md')).toBeNull();
    expect(at(['a/x.png'], '/x.png', 'a/n.md')).toBeNull();
  });

  it('a trailing slash, an empty or dot-only target resolve to null', () => {
    expect(at(['images/x.png'], 'images/')).toBeNull();
    expect(at(['x.png'], '')).toBeNull();
    expect(at(['x.png'], '   ')).toBeNull();
    expect(at(['x.png'], '.')).toBeNull();
  });

  it('backslashes in the target are read as separators', () => {
    expect(at(['a/x.png'], 'a\\x.png')?.path).toBe('a/x.png');
  });

  it('a root file wins over a nested file of the same name for wikilinks', () => {
    expect(at(['x.png', 'a/x.png'], 'x.png', 'a/n.md')).toEqual({
      path: 'x.png',
      ambiguous: false,
      candidates: 1,
    });
  });

  it('matches NFD file names with an NFC target and the reverse', () => {
    const nfdName = 'Café.png';
    const nfcTarget = 'Café.png';
    expect(at([nfdName], nfcTarget)?.path).toBe(nfdName);
    expect(at(['Café.png'], 'Café.png')?.path).toBe('Café.png');
  });

  it('keeps spaces in names', () => {
    expect(at(['my folder/my file.png'], 'my file.png')?.path).toBe('my folder/my file.png');
  });
});

describe('resolveTarget, Markdown link order', () => {
  it('note-relative first, so the legacy images folder beside the note wins', () => {
    const paths = ['Notes/Daily/images/x.png', 'images/x.png'];
    expect(at(paths, 'images/x.png', 'Notes/Daily/n.md', { markdown: true })?.path).toBe(
      'Notes/Daily/images/x.png'
    );
    // Wikilinks keep the vault-first order for the same index.
    expect(at(paths, 'images/x.png', 'Notes/Daily/n.md')?.path).toBe('images/x.png');
  });

  it('a bare name resolves note-relative before the vault', () => {
    const paths = ['Notes/Daily/x.png', 'x.png'];
    expect(at(paths, 'x.png', 'Notes/Daily/n.md', { markdown: true })?.path).toBe(
      'Notes/Daily/x.png'
    );
  });

  it('falls back to the vault when nothing sits beside the note', () => {
    expect(at(['images/x.png'], 'images/x.png', 'Notes/Daily/n.md', { markdown: true })?.path).toBe(
      'images/x.png'
    );
  });

  it('a note-relative miss with ../ resolves above the note folder', () => {
    expect(at(['a/x.png'], '../x.png', 'a/b/n.md', { markdown: true })?.path).toBe('a/x.png');
  });
});

describe('resolveTarget, note option and no note path', () => {
  it('note: true prefers the .md file for an extension that is not a note', () => {
    expect(at(['Dr. Smith.md', 'Dr. Smith'], 'Dr. Smith', null, { note: true })?.path).toBe(
      'Dr. Smith.md'
    );
  });

  it('with no note path only vault steps run, with the shortest match', () => {
    expect(at(['deep/a/x.png', 'z/x.png'], 'x.png', null)?.path).toBe('z/x.png');
  });
});

describe('shortestUniquePath', () => {
  it('drops .md and the folder for a lone note', () => {
    expect(shortestUniquePath(index(['Folder/Note.md']), 'Folder/Note.md')).toBe('Note');
  });

  it('keeps the folder and the .md when the bare stem is shared', () => {
    const idx = index(['Folder/Note.md', 'Other/Note.md']);
    expect(shortestUniquePath(idx, 'Folder/Note.md')).toBe('Folder/Note');
    expect(shortestUniquePath(idx, 'Other/Note.md')).toBe('Other/Note');
  });

  it('keeps .md when an extensionless file already has the stem', () => {
    const idx = index(['Note', 'Folder/Note.md']);
    expect(shortestUniquePath(idx, 'Folder/Note.md')).toBe('Note.md');
  });

  it('uses the bare name for an attachment that is unique', () => {
    expect(shortestUniquePath(index(['img/a.png', 'img/b.png']), 'img/a.png')).toBe('a.png');
  });

  it('adds folders until an attachment name is unique', () => {
    expect(shortestUniquePath(index(['img/a.png', 'b/a.png']), 'img/a.png')).toBe('img/a.png');
  });

  it('falls back to the full path when nothing shorter is unique', () => {
    expect(shortestUniquePath(index(['x.png']), 'x.png')).toBe('x.png');
  });

  it('is consistent with resolveTarget for every path in a generated 200-file index', () => {
    let seed = 7;
    const random = (): number => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)] as T;
    const folders = ['', 'a', 'a/b', 'c', 'c d', 'a/b/c'];
    const bases = ['x', 'Note', 'img', 'a b', 'Meeting 2024.01.15'];
    const exts = ['png', 'md', 'pdf', 'zip'];
    const generated: string[] = [];
    for (let i = 0; i < 200; i += 1) {
      const folder = pick(folders);
      generated.push(`${folder === '' ? '' : `${folder}/`}${pick(bases)}.${pick(exts)}`);
    }
    const idx = index(generated);
    expect(idx.paths.length).toBeGreaterThan(100);
    for (const p of idx.paths) {
      const short = shortestUniquePath(idx, p);
      expect(resolveTarget(idx, short, null)).toEqual({ path: p, ambiguous: false, candidates: 1 });
    }
  });
});

describe('large vaults', () => {
  // Correctness on a bigger vault; wall-clock bounds fail under Stryker's
  // instrumentation, so timing is left to the perf trace.
  it('builds an index of 2k paths that resolves every file', () => {
    const paths = Array.from(
      { length: 2000 },
      (_, i) => `dir${i % 100}/sub${Math.floor(i / 100)}/file${i}.png`
    );
    const idx = buildVaultIndex(paths);
    expect(idx.paths.length).toBe(2000);
    for (let i = 0; i < 100; i += 1) {
      const n = i * 19;
      expect(resolveTarget(idx, `file${n}.png`, 'dir0/sub0/n.md')).toEqual({
        path: paths[n],
        ambiguous: false,
        candidates: 1,
      });
    }
  });

  it('picks the nearest file out of a big same-name bucket without sorting it', () => {
    // Timing bounds are generous: the old copy-and-sort took ~200 ms per
    // resolve at this size, the single pass takes a few.
    const paths = Array.from({ length: 30000 }, (_, i) => `d${i % 300}/s${i}/image.png`);
    paths.push('d1/s1/n.md');
    const idx = buildVaultIndex(paths);
    const started = performance.now();
    let last = null;
    for (let i = 0; i < 10; i += 1) last = resolveTarget(idx, 'IMAGE.png', 'd1/s1/n.md');
    expect(performance.now() - started).toBeLessThan(1000);
    expect(last).toEqual({ path: 'd1/s1/image.png', ambiguous: true, candidates: 30000 });
  });
});
