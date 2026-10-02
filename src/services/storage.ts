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

/** False when the browser refused (quota exceeded, storage disabled). */
function write(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    // The in-memory document is intact; the caller decides whether to warn.
    return false;
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

/**
 * Saves the open tabs; false when they no longer fit in browser storage.
 * `savedMarkdown` is left out when it equals `markdown` (the usual case),
 * which halves what a saved tab costs.
 */
export function saveTabs(state: Tabs): boolean {
  const ok = write(TABS_KEY, {
    activeId: state.activeId,
    tabs: state.tabs.map(({ id, doc, handleId }) => ({
      id,
      handleId,
      doc:
        doc.savedMarkdown === doc.markdown
          ? { markdown: doc.markdown, fileName: doc.fileName, updatedAt: doc.updatedAt }
          : doc,
    })),
  });
  // The legacy keys would otherwise resurrect a closed document if the
  // tabs entry is ever unreadable.
  remove(DOC_KEY);
  remove(HANDLE_KEY);
  return ok;
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
/**
 * Entries are the same file when their handle ids match. Two entries
 * without handles are told apart by name only. One with a handle and one
 * without are different files: a dropped "README.md" must not replace a
 * linked README.md from another folder (and with it, that file's handle).
 */
const sameRecent = (a: RecentEntry, b: RecentEntry) =>
  a.handleId || b.handleId ? a.handleId === b.handleId : a.fileName === b.fileName;

export function pushRecent(entry: RecentEntry): RecentEntry[] {
  const rest = loadRecents().filter((r) => !sameRecent(r, entry));
  const next = entry.markdown.length <= MAX_RECENT_BYTES ? [entry, ...rest] : rest;
  const capped = next.slice(0, MAX_RECENTS);
  write(RECENTS_KEY, capped);
  return capped;
}

/** Drops one entry from the list (the file itself is untouched). */
export function removeRecent(entry: RecentEntry): RecentEntry[] {
  const next = loadRecents().filter((r) => !sameRecent(r, entry));
  write(RECENTS_KEY, next);
  return next;
}

export function clearRecents(): void {
  remove(RECENTS_KEY);
}

function remove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Storage unavailable: nothing to clear.
  }
}
