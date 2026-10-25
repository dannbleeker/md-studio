import { create } from 'zustand';
import { notePaths } from '@/domain/folderTree';
import { t } from '@/i18n';
import { useStore } from '@/store';
import { showToast } from '@/store/ui';
import {
  attachmentsSupported,
  fileInFolder,
  scanFolder,
  subscribeAttachments,
} from './attachments';
import {
  deleteHandleAt,
  ensurePermission,
  FOLDER_OWNER,
  getHandleAt,
  imageFolderKey,
  permissionOf,
  putHandleAt,
} from './handleStore';
import { navigateToNote } from './noteHistory';

/**
 * Folder mode: one folder the user opened to browse its notes, kept across
 * visits. It is stored among the vault folders (`dir:` keys), so a note
 * opened from it finds the folder as its attachments folder with no prompt
 * (see adoptKnownRoot), and its links and images resolve.
 */
const FOLDER_KEY = imageFolderKey(FOLDER_OWNER);

type Dir = FileSystemDirectoryHandle;
export type FolderStatus = 'none' | 'needs-permission' | 'scanning' | 'ready';

export type FolderState = {
  name: string | null;
  status: FolderStatus;
  /** The notes (Markdown files) of the folder, sorted. */
  notes: readonly string[];
  truncated: boolean;
};

const EMPTY: FolderState = { name: null, status: 'none', notes: [], truncated: false };

export const useFolder = create<FolderState>()(() => EMPTY);

let root: Dir | null = null;
export const folderRoot = (): Dir | null => root;
export const folderSupported = (): boolean => attachmentsSupported();

const granted = async (dir: Dir): Promise<boolean> =>
  (await permissionOf(dir, 'read')) === 'granted';

async function load(dir: Dir, force = false): Promise<void> {
  useFolder.setState({ name: dir.name, status: 'scanning' });
  const { paths, truncated } = await scanFolder(dir, force);
  // A folder closed or replaced while scanning keeps its own answer.
  if (root !== dir) return;
  useFolder.setState({ name: dir.name, status: 'ready', notes: notePaths(paths), truncated });
}

/** Asks for a folder. Must run inside a click: the picker is the first call. */
export async function openFolder(): Promise<boolean> {
  if (!folderSupported()) {
    showToast(t('folder.unsupported'));
    return false;
  }
  let picked: Dir;
  try {
    picked = (await window.showDirectoryPicker?.({
      id: 'md-studio-folder',
      mode: 'readwrite',
    })) as Dir;
  } catch {
    return false; // cancelled
  }
  root = picked;
  await putHandleAt(FOLDER_KEY, picked);
  useStore.getState().updateSettings({ showFolder: true });
  await load(picked, true);
  return true;
}

/** At start-up: the folder of last time, if its permission still stands. Never prompts. */
export async function restoreFolder(): Promise<void> {
  if (!folderSupported() || root) return;
  const stored = await getHandleAt<Dir>(FOLDER_KEY);
  if (stored?.kind !== 'directory') return;
  root = stored;
  useFolder.setState({ name: stored.name, status: 'needs-permission' });
  if (await granted(stored)) await load(stored);
}

/** For the panel's button: asks for access to the remembered folder. Must run inside a click. */
export async function allowFolder(): Promise<void> {
  if (!root || !(await ensurePermission(root, 'readwrite'))) return;
  await load(root, true);
}

export async function refreshFolder(): Promise<void> {
  if (root && useFolder.getState().status === 'ready') await load(root, true);
}

export async function closeFolder(): Promise<void> {
  root = null;
  useFolder.setState(EMPTY);
  await deleteHandleAt(FOLDER_KEY);
}

/** Opens a note of the folder in a tab (the one already holding it, if any). */
export async function openFolderNote(path: string): Promise<void> {
  if (!root) return;
  const handle = await fileInFolder(root, path);
  if (!handle) {
    showToast(t('link.noteMissing', { name: path }));
    return;
  }
  await navigateToNote(handle);
}

/** The folder-relative path of the open document, or null when it is not in the folder. */
export async function currentFolderPath(): Promise<string | null> {
  const handle = useStore.getState().fileHandle;
  if (!root || !handle) return null;
  try {
    const parts = await root.resolve(handle);
    return parts ? parts.join('/') : null;
  } catch {
    return null;
  }
}

const sameList = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((x, i) => x === b[i]);

/** Keeps the note list current when a rescan finishes. */
let watching = false;
export function watchFolder(): void {
  if (watching) return;
  watching = true;
  subscribeAttachments(() => {
    const dir = root;
    if (!dir || useFolder.getState().status !== 'ready') return;
    void scanFolder(dir).then(({ paths, truncated }) => {
      // A folder closed or replaced meanwhile keeps its own list.
      if (root !== dir) return;
      const notes = notePaths(paths);
      const prev = useFolder.getState();
      // By name, not count: a rename or a delete plus an add keeps the count.
      if (prev.truncated !== truncated || !sameList(prev.notes, notes))
        useFolder.setState({ notes, truncated });
    });
  });
}
