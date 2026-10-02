/**
 * localStorage persistence. Every access is guarded: storage can be full,
 * disabled (private mode, blocked site data) or hold a value written by an
 * older build, and none of those may stop the editor from opening.
 */
import type { MdDocument } from '@/domain/document';
import type { Tab, Tabs } from '@/domain/tabs';

const DOC_KEY = 'md-studio:document:v1';
const SETTINGS_KEY = 'md-studio:settings:v1';
const RECENTS_KEY = 'md-studio:recents:v1';
const HANDLE_KEY = 'md-studio:document-handle:v1';
const TABS_KEY = 'md-studio:tabs:v1';

/** Snapshots above this size are left out of the recent list to protect the storage quota. */
const MAX_RECENT_BYTES = 256 * 1024;
const MAX_RECENTS = 8;

export type RecentEntry = {
  fileName: string;
  title: string;
  /** Snapshot, used when the file itself can't be reopened. */
  markdown: string;
  openedAt: number;
  /** Id of the file's handle in IndexedDB (services/handleStore), when it has one. */
  handleId?: string;
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

function toDocument(doc: Partial<MdDocument> | null | undefined): MdDocument | null {
  if (!doc || typeof doc.markdown !== 'string') return null;
  return {
    markdown: doc.markdown,
    fileName: typeof doc.fileName === 'string' ? doc.fileName : 'Untitled.md',
    savedMarkdown: typeof doc.savedMarkdown === 'string' ? doc.savedMarkdown : doc.markdown,
    updatedAt: typeof doc.updatedAt === 'number' ? doc.updatedAt : Date.now(),
  };
}

/**
 * The open tabs. Falls back to the single document older builds kept
 * (`document:v1` + `document-handle:v1`), so an update keeps it open.
 */
export function loadTabs(): Tabs | null {
  const saved = read<{ activeId?: unknown; tabs?: unknown }>(TABS_KEY);
  if (saved && Array.isArray(saved.tabs)) {
    const tabs: Tab[] = [];
    for (const raw of saved.tabs as Partial<Tab>[]) {
      const doc = toDocument(raw?.doc);
      if (doc && typeof raw.id === 'string')
        tabs.push({
          id: raw.id,
          doc,
          handleId: typeof raw.handleId === 'string' ? raw.handleId : null,
        });
    }
    const first = tabs[0];
    if (!first) return null;
    const activeId = tabs.some((t) => t.id === saved.activeId)
      ? (saved.activeId as string)
      : first.id;
    return { tabs, activeId };
  }
  const legacy = toDocument(read<Partial<MdDocument>>(DOC_KEY));
  if (!legacy) return null;
  const handleId = read<string>(HANDLE_KEY);
  return {
    tabs: [
      { id: 'restored', doc: legacy, handleId: typeof handleId === 'string' ? handleId : null },
    ],
    activeId: 'restored',
  };
}

export function saveTabs(state: Tabs): void {
  write(TABS_KEY, state);
  // The legacy keys would otherwise resurrect a closed document if the
  // tabs entry is ever unreadable.
  remove(DOC_KEY);
  remove(HANDLE_KEY);
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

/**
 * Adds `entry` at the top. Entries are the same file when their handle ids
 * match; without handles, when their names match (two "notes.md" from
 * different folders are only told apart when both have handles).
 */
export function pushRecent(entry: RecentEntry): RecentEntry[] {
  const same = (r: RecentEntry) =>
    entry.handleId && r.handleId ? r.handleId === entry.handleId : r.fileName === entry.fileName;
  const rest = loadRecents().filter((r) => !same(r));
  const next = entry.markdown.length <= MAX_RECENT_BYTES ? [entry, ...rest] : rest;
  const capped = next.slice(0, MAX_RECENTS);
  write(RECENTS_KEY, capped);
  return capped;
}

function remove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Storage unavailable: nothing to clear.
  }
}
