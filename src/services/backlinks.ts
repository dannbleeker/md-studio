import { extractNoteLinks, type NoteLink } from '@/domain/backlinks';
import { buildVaultIndex, resolveTarget } from '@/domain/vaultIndex';
import { fileInFolder } from './attachments';

/**
 * "Linked from": which notes of a folder link to a given note. Every note is
 * read once and its links kept (by size and date, so an edited note is read
 * again); the links are resolved against the folder each time, because a note
 * added since can change what a link means.
 */
const MAX_NOTES = 1500;
const MAX_BYTES = 1024 * 1024;
const CONCURRENCY = 6;

type Cached = { lastModified: number; size: number; links: NoteLink[] };
const cache = new WeakMap<FileSystemDirectoryHandle, Map<string, Cached>>();

async function linksOf(root: FileSystemDirectoryHandle, path: string): Promise<NoteLink[] | null> {
  const handle = await fileInFolder(root, path);
  if (!handle) return null;
  let file: File;
  try {
    file = await handle.getFile();
  } catch {
    return null;
  }
  if (file.size > MAX_BYTES) return null;
  const known = cache.get(root) ?? new Map<string, Cached>();
  cache.set(root, known);
  const hit = known.get(path);
  if (hit && hit.lastModified === file.lastModified && hit.size === file.size) return hit.links;
  const links = extractNoteLinks(await file.text());
  known.set(path, { lastModified: file.lastModified, size: file.size, links });
  return links;
}

export type Backlinks = { paths: string[]; tooMany: boolean };

/** The notes that link to `target`, in the order of `notes`. Stops early when `signal` aborts. */
export async function findBacklinks(
  root: FileSystemDirectoryHandle,
  notes: readonly string[],
  target: string,
  signal: AbortSignal
): Promise<Backlinks> {
  const tooMany = notes.length > MAX_NOTES;
  const scanned = tooMany ? notes.slice(0, MAX_NOTES) : notes;
  const index = buildVaultIndex(notes);
  const hits = new Set<string>();
  let next = 0;
  const worker = async () => {
    while (!signal.aborted) {
      const path = scanned[next++];
      if (path === undefined) return;
      if (path === target) continue;
      const links = await linksOf(root, path);
      if (!links) continue;
      for (const link of links) {
        const found = resolveTarget(index, link.target, path, {
          note: true,
          markdown: link.markdown,
        });
        if (found?.path === target) {
          hits.add(path);
          break;
        }
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return { paths: scanned.filter((p) => hits.has(p)), tooMany };
}
