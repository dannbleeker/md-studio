/**
 * File handles kept in IndexedDB, so a recent file (and the open document,
 * after a reload) can be reopened and saved in place instead of falling
 * back to a snapshot and a "Save as" prompt.
 *
 * Handles are structured-cloneable in Chromium but can't go in
 * localStorage, hence IndexedDB. Every function degrades to "no handle"
 * when IndexedDB is unavailable (private mode, blocked storage, other
 * browsers), which is the same behaviour as before handles were kept.
 */

const DB_NAME = 'md-studio';
const STORE = 'file-handles';

let dbPromise: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  // A failed open must not poison every later call.
  dbPromise.catch(() => {
    dbPromise = null;
  });
  return dbPromise;
}

function request<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest
): Promise<T> {
  return db().then(
    (database) =>
      new Promise<T>((resolve, reject) => {
        const req = run(database.transaction(STORE, mode).objectStore(STORE));
        req.onsuccess = () => resolve(req.result as T);
        req.onerror = () => reject(req.error);
      })
  );
}

async function entries(): Promise<[string, FileSystemFileHandle][]> {
  // Includes image-folder entries (`dir:<id>`); callers that only want file
  // handles filter by key.
  const [keys, values] = await Promise.all([
    request<IDBValidKey[]>('readonly', (s) => s.getAllKeys()),
    request<FileSystemFileHandle[]>('readonly', (s) => s.getAll()),
  ]);
  return keys.map((k, i) => [String(k), values[i] as FileSystemFileHandle]);
}

const newId = () =>
  globalThis.crypto?.randomUUID?.() ??
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

/**
 * Stores `handle` and returns its id, reusing the id of a stored handle for
 * the same file so reopening a file doesn't pile up duplicates. Null when
 * handles can't be stored.
 */
export async function putHandle(handle: FileSystemFileHandle): Promise<string | null> {
  try {
    for (const [id, stored] of await entries()) {
      if (id.startsWith('dir:')) continue;
      if (await stored.isSameEntry?.(handle).catch(() => false)) {
        await request('readwrite', (s) => s.put(handle, id));
        return id;
      }
    }
    const id = newId();
    await request('readwrite', (s) => s.put(handle, id));
    return id;
  } catch {
    return null;
  }
}

export async function getHandle(id: string): Promise<FileSystemFileHandle | null> {
  try {
    return (await request<FileSystemFileHandle | undefined>('readonly', (s) => s.get(id))) ?? null;
  } catch {
    return null;
  }
}

/** Stores any handle under a caller-chosen key (e.g. a document's image folder). */
export async function putHandleAt(key: string, handle: FileSystemHandle): Promise<void> {
  try {
    await request('readwrite', (s) => s.put(handle, key));
  } catch {
    // Not stored: the caller asks again next time.
  }
}

export async function getHandleAt<T extends FileSystemHandle>(key: string): Promise<T | null> {
  try {
    return (await request<T | undefined>('readonly', (s) => s.get(key))) ?? null;
  } catch {
    return null;
  }
}

/** Key for the image folder chosen for the document with handle id `docHandleId`. */
export const imageFolderKey = (docHandleId: string) => `dir:${docHandleId}`;

/**
 * Deletes every stored handle whose id isn't in `keep`; a document's image
 * folder (`dir:<id>`) is kept along with the document.
 */
export async function pruneHandles(keep: ReadonlySet<string>): Promise<void> {
  try {
    for (const [id] of await entries()) {
      const owner = id.startsWith('dir:') ? id.slice(4) : id;
      if (!keep.has(owner)) await request('readwrite', (s) => s.delete(id));
    }
  } catch {
    // Best effort: a stale handle costs a few bytes, nothing more.
  }
}

/**
 * True when the page may use `handle` in `mode`, asking the user if needed.
 * Asking only works inside a user gesture (a click or key press), which is
 * where every caller runs.
 */
export async function ensurePermission(
  handle: FileSystemHandle,
  mode: 'read' | 'readwrite' = 'readwrite'
): Promise<boolean> {
  if (!handle.queryPermission) return true; // no permission model: just try
  try {
    if ((await handle.queryPermission({ mode })) === 'granted') return true;
    return (await handle.requestPermission?.({ mode })) === 'granted';
  } catch {
    return false;
  }
}
