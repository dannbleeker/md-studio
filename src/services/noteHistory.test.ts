import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetStoreForTest, useStore } from '@/store';
import {
  goBack,
  goForward,
  navigateToNote,
  resetHistoryForTest,
  useNavHistory,
} from './noteHistory';

const opened = vi.hoisted(() => [] as FileSystemFileHandle[]);
/** Notes that fail to open (deleted, moved, permission refused). */
const broken = vi.hoisted(() => new Set<string>());
/** While set, every open waits for it: an open still in flight. */
const gate = vi.hoisted(() => ({ wait: null as Promise<void> | null }));
vi.mock('./documentActions', () => ({
  openHandle: async (handle: FileSystemFileHandle) => {
    if (gate.wait) await gate.wait;
    if (broken.has(handle.name)) return false;
    opened.push(handle);
    return true;
  },
}));

const handle = (name: string) =>
  ({
    name,
    kind: 'file',
    isSameEntry: async (other: { name: string }) => other.name === name,
  }) as unknown as FileSystemFileHandle;

const names = () => opened.map((h) => h.name);

describe('note history', () => {
  beforeEach(() => {
    resetStoreForTest();
    resetHistoryForTest();
    opened.length = 0;
    broken.clear();
    gate.wait = null;
  });

  it('starts empty and opens what it is asked to', async () => {
    expect(useNavHistory.getState()).toEqual({ canBack: false, canForward: false });
    await navigateToNote(handle('a.md'));
    expect(names()).toEqual(['a.md']);
    expect(useNavHistory.getState().canBack).toBe(false);
  });

  it('goes back and forward through the notes opened, the first one included', async () => {
    useStore.setState({ fileHandle: handle('home.md') });
    await navigateToNote(handle('a.md'));
    await navigateToNote(handle('b.md'));
    expect(useNavHistory.getState()).toEqual({ canBack: true, canForward: false });
    await goBack();
    await goBack();
    expect(names().slice(2)).toEqual(['a.md', 'home.md']);
    expect(useNavHistory.getState()).toEqual({ canBack: false, canForward: true });
    await goBack(); // nothing before
    expect(opened).toHaveLength(4);
    await goForward();
    expect(names().at(-1)).toBe('a.md');
  });

  it('drops the forward entries when a new note is opened from the middle', async () => {
    useStore.setState({ fileHandle: handle('home.md') });
    await navigateToNote(handle('a.md'));
    await navigateToNote(handle('b.md'));
    await goBack();
    await navigateToNote(handle('c.md'));
    expect(useNavHistory.getState().canForward).toBe(false);
    await goBack();
    expect(names().at(-1)).toBe('a.md');
  });

  it('does not record the same note twice in a row', async () => {
    useStore.setState({ fileHandle: handle('home.md') });
    await navigateToNote(handle('a.md'));
    await navigateToNote(handle('a.md'));
    await goBack();
    expect(names().at(-1)).toBe('home.md');
    expect(useNavHistory.getState().canBack).toBe(false);
  });

  it('stays put when a note cannot be opened, and steps past it next time', async () => {
    useStore.setState({ fileHandle: handle('home.md') });
    await navigateToNote(handle('a.md'));
    await navigateToNote(handle('b.md'));
    broken.add('a.md');
    await goBack();
    // Still on b: Forward has nothing to go to, Back reaches home.
    expect(names().at(-1)).toBe('b.md');
    expect(useNavHistory.getState()).toEqual({ canBack: true, canForward: false });
    await goForward();
    expect(opened).toHaveLength(2);
    await goBack();
    expect(names().at(-1)).toBe('home.md');
    expect(useNavHistory.getState()).toEqual({ canBack: false, canForward: true });
    await goForward();
    expect(names().at(-1)).toBe('b.md');
  });

  it('takes one step at a time when the key repeats', async () => {
    useStore.setState({ fileHandle: handle('home.md') });
    await navigateToNote(handle('a.md'));
    await navigateToNote(handle('b.md'));
    let release = () => {};
    gate.wait = new Promise((resolve) => {
      release = resolve;
    });
    const first = goBack();
    const repeat = goBack();
    release();
    await Promise.all([first, repeat]);
    expect(names().slice(2)).toEqual(['a.md']);
    expect(useNavHistory.getState()).toEqual({ canBack: true, canForward: true });
  });

  it('steps to the right entry when a note is in the history twice', async () => {
    useStore.setState({ fileHandle: handle('home.md') });
    const a = handle('a.md');
    await navigateToNote(a);
    await navigateToNote(handle('b.md'));
    await navigateToNote(a);
    await navigateToNote(handle('c.md'));
    // Back lands on the second a.md: one more Back is b.md, not home.
    await goBack();
    expect(names().at(-1)).toBe('a.md');
    expect(useNavHistory.getState()).toEqual({ canBack: true, canForward: true });
    await goBack();
    expect(names().at(-1)).toBe('b.md');
  });
});
