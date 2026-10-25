import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import {
  ensurePermission,
  getHandle,
  getHandleAt,
  imageFolderKey,
  listHandlesWithPrefix,
  permissionOf,
  pruneHandles,
  putHandle,
  putHandleAt,
} from './handleStore';

// Plain objects stand in for FileSystemFileHandle: IndexedDB stores a
// structured clone, which keeps data but drops methods.
const handle = (name: string) => ({ kind: 'file', name }) as unknown as FileSystemFileHandle;

describe('handleStore', () => {
  it('stores and returns handles by id', async () => {
    const id = await putHandle(handle('a.md'));
    expect(id).toBeTruthy();
    expect(await getHandle(id!)).toMatchObject({ name: 'a.md' });
    expect(await getHandle('missing')).toBeNull();
  });

  it('prunes handles that are no longer referenced', async () => {
    const keep = (await putHandle(handle('keep.md')))!;
    const drop = (await putHandle(handle('drop.md')))!;
    await pruneHandles(new Set([keep]));
    expect(await getHandle(keep)).not.toBeNull();
    expect(await getHandle(drop)).toBeNull();
  });

  it('keeps a document’s image folder exactly as long as the document', async () => {
    const doc = (await putHandle(handle('doc.md')))!;
    const other = (await putHandle(handle('other.md')))!;
    await putHandleAt(imageFolderKey(doc), handle('folder'));
    await putHandleAt(imageFolderKey(other), handle('folder2'));
    await pruneHandles(new Set([doc]));
    expect(await getHandleAt(imageFolderKey(doc))).toMatchObject({ name: 'folder' });
    expect(await getHandleAt(imageFolderKey(other))).toBeNull();
  });

  it('lists the handles stored under a key prefix, folders only for dir:', async () => {
    const doc = (await putHandle(handle('listed.md')))!;
    await putHandleAt(imageFolderKey(doc), handle('listed-folder'));
    const folders = await listHandlesWithPrefix('dir:');
    const mine = folders.filter(([key]) => key === imageFolderKey(doc));
    expect(mine).toHaveLength(1);
    expect(mine[0]?.[1]).toMatchObject({ name: 'listed-folder' });
    expect(folders.every(([key]) => key.startsWith('dir:'))).toBe(true);
    expect(await listHandlesWithPrefix('no-such-prefix:')).toEqual([]);
  });

  it('asks for permission only when not already granted', async () => {
    let asked = 0;
    const make = (state: PermissionState, answer: PermissionState) =>
      ({
        queryPermission: async () => state,
        requestPermission: async () => {
          asked++;
          return answer;
        },
      }) as unknown as FileSystemFileHandle;
    expect(await ensurePermission(make('granted', 'denied'))).toBe(true);
    expect(asked).toBe(0);
    expect(await ensurePermission(make('prompt', 'granted'))).toBe(true);
    expect(await ensurePermission(make('prompt', 'denied'))).toBe(false);
    expect(asked).toBe(2);
    // Browsers without the permission API: just try.
    expect(await ensurePermission(handle('x.md'))).toBe(true);
  });

  it('reads the permission without asking', async () => {
    const make = (answer: () => Promise<PermissionState>) =>
      ({
        queryPermission: answer,
        requestPermission: async () => 'granted',
      }) as unknown as FileSystemHandle;
    expect(
      await permissionOf(
        make(async () => 'granted'),
        'read'
      )
    ).toBe('granted');
    expect(
      await permissionOf(
        make(async () => 'prompt'),
        'readwrite'
      )
    ).toBe('prompt');
    // A browser that fails to answer is not taken as a yes.
    expect(
      await permissionOf(
        make(async () => {
          throw new Error('no');
        }),
        'read'
      )
    ).toBe('prompt');
    // Without the permission API there is nothing to wait for: just try.
    expect(await permissionOf(handle('x.md'), 'read')).toBe('granted');
  });
});
