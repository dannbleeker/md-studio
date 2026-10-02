/**
 * localStorage persistence. Every access is guarded: storage can be full,
 * disabled (private mode, blocked site data) or hold a value written by an
 * older build, and none of those may stop the editor from opening.
 */
import type { MdDocument } from '@/domain/document';

const DOC_KEY = 'md-studio:document:v1';
const SETTINGS_KEY = 'md-studio:settings:v1';
const RECENTS_KEY = 'md-studio:recents:v1';

/** Snapshots above this size are left out of the recent list to protect the storage quota. */
const MAX_RECENT_BYTES = 256 * 1024;
const MAX_RECENTS = 8;

export type RecentEntry = {
  fileName: string;
  title: string;
  markdown: string;
  openedAt: number;
};

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota exceeded or storage disabled: the in-memory document is intact,
    // and losing reload-restore is better than crashing the editor.
  }
}

export function loadDocument(): MdDocument | null {
  const doc = read<Partial<MdDocument>>(DOC_KEY);
  if (!doc || typeof doc.markdown !== 'string') return null;
  return {
    markdown: doc.markdown,
    fileName: typeof doc.fileName === 'string' ? doc.fileName : 'Untitled.md',
    savedMarkdown: typeof doc.savedMarkdown === 'string' ? doc.savedMarkdown : doc.markdown,
    updatedAt: typeof doc.updatedAt === 'number' ? doc.updatedAt : Date.now(),
  };
}

export function saveDocument(doc: MdDocument): void {
  write(DOC_KEY, doc);
}

export function loadSettings(): Record<string, unknown> {
  return read<Record<string, unknown>>(SETTINGS_KEY) ?? {};
}

export function saveSettings(settings: object): void {
  write(SETTINGS_KEY, settings);
}

export function loadRecents(): RecentEntry[] {
  const list = read<RecentEntry[]>(RECENTS_KEY);
  return Array.isArray(list) ? list.filter((r) => typeof r?.markdown === 'string') : [];
}

export function pushRecent(entry: RecentEntry): RecentEntry[] {
  const rest = loadRecents().filter((r) => r.fileName !== entry.fileName);
  const next = entry.markdown.length <= MAX_RECENT_BYTES ? [entry, ...rest] : rest;
  const capped = next.slice(0, MAX_RECENTS);
  write(RECENTS_KEY, capped);
  return capped;
}
