import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import {
  ensurePermission,
  getHandle,
  getHandleAt,
  imageFolderKey,
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
});
