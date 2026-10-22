import { create } from 'zustand';
import { useStore } from '@/store';
import { openHandle } from './documentActions';

/**
 * Back and forward through the notes opened by following links or from the
 * folder panel, like a browser's history. Only these moves are recorded;
 * switching tabs by hand is not.
 */
const MAX_ENTRIES = 50;
const entries: FileSystemFileHandle[] = [];
let index = -1;

export const useNavHistory = create<{ canBack: boolean; canForward: boolean }>()(() => ({
  canBack: false,
  canForward: false,
}));

const publish = () =>
  useNavHistory.setState({ canBack: index > 0, canForward: index < entries.length - 1 });

async function same(a: FileSystemFileHandle, b: FileSystemFileHandle): Promise<boolean> {
  if (a === b) return true;
  try {
    return (await a.isSameEntry?.(b)) ?? false;
  } catch {
    return false;
  }
}

/** Opens a note and records the move. The note already open is the first entry. */
export async function navigateToNote(handle: FileSystemFileHandle): Promise<void> {
  const current = useStore.getState().fileHandle;
  if (entries.length === 0 && current) {
    entries.push(current);
    index = 0;
  }
  entries.length = index + 1;
  const last = entries[index];
  if (!last || !(await same(last, handle))) {
    entries.push(handle);
    if (entries.length > MAX_ENTRIES) entries.shift();
    index = entries.length - 1;
  }
  publish();
  await openHandle(handle);
}

async function step(by: -1 | 1): Promise<void> {
  const target = entries[index + by];
  if (!target) return;
  index += by;
  publish();
  await openHandle(target);
}

export const goBack = (): Promise<void> => step(-1);
export const goForward = (): Promise<void> => step(1);

export function resetHistoryForTest(): void {
  entries.length = 0;
  index = -1;
  publish();
}
