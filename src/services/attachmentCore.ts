/**
 * The attachments service's state and its folder side: which folder each
 * document uses, permission, status, the vault rules and the background scan
 * with its misses. Resolution, reading and saving (attachments.ts and
 * attachmentSave.ts) build on it. Callers import from attachments.ts only.
 */
import { DEFAULT_VAULT_CONFIG, parseVaultConfig, type VaultConfig } from '@/domain/vaultConfig';
import { buildVaultIndex, type VaultIndex } from '@/domain/vaultIndex';
import { t } from '@/i18n';
import { useStore } from '@/store';
import { showToast } from '@/store/ui';
import type {
  AttachmentStatus,
  AttachmentUnavailable,
  DocContext,
  VaultSnapshot,
} from './attachmentTypes';
import { hasDirectory, listable, macrotask, notePathIn, revoke } from './dirHandles';
import {
  ensurePermission,
  getHandleAt,
  imageFolderKey,
  listHandlesWithPrefix,
  permissionOf,
  putHandleAt,
} from './handleStore';

const MAX_SCAN_FILES = 50_000;
const MAX_SCAN_DEPTH = 32;
/** Give the page a turn this often while walking, so a big vault never freezes typing. */
const YIELD_EVERY = 500;
const PARTIAL_EVERY = 5_000;
/** Throttles run from the end of the last scan, so a slow scan never causes back-to-back scans. */
const FOCUS_RESCAN_MS = 10_000;
const MISS_RESCAN_MS = 30_000;
const MISS_NOTIFY_MS = 250;
export const MAX_URLS = 500;
/** Past MAX_URLS only the open document's URLs are kept, up to this many: they may be on screen. */
export const MAX_URLS_ACTIVE = 4_000;
/** How long a save waits for the first scan before it links by full path instead. */
export const LINK_SCAN_WAIT_MS = 2_000;
export const MAX_LOOKUPS = 2_000;
export const FILE_CONCURRENCY = 8;
export const MAX_NOTE_BYTES = 2 * 1024 * 1024;
export const NOTE_CACHE_ENTRIES = 20;
export const NOTE_CACHE_CHARS = 4 * 1024 * 1024;

type Dir = FileSystemDirectoryHandle;
type FileHandle = FileSystemFileHandle;

export function currentDocContext(): DocContext {
  const { fileHandle, handleId } = useStore.getState();
  return { fileHandle, handleId };
}

export function attachmentsSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';
}

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

interface RootInfo {
  hasObsidian: boolean;
  config: VaultConfig | null;
  /** The vault rules could not be read (not merely absent): a stand-in answer that is never cached. */
  transient?: true;
}

/** Everything known about one folder; shared by every document whose folder is the same entry. */
export interface RootState {
  root: Dir;
  /** Partial while the first scan runs, replaced only when a scan completes afterwards. */
  index: VaultIndex | null;
  complete: boolean;
  truncated: boolean;
  completedAt: number | null;
  stale: boolean;
  scanning: Promise<void> | null;
  info: Promise<RootInfo> | null;
  /** Files saved while a scan was running, which that scan may have walked past. */
  added: string[];
  /** True from the first step of a scan to its last, with no await in between. */
  walking: boolean;
  /** Counts finished scans: a lookup cached in an earlier one is not trusted. */
  epoch: number;
  truncatedNotified: boolean;
  /**
   * Every embed that was not found, keyed `${handleId}\0${from}\0${target}`.
   * `own` marks those written in the open note itself, as opposed to inside a
   * note it embeds, so only they can be checked against the note's text.
   */
  misses: Map<string, { target: string; own: boolean }>;
}

export interface Located {
  path: string;
  handle: FileHandle;
  ambiguous: boolean;
}

interface Lookup {
  path: string;
  ambiguous: boolean;
  /** RootState.epoch when it was found. */
  epoch: number;
}

interface UrlEntry {
  url: string;
  lastModified: number;
  size: number;
  handleId: string;
}

export interface NoteEntry {
  path: string;
  text: string;
  lastModified: number;
  size: number;
}

const rootByHandle = new Map<string, Dir>();
const rootStates: RootState[] = [];
let stateByRoot = new WeakMap<Dir, Promise<RootState>>();
/** Per document: the note handle the path was computed for, so a Save As recomputes it. */
export const noteCache = new Map<string, { root: Dir; note: FileHandle; path: string | null }>();
export const lookups = new Map<string, Lookup>();
export const urls = new Map<string, UrlEntry>();
export const noteTexts = new Map<string, NoteEntry>();
const adopting = new Map<string, Promise<boolean>>();
const listeners = new Set<() => void>();

let notifyQueued = false;
let missTimer: ReturnType<typeof setTimeout> | null = null;
let pruneTimer: ReturnType<typeof setTimeout> | null = null;
let storeSubscribed = false;
let windowListening = false;

/** Clears every cache and listener. Tests only: the module is otherwise a singleton for the page. */
export function resetAttachmentsForTest(): void {
  for (const entry of urls.values()) revoke(entry.url);
  rootByHandle.clear();
  rootStates.length = 0;
  stateByRoot = new WeakMap();
  noteCache.clear();
  lookups.clear();
  urls.clear();
  noteTexts.clear();
  adopting.clear();
  listeners.clear();
  if (missTimer !== null) clearTimeout(missTimer);
  missTimer = null;
  if (pruneTimer !== null) clearTimeout(pruneTimer);
  pruneTimer = null;
  notifyQueued = false;
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

function notify(): void {
  if (notifyQueued) return;
  notifyQueued = true;
  queueMicrotask(() => {
    notifyQueued = false;
    for (const listener of [...listeners]) {
      try {
        listener();
      } catch {
        // One broken view must not stop the others from updating.
      }
    }
  });
}

/**
 * Fires on a folder change, adopt, scan completion, rescan, miss-count change
 * and when the active document's handle, file handle or load id changes (a tab switch),
 * so views re-resolve against the right vault.
 */
export function subscribeAttachments(listener: () => void): () => void {
  listeners.add(listener);
  if (!storeSubscribed) {
    storeSubscribed = true;
    useStore.subscribe((state, prev) => {
      // restoreFileHandle sets the handle alone, after the tab already loaded without it.
      if (
        state.handleId !== prev.handleId ||
        state.loadId !== prev.loadId ||
        state.fileHandle !== prev.fileHandle
      ) {
        // The new render records what is still missing; counts from before the load are history.
        if (state.handleId !== prev.handleId || state.loadId !== prev.loadId) {
          clearMisses(state.handleId);
        }
        notify();
      }
      // A typo fixed or an embed deleted: the file it missed is no longer asked for.
      if (state.doc.markdown !== prev.doc.markdown) schedulePrune();
    });
  }
  installWindowListeners();
  return () => {
    listeners.delete(listener);
  };
}

function installWindowListeners(): void {
  if (windowListening || typeof window === 'undefined') return;
  windowListening = true;
  const onReturn = () => {
    for (const state of rootStates) state.stale = true;
    // Only the folder of the open document is worth walking again.
    const id = useStore.getState().handleId;
    const root = id ? rootByHandle.get(id) : undefined;
    const pending = root ? stateByRoot.get(root) : undefined;
    // No permission gate has run here, and a lapsed one would make the walk
    // see nothing and replace a good index with an empty one.
    void pending?.then(async (state) => {
      if ((await permissionOf(state.root, 'read')) === 'granted') await ensureScan(state);
    });
  };
  window.addEventListener('focus', onReturn);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') onReturn();
  });
}

// ---------------------------------------------------------------------------
// Root folder, permission, status
// ---------------------------------------------------------------------------

async function storedRoot(handleId: string): Promise<Dir | null> {
  const known = rootByHandle.get(handleId);
  if (known) return known;
  const stored = await getHandleAt<Dir>(imageFolderKey(handleId));
  if (stored?.kind !== 'directory') return null;
  rootByHandle.set(handleId, stored);
  return stored;
}

function newState(root: Dir): RootState {
  return {
    root,
    index: null,
    complete: false,
    truncated: false,
    completedAt: null,
    stale: false,
    scanning: null,
    info: null,
    added: [],
    walking: false,
    epoch: 0,
    truncatedNotified: false,
    misses: new Map(),
  };
}

export function rootStateFor(root: Dir): Promise<RootState> {
  const known = stateByRoot.get(root);
  if (known) return known;
  const made = (async () => {
    for (const state of rootStates) {
      if (state.root === root) return state;
      try {
        if (await state.root.isSameEntry(root)) return state;
      } catch {
        // Unreadable handle: treat as a different folder.
      }
    }
    const fresh = newState(root);
    rootStates.push(fresh);
    return fresh;
  })();
  stateByRoot.set(root, made);
  return made;
}

export type Gate =
  | { ok: true; rs: RootState; root: Dir; notePath: string; handleId: string }
  | {
      ok: false;
      status: Exclude<AttachmentStatus, { kind: 'ready' }>;
      root?: Dir;
    };

const fail = (status: Exclude<AttachmentStatus, { kind: 'ready' }>, root?: Dir): Gate =>
  root ? { ok: false, status, root } : { ok: false, status };

/**
 * Whether attachments can be used for this document right now, and the folder
 * state to use if so. Permission is decided before any call that reads the
 * folder, because reading without it throws or prompts. Never prompts.
 */
export async function gate(ctx: DocContext): Promise<Gate> {
  if (!attachmentsSupported()) return fail({ kind: 'unsupported' });
  const { fileHandle, handleId } = ctx;
  if (!fileHandle || !handleId) return fail({ kind: 'no-note-file' });
  let root = await storedRoot(handleId);
  if (!root && (await adoptKnownRoot(ctx))) root = await storedRoot(handleId);
  if (!root) return fail({ kind: 'no-folder' });
  if ((await permissionOf(root, 'read')) !== 'granted') {
    return fail({ kind: 'needs-permission', folderName: root.name }, root);
  }
  let notePath: string | null;
  const cached = noteCache.get(handleId);
  if (cached && cached.root === root && cached.note === fileHandle) notePath = cached.path;
  else {
    try {
      notePath = await notePathIn(root, fileHandle);
    } catch {
      return fail({ kind: 'no-folder' }, root);
    }
    noteCache.set(handleId, { root, note: fileHandle, path: notePath });
  }
  // The folder does not contain this note (a mismatch): same as having none.
  if (notePath === null) return fail({ kind: 'no-folder' }, root);
  return { ok: true, rs: await rootStateFor(root), root, notePath, handleId };
}

export async function attachmentStatus(ctx: DocContext): Promise<AttachmentStatus> {
  const g = await gate(ctx);
  if (!g.ok) return g.status;
  const info = await rootInfo(g.rs);
  void ensureScan(g.rs);
  return {
    kind: 'ready',
    folderName: g.root.name,
    isVaultRoot: info.hasObsidian,
    misses: missesOf(g.rs, g.handleId),
    scanning: g.rs.scanning !== null,
  };
}

export const unavailable = (g: Extract<Gate, { ok: false }>): AttachmentUnavailable =>
  g.status.kind;

/**
 * Must run inside a click: showDirectoryPicker is the first call, with
 * nothing awaited before it, because the browser only allows it while the
 * user's click is fresh. The folder has to contain the note.
 */
export function chooseAttachmentFolder(ctx: DocContext): Promise<boolean> {
  const { fileHandle, handleId } = ctx;
  if (!attachmentsSupported() || !fileHandle || !handleId) return Promise.resolve(false);
  let picked: Promise<Dir>;
  try {
    picked = window.showDirectoryPicker?.({
      id: 'md-studio-images',
      mode: 'readwrite',
      startIn: fileHandle,
    }) as Promise<Dir>;
  } catch {
    return Promise.resolve(false);
  }
  return picked.then(
    async (root) => {
      let inside: string[] | null;
      try {
        inside = await root.resolve(fileHandle);
      } catch {
        inside = null;
      }
      if (!inside) {
        showToast(t('image.folderMismatch', { name: fileHandle.name }));
        return false;
      }
      await putHandleAt(imageFolderKey(handleId), root);
      invalidateAttachmentIndex(handleId, true);
      rootByHandle.set(handleId, root);
      const state = await rootStateFor(root);
      void ensureScan(state, true);
      notify();
      return true;
    },
    () => false
  ); // cancelled
}

/** For the banner's button: asks for access to the stored folder. Must run inside a click. */
export async function grantAttachmentAccess(ctx: DocContext): Promise<boolean> {
  if (!ctx.handleId) return false;
  const root = rootByHandle.get(ctx.handleId) ?? (await storedRoot(ctx.handleId));
  if (!root || !(await ensurePermission(root, 'readwrite'))) return false;
  // Forced: a scan that ran without permission left an empty index that the throttles would keep.
  void ensureScan(await rootStateFor(root), true);
  notify();
  return true;
}

/**
 * Uses a folder already chosen for another document when it contains this
 * note, so opening a second note of a vault shows its attachments with no
 * prompt. Prefers a folder holding .obsidian (the vault root), else the
 * outermost one. Only folders whose permission is already granted qualify.
 */
export function adoptKnownRoot(ctx: DocContext): Promise<boolean> {
  const { fileHandle, handleId } = ctx;
  if (!fileHandle || !handleId) return Promise.resolve(false);
  const running = adopting.get(handleId);
  if (running) return running;
  const work = adoptFrom(fileHandle, handleId).finally(() => adopting.delete(handleId));
  adopting.set(handleId, work);
  return work;
}

async function adoptFrom(note: FileHandle, handleId: string): Promise<boolean> {
  let best: { root: Dir; vault: boolean; depth: number } | null = null;
  for (const [, handle] of await listHandlesWithPrefix('dir:')) {
    if (handle.kind !== 'directory') continue;
    const root = handle as Dir;
    try {
      if ((await permissionOf(root, 'read')) !== 'granted') continue;
      const inside = await root.resolve(note);
      if (!inside) continue;
      const candidate = {
        root,
        vault: await hasDirectory(root, '.obsidian'),
        depth: inside.length,
      };
      if (
        !best ||
        (candidate.vault && !best.vault) ||
        (candidate.vault === best.vault && candidate.depth > best.depth)
      ) {
        best = candidate;
      }
    } catch {
      // A handle that throws is not a match.
    }
  }
  if (!best) return false;
  await putHandleAt(imageFolderKey(handleId), best.root);
  rootByHandle.set(handleId, best.root);
  noteCache.delete(handleId);
  notify();
  return true;
}

/** Save As: the new document keeps the folder when that folder holds the new note too. */
export async function adoptAttachmentFolder(
  fromHandleId: string,
  toHandleId: string,
  noteHandle: FileSystemFileHandle
): Promise<void> {
  try {
    const root = await storedRoot(fromHandleId);
    if (!root || !(await root.resolve(noteHandle))) return;
    // Save As onto a file that is already known keeps the folder it chose for itself.
    const own = await storedRoot(toHandleId);
    if (own && (await own.resolve(noteHandle))) return;
    invalidateAttachmentIndex(toHandleId, true);
    await putHandleAt(imageFolderKey(toHandleId), root);
    rootByHandle.set(toHandleId, root);
    noteCache.delete(toHandleId);
    notify();
  } catch {
    // The new document simply starts without a folder.
  }
}

/** Forgets what is cached for a document, e.g. after its folder changed. */
export function invalidateAttachmentIndex(handleId: string, revokeUrls = false): void {
  rootByHandle.delete(handleId);
  noteCache.delete(handleId);
  const prefix = `${handleId}\0`;
  for (const key of lookups.keys()) if (key.startsWith(prefix)) lookups.delete(key);
  for (const key of noteTexts.keys()) if (key.startsWith(prefix)) noteTexts.delete(key);
  if (!revokeUrls) return;
  for (const [key, entry] of urls) {
    if (entry.handleId !== handleId) continue;
    revoke(entry.url);
    urls.delete(key);
  }
}

// ---------------------------------------------------------------------------
// Vault configuration and scan
// ---------------------------------------------------------------------------

export function rootInfo(rs: RootState): Promise<RootInfo> {
  if (!rs.info) {
    const loading = loadInfo(rs.root);
    rs.info = loading;
    // A failed read is no answer: ask again next time instead of caching "not a vault".
    void loading.then((info) => {
      if (info.transient && rs.info === loading) rs.info = null;
    });
  }
  return rs.info;
}

/** Only these say the thing is not there; anything else (denied, locked, I/O) may pass. */
const isAbsent = (error: unknown): boolean =>
  error instanceof DOMException &&
  (error.name === 'NotFoundError' || error.name === 'TypeMismatchError');

/**
 * No .obsidian directory means a plain folder (the legacy behaviour, null
 * config). With one, app.json supplies the rules, and a missing or broken
 * file means Obsidian's own defaults.
 */
async function loadInfo(root: Dir): Promise<RootInfo> {
  let obsidian: Dir;
  try {
    obsidian = await root.getDirectoryHandle('.obsidian');
  } catch (error) {
    if (isAbsent(error)) return { hasObsidian: false, config: null };
    return { hasObsidian: false, config: null, transient: true };
  }
  try {
    const file = await (await obsidian.getFileHandle('app.json')).getFile();
    return {
      hasObsidian: true,
      config: parseVaultConfig(await file.text()) ?? DEFAULT_VAULT_CONFIG,
    };
  } catch (error) {
    if (isAbsent(error)) return { hasObsidian: true, config: DEFAULT_VAULT_CONFIG };
    return { hasObsidian: true, config: DEFAULT_VAULT_CONFIG, transient: true };
  }
}

export const imagesRule = () => useStore.getState().settings.attachmentRules === 'images';

/** The images-folder rule opts out of vault behaviour even inside a vault. */
export async function configFor(rs: RootState): Promise<VaultConfig | null> {
  if (imagesRule()) return null;
  return (await rootInfo(rs)).config;
}

/**
 * Starts (or joins) a scan of the folder. A finished index is only walked
 * again when forced, or after a refocus once FOCUS_RESCAN_MS has passed since
 * the last scan ended. Never two scans of one folder at once.
 */
export function ensureScan(rs: RootState, force = false): Promise<void> {
  if (rs.scanning) return rs.scanning;
  if (rs.completedAt !== null && !force) {
    const idle = Date.now() - rs.completedAt;
    if (!rs.stale || idle < FOCUS_RESCAN_MS) return Promise.resolve();
  }
  installWindowListeners();
  rs.scanning = scan(rs).finally(() => {
    rs.scanning = null;
  });
  return rs.scanning;
}

export function rescanAfterMiss(rs: RootState): void {
  if (rs.scanning || rs.completedAt === null) return;
  if (Date.now() - rs.completedAt >= MISS_RESCAN_MS) void ensureScan(rs, true);
}

/**
 * Walks the folder breadth first, so the shallow files that links most often
 * name are indexed before the cap can cut anything off. The index in use
 * keeps serving during a rescan; only the first scan publishes partial ones.
 */
async function scan(rs: RootState): Promise<void> {
  const rescan = rs.completedAt !== null;
  rs.stale = false;
  rs.walking = true;
  if (rescan) rs.info = null; // app.json may have changed
  const found: string[] = [];
  /** Folders that could not be listed; a rescan keeps what it knew under them. */
  const unlisted: string[] = [];
  let truncated = false;
  let seen = 0;
  const queue: Array<{ dir: Dir; prefix: string; depth: number }> = [
    { dir: rs.root, prefix: '', depth: 0 },
  ];
  walk: for (let i = 0; i < queue.length; i += 1) {
    const { dir, prefix, depth } = queue[i] as (typeof queue)[number];
    // Per folder, so one that cannot be listed (removed since its parent was read,
    // or access refused) is skipped and the rest of the vault is still indexed.
    try {
      const entries = listable(dir).values?.();
      if (!entries) continue;
      for await (const entry of entries) {
        seen += 1;
        if (seen % YIELD_EVERY === 0) await macrotask();
        const name = entry.name;
        if (name.startsWith('.') || name === 'node_modules') continue;
        if (entry.kind === 'directory') {
          if (depth < MAX_SCAN_DEPTH) {
            queue.push({ dir: entry as Dir, prefix: `${prefix}${name}/`, depth: depth + 1 });
          }
          continue;
        }
        if (found.length >= MAX_SCAN_FILES) {
          truncated = true;
          break walk;
        }
        found.push(`${prefix}${name}`);
        if (found.length % PARTIAL_EVERY === 0 && !rs.complete) {
          rs.index = buildVaultIndex([...found, ...rs.added]);
        }
      }
    } catch (error) {
      // Unreadable folder: index the files seen in it and go on with the next one.
      // A folder that is simply gone has nothing to keep.
      if (!(error instanceof DOMException && error.name === 'NotFoundError')) unlisted.push(prefix);
    }
  }
  // A partial walk must not shrink a good index: keep its entries under the folders it missed.
  const kept =
    unlisted.length === 0
      ? []
      : (rs.index?.paths ?? []).filter((p) => unlisted.some((prefix) => p.startsWith(prefix)));
  rs.index = buildVaultIndex([...found, ...kept, ...rs.added]);
  rs.added = [];
  rs.truncated = truncated;
  rs.complete = true;
  rs.completedAt = Date.now();
  // Retry on the next look once the throttle allows, instead of treating the gap as final.
  rs.stale = unlisted.length > 0;
  rs.walking = false;
  rs.epoch += 1;
  // Targets that were missing may exist now; views re-resolve and record what is still missing.
  rs.misses.clear();
  if (truncated && !rs.truncatedNotified) {
    rs.truncatedNotified = true;
    showToast(t('attachment.indexTruncated', { count: String(MAX_SCAN_FILES) }));
  }
  notify();
}

export async function getVault(
  ctx: DocContext,
  opts?: { complete?: boolean }
): Promise<VaultSnapshot | null> {
  const g = await gate(ctx);
  if (!g.ok) return null;
  const scanning = ensureScan(g.rs);
  if (opts?.complete && !g.rs.complete) await scanning;
  return {
    index: g.rs.index ?? buildVaultIndex([]),
    config: await configFor(g.rs),
    notePath: g.notePath,
    truncated: g.rs.truncated,
    complete: g.rs.complete,
  };
}

export async function noteRelativePath(ctx: DocContext): Promise<string | null> {
  const g = await gate(ctx);
  return g.ok ? g.notePath : null;
}

/** Rescan on demand: ignores the throttles, joins a scan already running. */
export async function refreshAttachments(ctx: DocContext): Promise<void> {
  const g = await gate(ctx);
  if (!g.ok) return;
  if (!g.rs.scanning) g.rs.info = null;
  // Cached note text stays: readNoteText revalidates it against the file, so views never drop to a loading chip.
  await ensureScan(g.rs, true);
}

export function scheduleMissNotify(): void {
  if (missTimer !== null) return;
  // Debounced: a note full of broken embeds reports once, not once per embed.
  missTimer = setTimeout(() => {
    missTimer = null;
    notify();
  }, MISS_NOTIFY_MS);
}

export function recordMiss(rs: RootState, key: string, target: string, own: boolean): void {
  if (rs.misses.has(key)) return;
  rs.misses.set(key, { target, own });
  scheduleMissNotify();
}

/**
 * A view only reports what it asks for, never what it stopped asking for, so
 * a miss would outlive the embed that caused it. The note's own text is the
 * authority: a miss whose target no longer appears in it is history.
 */
function schedulePrune(): void {
  if (pruneTimer !== null) return;
  // Not reset by each keystroke: a long burst of typing still gets checked.
  pruneTimer = setTimeout(() => {
    pruneTimer = null;
    pruneMisses();
  }, MISS_NOTIFY_MS * 2);
}

/** Markdown unescaped and lower-cased, so a path is found however the source spells it. */
const searchable = (markdown: string): string =>
  markdown.replace(/\\([!-/:-@[-`{-~])/g, '$1').toLowerCase();

/**
 * Whether the text could still hold this target. Deliberately generous (a
 * substring, raw or percent-encoded): keeping a stale miss costs a banner
 * that clears on the next scan, dropping a live one hides a real problem.
 */
function mentions(text: string, target: string): boolean {
  return text.includes(target.toLowerCase()) || text.includes(encodeURI(target).toLowerCase());
}

function pruneMisses(): void {
  const { handleId, doc } = useStore.getState();
  if (handleId === null) return;
  const prefix = `${handleId}\0`;
  let text: string | null = null;
  let removed = false;
  for (const rs of rootStates) {
    for (const [key, miss] of rs.misses) {
      if (!miss.own || !key.startsWith(prefix)) continue;
      text ??= searchable(doc.markdown);
      if (mentions(text, miss.target)) continue;
      rs.misses.delete(key);
      removed = true;
    }
  }
  if (removed) notify();
}

function missesOf(rs: RootState, handleId: string): number {
  const prefix = `${handleId}\0`;
  let count = 0;
  for (const key of rs.misses.keys()) if (key.startsWith(prefix)) count += 1;
  return count;
}

function clearMisses(handleId: string | null): void {
  if (handleId === null) return;
  const prefix = `${handleId}\0`;
  for (const rs of rootStates) {
    for (const key of [...rs.misses.keys()]) if (key.startsWith(prefix)) rs.misses.delete(key);
  }
}
