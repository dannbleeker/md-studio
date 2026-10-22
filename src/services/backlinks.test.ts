import { describe, expect, it } from 'vitest';
import { fakeVault } from '../../test/fakeFs';
import { findBacklinks } from './backlinks';

const signal = () => new AbortController().signal;

describe('findBacklinks', () => {
  const files = {
    'Notes/Target.md': '# Target',
    'Notes/A.md': 'Links to [[Target]].',
    'Notes/B.md': 'A [markdown link](Target.md#top).',
    'Other/C.md': 'Wiki with path [[Notes/Target|alias]].',
    'Other/D.md': 'Nothing here, and `[[Target]]` in code.',
    'Other/E.md': 'Links to [[Different]].',
    'Different.md': '# Different',
    'pic.png': 'x',
  };

  it('lists the notes that link to a note, by wikilink or Markdown link, not code', async () => {
    const vault = fakeVault(files);
    const notes = Object.keys(files).filter((p) => p.endsWith('.md'));
    const result = await findBacklinks(vault.root, notes, 'Notes/Target.md', signal());
    expect(result).toEqual({ paths: ['Notes/A.md', 'Notes/B.md', 'Other/C.md'], tooMany: false });
  });

  it('notices a note that was edited to link here', async () => {
    const vault = fakeVault(files);
    const notes = Object.keys(files).filter((p) => p.endsWith('.md'));
    const before = await findBacklinks(vault.root, notes, 'Notes/Target.md', signal());
    expect(before.paths).not.toContain('Other/E.md');
    const writable = await vault.file('Other/E.md').createWritable();
    await writable.write('Now links to [[Target]].');
    await writable.close();
    vault.setLastModified('Other/E.md', 5_000);
    const after = await findBacklinks(vault.root, notes, 'Notes/Target.md', signal());
    expect(after.paths).toContain('Other/E.md');
  });

  it('stops when aborted', async () => {
    const vault = fakeVault(files);
    const controller = new AbortController();
    controller.abort();
    const result = await findBacklinks(
      vault.root,
      ['Notes/A.md'],
      'Notes/Target.md',
      controller.signal
    );
    expect(result.paths).toEqual([]);
  });
});
