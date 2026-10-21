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
vi.mock('./documentActions', () => ({
  openHandle: async (handle: FileSystemFileHandle) => {
    opened.push(handle);
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
});
