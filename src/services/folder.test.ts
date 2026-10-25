import { beforeEach, describe, expect, it, vi } from 'vitest';

const disk = vi.hoisted(() => ({
  paths: new Map<string, string[]>(),
  listener: null as (() => void) | null,
  /** While set, a scan waits for it. */
  gate: null as Promise<void> | null,
}));

vi.mock('./attachments', () => ({
  attachmentsSupported: () => true,
  fileInFolder: async () => null,
  scanFolder: async (dir: FileSystemDirectoryHandle) => {
    const paths = disk.paths.get(dir.name) ?? [];
    if (disk.gate) await disk.gate;
    return { paths, truncated: false };
  },
  subscribeAttachments: (listener: () => void) => {
    disk.listener = listener;
    return () => {};
  },
}));

vi.mock('./handleStore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./handleStore')>()),
  putHandleAt: async () => {},
  deleteHandleAt: async () => {},
}));

const { openFolder, useFolder, watchFolder } = await import('./folder');

const folder = (name: string) =>
  ({
    kind: 'directory',
    name,
    queryPermission: async () => 'granted',
  }) as unknown as FileSystemDirectoryHandle;

async function pick(dir: FileSystemDirectoryHandle) {
  Object.assign(window, { showDirectoryPicker: async () => dir });
  await openFolder();
}

/** A rescan after the window regains focus, and its result landing. */
async function rescan() {
  disk.listener?.();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('folder mode note list', () => {
  beforeEach(() => {
    disk.paths.clear();
    disk.gate = null;
    watchFolder();
  });

  it('follows a rename made outside the app', async () => {
    disk.paths.set('Vault', ['a.md', 'b.md']);
    await pick(folder('Vault'));
    expect(useFolder.getState().notes).toEqual(['a.md', 'b.md']);
    disk.paths.set('Vault', ['a.md', 'c.md']);
    await rescan();
    expect(useFolder.getState().notes).toEqual(['a.md', 'c.md']);
  });

  it('keeps the same list object when nothing changed', async () => {
    disk.paths.set('Vault', ['a.md']);
    await pick(folder('Vault'));
    const before = useFolder.getState().notes;
    await rescan();
    expect(useFolder.getState().notes).toBe(before);
  });

  it('drops a rescan of a folder replaced while it ran', async () => {
    disk.paths.set('Old', ['old.md', 'older.md']);
    disk.paths.set('New', ['new.md']);
    await pick(folder('Old'));
    let release = () => {};
    disk.gate = new Promise((resolve) => {
      release = resolve;
    });
    disk.listener?.();
    disk.gate = null;
    await pick(folder('New'));
    release();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(useFolder.getState().notes).toEqual(['new.md']);
  });
});
