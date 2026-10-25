/**
 * Small helpers over the File System Access handles that the attachments
 * service uses: listing, a cap on files open at once, lookups by path, and
 * a write that leaves nothing behind when it fails.
 */
import { FILE_CONCURRENCY } from './attachmentCore';

type Dir = FileSystemDirectoryHandle;
type FileHandle = FileSystemFileHandle;

// ---------------------------------------------------------------------------
// Small helpers over the handle APIs
// ---------------------------------------------------------------------------

interface Listable {
  values?: () => AsyncIterable<FileSystemHandle>;
  keys?: () => AsyncIterable<string>;
}

/** lib.dom does not type the directory iterators; they exist in every browser that has the picker. */
export const listable = (dir: Dir): Listable => dir as unknown as Listable;

export const macrotask = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

export function revoke(url: string): void {
  try {
    URL.revokeObjectURL(url);
  } catch {
    // Already gone, or no such API.
  }
}

/** getFile calls in flight; a note with hundreds of embeds must not open hundreds of files at once. */
let active = 0;
const waiting: Array<() => void> = [];

export async function limited<T>(run: () => Promise<T>): Promise<T> {
  if (active >= FILE_CONCURRENCY) await new Promise<void>((resolve) => waiting.push(resolve));
  else active += 1;
  try {
    return await run();
  } finally {
    // Hand the slot straight on so the count never exceeds the limit.
    const next = waiting.shift();
    if (next) next();
    else active -= 1;
  }
}

export async function hasDirectory(root: Dir, name: string): Promise<boolean> {
  try {
    await root.getDirectoryHandle(name);
    return true;
  } catch {
    return false;
  }
}

export async function fileAt(root: Dir, path: string): Promise<FileHandle | null> {
  const segments = path.split('/').filter((s) => s !== '');
  const name = segments.pop();
  if (name === undefined) return null;
  try {
    let dir = root;
    for (const segment of segments) dir = await dir.getDirectoryHandle(segment);
    return await dir.getFileHandle(name);
  } catch {
    return null;
  }
}

export async function notePathIn(root: Dir, note: FileHandle): Promise<string | null> {
  const segments = await root.resolve(note);
  return segments ? segments.join('/') : null;
}

export async function exists(dir: Dir, name: string): Promise<boolean> {
  try {
    await dir.getFileHandle(name);
    return true;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotFoundError') return false;
    // A folder of that name is as taken as a file; any other failure ends the save.
    if (error instanceof DOMException && error.name === 'TypeMismatchError') return true;
    throw error;
  }
}

/**
 * Writes a file the caller has just found to be absent, so every failure
 * removes what this call created: an empty entry left in the user's vault
 * would be a broken file and would take the name from the next paste.
 */
export async function writeFile(dir: Dir, name: string, file: File): Promise<void> {
  const target = await dir.getFileHandle(name, { create: true });
  let writable: FileSystemWritableFileStream | undefined;
  try {
    writable = await target.createWritable();
    await writable.write(file);
    await writable.close();
  } catch (error) {
    // Closing commits what was written, so a failed stream is aborted instead.
    await writable?.abort?.().catch(() => undefined);
    await dir.removeEntry(name).catch(() => undefined);
    throw error;
  }
}
