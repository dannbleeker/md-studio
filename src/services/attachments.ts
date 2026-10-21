/**
 * Attachments of the open document: the folder the user chose, permission to
 * read it, a background index of its files, and object URLs, note text and
 * bytes read from it. Also where pasted and dropped files are saved.
 *
 * One folder per document is stored under the same IndexedDB key the image
 * folder always used (`dir:<handleId>`), so existing choices keep working and
 * pruneHandles needs no change. The folder must contain the note: links are
 * resolved from the note's place inside it. Chrome does not reveal a file's
 * parent folder, so the user picks it once (ideally the vault root) and we
 * keep the handle.
 *
 * Rendering is outside a user gesture, so nothing here prompts except the
 * functions documented as gesture-bound (chooseAttachmentFolder,
 * grantAttachmentAccess). Everything else reports a state and lets the caller
 * show a banner. No top-level window access: the module imports cleanly under
 * SSR and jsdom.
 */
import type { EmbedKind } from '@/domain/embeds';
import { classifyTarget, isAttachmentExtension } from '@/domain/embeds';
import {
  type AttachmentOrigin,
  attachmentDirectory,
  attachmentFileName,
  DEFAULT_VAULT_CONFIG,
  effectiveLinkStyle,
  formatAttachmentLink,
  parseVaultConfig,
  type VaultConfig,
} from '@/domain/vaultConfig';
import {
  addToIndex,
  baseName,
  buildVaultIndex,
  dirOf,
  extOf,
  fold,
  joinPath,
  resolveTarget,
  type VaultIndex,
} from '@/domain/vaultIndex';
import { t } from '@/i18n';
import { useStore } from '@/store';
import { showToast } from '@/store/ui';
import {
  ensurePermission,
  getHandleAt,
  imageFolderKey,
  listHandlesWithPrefix,
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
const MAX_URLS = 500;
/** Past MAX_URLS only the open document's URLs are kept, up to this many: they may be on screen. */
const MAX_URLS_ACTIVE = 4_000;
/** How long a save waits for the first scan before it links by full path instead. */
const LINK_SCAN_WAIT_MS = 2_000;
const MAX_LOOKUPS = 2_000;
const FILE_CONCURRENCY = 8;
const MAX_NOTE_BYTES = 2 * 1024 * 1024;
const NOTE_CACHE_ENTRIES = 20;
const NOTE_CACHE_CHARS = 4 * 1024 * 1024;

type Dir = FileSystemDirectoryHandle;
type FileHandle = FileSystemFileHandle;

export interface DocContext {
  fileHandle: FileSystemFileHandle | null;
  handleId: string | null;
}

export function currentDocContext(): DocContext {
  const { fileHandle, handleId } = useStore.getState();
  return { fileHandle, handleId };
}

export function attachmentsSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';
}

export type AttachmentStatus =
  | { kind: 'unsupported' }
  | { kind: 'no-note-file' }
  | { kind: 'no-folder' }
  | { kind: 'needs-permission'; folderName: string }
  | { kind: 'ready'; folderName: string; isVaultRoot: boolean; misses: number; scanning: boolean };

export type AttachmentUnavailable =
  | 'unsupported'
  | 'no-note-file'
  | 'no-folder'
  | 'needs-permission';

export interface VaultSnapshot {
  index: VaultIndex;
  config: VaultConfig | null;
  notePath: string | null;
  truncated: boolean;
  complete: boolean;
}

export type ResolvedAttachment =
  | { state: 'ok'; path: string; name: string; kind: EmbedKind; url: string; ambiguous: boolean }
  | { state: 'scanning' }
  | { state: 'missing'; rootLooksLikeVault: boolean; tooLarge?: true }
  | { state: 'unavailable'; reason: AttachmentUnavailable };

export interface ResolveOptions {
  /** undefined is the host note; null means no note to resolve from. */
  fromNotePath?: string | null;
  markdown?: boolean;
  /** Literal paths retried when the decoded one misses. */
  alternates?: readonly string[];
}

export type NoteRead =
  | {
      state: 'ok';
      path: string;
      text: string;
      lastModified: number;
      size: number;
      /** Several files share the name; the nearest was read. */
      ambiguous?: true;
    }
  | { state: 'scanning' }
  // tooLarge: the note exists but is over the embed size limit, which is not the same as not found.
  | { state: 'missing'; rootLooksLikeVault: boolean; tooLarge?: true }
  | { state: 'unavailable'; reason: AttachmentUnavailable };

export interface SavedAttachment {
  path: string;
  name: string;
  kind: EmbedKind;
  markdown: string;
}

export type SaveResult =
  | { ok: true; saved: SavedAttachment }
  | {
      ok: false;
      reason: 'unsupported' | 'no-note-file' | 'no-folder' | 'needs-permission' | 'failed';
    };

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
interface RootState {
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

interface Located {
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

interface NoteEntry {
  path: string;
  text: string;
  lastModified: number;
  size: number;
}

const rootByHandle = new Map<string, Dir>();
const rootStates: RootState[] = [];
let stateByRoot = new WeakMap<Dir, Promise<RootState>>();
/** Per document: the note handle the path was computed for, so a Save As recomputes it. */
const noteCache = new Map<string, { root: Dir; note: FileHandle; path: string | null }>();
const lookups = new Map<string, Lookup>();
const urls = new Map<string, UrlEntry>();
const noteTexts = new Map<string, NoteEntry>();
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
// Small helpers over the handle APIs
// ---------------------------------------------------------------------------

interface Listable {
  values?: () => AsyncIterable<FileSystemHandle>;
  keys?: () => AsyncIterable<string>;
}

/** lib.dom does not type the directory iterators; they exist in every browser that has the picker. */
const listable = (dir: Dir): Listable => dir as unknown as Listable;

const macrotask = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function revoke(url: string): void {
  try {
    URL.revokeObjectURL(url);
  } catch {
    // Already gone, or no such API.
  }
}

/** getFile calls in flight; a note with hundreds of embeds must not open hundreds of files at once. */
let active = 0;
const waiting: Array<() => void> = [];

async function limited<T>(run: () => Promise<T>): Promise<T> {
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

async function hasDirectory(root: Dir, name: string): Promise<boolean> {
  try {
    await root.getDirectoryHandle(name);
    return true;
  } catch {
    return false;
  }
}

async function fileAt(root: Dir, path: string): Promise<FileHandle | null> {
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

async function permissionOf(root: Dir, mode: 'read' | 'readwrite'): Promise<PermissionState> {
  try {
    // No permission model: just try, as handleStore does.
    return (await root.queryPermission?.({ mode })) ?? 'granted';
  } catch {
    return 'prompt';
  }
}

async function notePathIn(root: Dir, note: FileHandle): Promise<string | null> {
  const segments = await root.resolve(note);
  return segments ? segments.join('/') : null;
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

function rootStateFor(root: Dir): Promise<RootState> {
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

type Gate =
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
async function gate(ctx: DocContext): Promise<Gate> {
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

const unavailable = (g: Extract<Gate, { ok: false }>): AttachmentUnavailable => g.status.kind;

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

function rootInfo(rs: RootState): Promise<RootInfo> {
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

const imagesRule = () => useStore.getState().settings.attachmentRules === 'images';

/** The images-folder rule opts out of vault behaviour even inside a vault. */
async function configFor(rs: RootState): Promise<VaultConfig | null> {
  if (imagesRule()) return null;
  return (await rootInfo(rs)).config;
}

/**
 * Starts (or joins) a scan of the folder. A finished index is only walked
 * again when forced, or after a refocus once FOCUS_RESCAN_MS has passed since
 * the last scan ended. Never two scans of one folder at once.
 */
function ensureScan(rs: RootState, force = false): Promise<void> {
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

function rescanAfterMiss(rs: RootState): void {
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

function scheduleMissNotify(): void {
  if (missTimer !== null) return;
  // Debounced: a note full of broken embeds reports once, not once per embed.
  missTimer = setTimeout(() => {
    missTimer = null;
    notify();
  }, MISS_NOTIFY_MS);
}

function recordMiss(rs: RootState, key: string, target: string, own: boolean): void {
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

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

/**
 * Candidate file names for a target, most likely first. Mirrors the index's
 * rules: extensionless names and notes try '.md' first, a known attachment
 * extension is taken as is, any other extension ("Note v1.2") is tried as
 * given and then with '.md'.
 */
function nameVariants(name: string, note: boolean): string[] {
  const ext = extOf(name);
  if (ext === 'md') return [name];
  if (note || ext === '') return [`${name}.md`, name];
  if (isAttachmentExtension(ext)) return [name];
  return [name, `${name}.md`];
}

async function tryVariants(
  root: Dir,
  dir: string,
  relative: string,
  note: boolean
): Promise<Located | null> {
  for (const variant of nameVariants(relative, note)) {
    const path = joinPath(dir, variant);
    if (path === null || path === '') continue;
    const handle = await fileAt(root, path);
    if (handle) return { path, handle, ambiguous: false };
  }
  return null;
}

interface LocateOptions extends ResolveOptions {
  note?: boolean;
}

/**
 * Finds the file a target names, cheapest way first: handle walks that need
 * no index (so a link resolves before the scan ends), then the index.
 */
async function locate(
  g: Extract<Gate, { ok: true }>,
  target: string,
  from: string | null,
  o: LocateOptions
): Promise<Located | null> {
  const { root, rs } = g;
  const note = o.note === true;
  const names = [target, ...(o.alternates ?? [])];
  const noteDir = from === null ? null : dirOf(from);

  // Markdown links: relative to the note first, as images always were. Decoded
  // names are tried as given; the literal spelling comes through `alternates`.
  if (o.markdown && noteDir !== null) {
    for (const name of names) {
      const path = joinPath(noteDir, name);
      if (path === null || path === '') continue;
      const handle = await fileAt(root, path);
      if (handle) return { path, handle, ambiguous: false };
    }
  }

  if (!o.markdown) {
    const body = target.trim().replaceAll('\\', '/');
    if (body.includes('/')) {
      // ./ and ../ start at the note, anything else at the vault root.
      const dotted = body.startsWith('./') || body.startsWith('../');
      if (!dotted || noteDir !== null) {
        const direct = await tryVariants(root, dotted ? (noteDir ?? '') : '', body, note);
        if (direct) return direct;
      }
    } else if (body !== '' && !rs.complete) {
      // A finished index answers this with the nearest-file rule and an
      // ambiguity flag; before that, look where a bare name most likely is.
      const config = await configFor(rs);
      const dirs = [noteDir, config ? attachmentDirectory(config, from ?? g.notePath) : null, '']
        .filter((d): d is string => d !== null)
        .filter((d, i, all) => all.indexOf(d) === i);
      for (const dir of dirs) {
        const direct = await tryVariants(root, dir, body, note);
        if (direct) return direct;
      }
    }
  }

  const index = rs.index;
  if (!index) return null;
  for (const name of names) {
    const hit = resolveTarget(index, name, from, {
      ...(o.note ? { note: true } : {}),
      ...(o.markdown ? { markdown: true } : {}),
    });
    if (!hit) continue;
    const handle = await fileAt(root, hit.path);
    if (handle) return { path: hit.path, handle, ambiguous: hit.ambiguous };
  }
  return null;
}

type Found =
  | { kind: 'found'; g: Extract<Gate, { ok: true }>; located: Located; key: string }
  | { kind: 'scanning' }
  | { kind: 'missing'; rootLooksLikeVault: boolean }
  | { kind: 'unavailable'; reason: AttachmentUnavailable };

function lookupKey(
  handleId: string,
  target: string,
  from: string | null,
  o: LocateOptions
): string {
  return [
    handleId,
    from === null ? '\u0001null' : from,
    o.markdown ? 'md' : 'wiki',
    o.note ? 'note' : '',
    (o.alternates ?? []).join('\u0002'),
    target,
  ].join('\0');
}

function remember(key: string, located: Located, epoch: number): void {
  lookups.delete(key);
  lookups.set(key, { path: located.path, ambiguous: located.ambiguous, epoch });
  if (lookups.size > MAX_LOOKUPS) {
    const oldest = lookups.keys().next().value;
    if (oldest !== undefined) lookups.delete(oldest);
  }
}

async function find(ctx: DocContext, target: string, o: LocateOptions): Promise<Found> {
  const g = await gate(ctx);
  if (!g.ok) return { kind: 'unavailable', reason: unavailable(g) };
  // Free unless a refocus made the index stale; also starts the first scan.
  void ensureScan(g.rs);
  const from = o.fromNotePath === undefined ? g.notePath : o.fromNotePath;
  const key = lookupKey(g.handleId, target, from, o);
  const missKey = `${g.handleId}\0${from ?? ''}\0${target}`;
  const found = (located: Located): Found => {
    // A target that resolves again no longer counts against the banner.
    if (g.rs.misses.delete(missKey)) scheduleMissNotify();
    return { kind: 'found', g, located, key };
  };
  const cached = lookups.get(key);
  if (cached) {
    // An answer from before the last scan may be outdated: a nearer file or a duplicate can have appeared.
    const handle = cached.epoch === g.rs.epoch ? await fileAt(g.root, cached.path) : null;
    if (handle) {
      return found({ path: cached.path, ambiguous: cached.ambiguous, handle });
    }
    lookups.delete(key);
  }
  const epoch = g.rs.epoch;
  const located = await locate(g, target, from, o);
  if (located) {
    remember(key, located, epoch);
    return found(located);
  }
  // The index may not have reached this file yet.
  if (!g.rs.complete) return { kind: 'scanning' };
  recordMiss(g.rs, missKey, target, from === g.notePath);
  rescanAfterMiss(g.rs);
  return { kind: 'missing', rootLooksLikeVault: (await rootInfo(g.rs)).hasObsidian };
}

/**
 * An object URL for the file, reused while it is unchanged. A file that
 * changed on disk gets a new URL and the old one is revoked, so an edited
 * image shows its new content. Null when the file cannot be read.
 */
async function urlFor(handleId: string, located: Located): Promise<string | null> {
  let file: File;
  try {
    file = await limited(() => located.handle.getFile());
  } catch {
    return null;
  }
  const key = `${handleId}\0${located.path}`;
  const cached = urls.get(key);
  urls.delete(key);
  if (cached && cached.lastModified === file.lastModified && cached.size === file.size) {
    urls.set(key, cached); // most recently used goes last
    return cached.url;
  }
  if (cached) revoke(cached.url);
  const url = URL.createObjectURL(file);
  urls.set(key, { url, lastModified: file.lastModified, size: file.size, handleId });
  evictUrls(key);
  return url;
}

/**
 * Keeps the number of live object URLs bounded without breaking what is on
 * screen. Other documents' URLs go first, oldest first; the open document
 * keeps its own up to a much higher ceiling, because revoking one of those
 * blanks an image that is showing.
 */
function evictUrls(newest: string): void {
  if (urls.size <= MAX_URLS) return;
  const active = useStore.getState().handleId;
  for (const [key, entry] of urls) {
    if (urls.size <= MAX_URLS) return;
    if (key === newest || entry.handleId === active) continue;
    revoke(entry.url);
    urls.delete(key);
  }
  for (const [key, entry] of urls) {
    if (urls.size <= MAX_URLS_ACTIVE) return;
    if (key === newest) continue;
    revoke(entry.url);
    urls.delete(key);
  }
}

/**
 * Resolves a link target to a file and an object URL. Never prompts. A miss
 * while the index is still being built is 'scanning', never 'missing'.
 */
export async function resolveAttachment(
  ctx: DocContext,
  target: string,
  opts?: ResolveOptions
): Promise<ResolvedAttachment> {
  const found = await find(ctx, target, opts ?? {});
  if (found.kind === 'unavailable') return { state: 'unavailable', reason: found.reason };
  if (found.kind === 'scanning') return { state: 'scanning' };
  if (found.kind === 'missing')
    return { state: 'missing', rootLooksLikeVault: found.rootLooksLikeVault };
  const { g, located, key } = found;
  const url = await urlFor(g.handleId, located);
  if (url === null) {
    lookups.delete(key);
    return { state: 'missing', rootLooksLikeVault: (await rootInfo(g.rs)).hasObsidian };
  }
  return {
    state: 'ok',
    path: located.path,
    name: baseName(located.path),
    kind: classifyTarget(located.path),
    url,
    ambiguous: located.ambiguous,
  };
}

/** The note path last validated for this exact document, or undefined when unknown. */
function knownNotePath(ctx: DocContext): string | undefined {
  if (!ctx.handleId) return undefined;
  const cached = noteCache.get(ctx.handleId);
  return cached && cached.note === ctx.fileHandle && cached.path !== null ? cached.path : undefined;
}

/** Cache only, synchronous: lets a view draw its first frame without waiting. */
export function peekAttachment(
  ctx: DocContext,
  target: string,
  opts?: ResolveOptions
): ResolvedAttachment | undefined {
  const hostPath = knownNotePath(ctx);
  if (hostPath === undefined || !ctx.handleId) return undefined;
  const o = opts ?? {};
  const from = o.fromNotePath === undefined ? hostPath : o.fromNotePath;
  const hit = lookups.get(lookupKey(ctx.handleId, target, from, o));
  const entry = hit ? urls.get(`${ctx.handleId}\0${hit.path}`) : undefined;
  if (!hit || !entry) return undefined;
  return {
    state: 'ok',
    path: hit.path,
    name: baseName(hit.path),
    kind: classifyTarget(hit.path),
    url: entry.url,
    ambiguous: hit.ambiguous,
  };
}

// ---------------------------------------------------------------------------
// Note text and bytes
// ---------------------------------------------------------------------------

function storeNote(key: string, entry: NoteEntry): void {
  noteTexts.delete(key);
  noteTexts.set(key, entry);
  let chars = 0;
  for (const e of noteTexts.values()) chars += e.text.length;
  for (const [oldKey, e] of noteTexts) {
    if (noteTexts.size <= NOTE_CACHE_ENTRIES && chars <= NOTE_CACHE_CHARS) break;
    if (oldKey === key) continue;
    noteTexts.delete(oldKey);
    chars -= e.text.length;
  }
}

const noteOk = (e: NoteEntry, ambiguous = false): NoteRead => ({
  state: 'ok',
  ...e,
  ...(ambiguous ? { ambiguous: true as const } : {}),
});

async function readFound(
  handleId: string,
  located: Located,
  g: { rs: RootState }
): Promise<NoteRead> {
  const missing = async (tooLarge = false): Promise<NoteRead> => ({
    state: 'missing',
    rootLooksLikeVault: (await rootInfo(g.rs)).hasObsidian,
    ...(tooLarge ? { tooLarge: true as const } : {}),
  });
  let file: File;
  try {
    file = await limited(() => located.handle.getFile());
  } catch {
    return missing();
  }
  if (file.size > MAX_NOTE_BYTES) return missing(true);
  const key = `${handleId}\0${located.path}`;
  const cached = noteTexts.get(key);
  if (cached && cached.lastModified === file.lastModified && cached.size === file.size) {
    storeNote(key, cached);
    return noteOk(cached, located.ambiguous);
  }
  try {
    const entry = {
      path: located.path,
      text: await file.text(),
      lastModified: file.lastModified,
      size: file.size,
    };
    storeNote(key, entry);
    return noteOk(entry, located.ambiguous);
  } catch {
    return missing();
  }
}

/**
 * Text of the note a target names. An empty target is the current note: for
 * the host that is the live editor text (what is on screen, saved or not);
 * inside a transcluded note (`fromNotePath` set) it is that note's own file.
 */
export async function readNoteText(
  ctx: DocContext,
  target: string,
  opts?: { fromNotePath?: string | null }
): Promise<NoteRead> {
  const from = opts?.fromNotePath;
  if (target === '' && from === undefined) {
    const text = useStore.getState().doc.markdown;
    const path = (await noteRelativePath(ctx)) ?? '';
    return { state: 'ok', path, text, lastModified: Date.now(), size: text.length };
  }
  if (target === '') {
    const g = await gate(ctx);
    if (!g.ok) return { state: 'unavailable', reason: unavailable(g) };
    const handle = from ? await fileAt(g.root, from) : null;
    if (!from || !handle) {
      return { state: 'missing', rootLooksLikeVault: (await rootInfo(g.rs)).hasObsidian };
    }
    return readFound(g.handleId, { path: from, handle, ambiguous: false }, g);
  }
  const found = await find(ctx, target, {
    note: true,
    ...(from === undefined ? {} : { fromNotePath: from }),
  });
  if (found.kind === 'unavailable') return { state: 'unavailable', reason: found.reason };
  if (found.kind === 'scanning') return { state: 'scanning' };
  if (found.kind === 'missing')
    return { state: 'missing', rootLooksLikeVault: found.rootLooksLikeVault };
  return readFound(found.g.handleId, found.located, found.g);
}

export type NoteHandle =
  | { state: 'ok'; handle: FileSystemFileHandle; path: string }
  | { state: 'scanning' }
  | { state: 'missing' }
  | { state: 'unavailable'; reason: AttachmentUnavailable };

/** The file of the note a link names, for opening it in a tab. Never prompts. */
export async function resolveNoteHandle(
  ctx: DocContext,
  target: string,
  opts?: { markdown?: boolean }
): Promise<NoteHandle> {
  const found = await find(ctx, target, {
    note: true,
    ...(opts?.markdown ? { markdown: true } : {}),
  });
  if (found.kind === 'unavailable') return { state: 'unavailable', reason: found.reason };
  if (found.kind === 'scanning') return { state: 'scanning' };
  if (found.kind === 'missing') return { state: 'missing' };
  return { state: 'ok', handle: found.located.handle, path: found.located.path };
}

/** Cached note text for a first synchronous frame; may be older than the file. */
export function peekNoteRead(
  ctx: DocContext,
  target: string,
  opts?: { fromNotePath?: string | null }
): NoteRead | undefined {
  const from = opts?.fromNotePath;
  const hostPath = knownNotePath(ctx);
  if (target === '' && from === undefined) {
    const text = useStore.getState().doc.markdown;
    return {
      state: 'ok',
      path: hostPath ?? '',
      text,
      lastModified: Date.now(),
      size: text.length,
    };
  }
  if (hostPath === undefined || !ctx.handleId) return undefined;
  let path: string | undefined;
  let ambiguous = false;
  if (target === '') path = from ?? undefined;
  else {
    const hostRelative = from === undefined ? hostPath : from;
    const hit = lookups.get(
      lookupKey(ctx.handleId, target, hostRelative, {
        note: true,
        ...(from === undefined ? {} : { fromNotePath: from }),
      })
    );
    path = hit?.path;
    ambiguous = hit?.ambiguous ?? false;
  }
  const entry = path === undefined ? undefined : noteTexts.get(`${ctx.handleId}\0${path}`);
  return entry ? noteOk(entry, ambiguous) : undefined;
}

const MIME_BY_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf',
  svg: 'image/svg+xml',
  webp: 'image/webp',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  avif: 'image/avif',
  bmp: 'image/bmp',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  opus: 'audio/ogg',
  aac: 'audio/aac',
  flac: 'audio/flac',
  mp4: 'video/mp4',
  webm: 'video/webm',
  ogv: 'video/ogg',
  mov: 'video/quicktime',
  md: 'text/markdown',
};

/** Bytes of a vault file for export. No object URL is made. */
export async function readAttachmentBytes(
  ctx: DocContext,
  path: string
): Promise<{ bytes: Uint8Array; type: string } | null> {
  const g = await gate(ctx);
  if (!g.ok) return null;
  const handle = await fileAt(g.root, path);
  if (!handle) return null;
  try {
    const file = await limited(() => handle.getFile());
    return {
      bytes: new Uint8Array(await file.arrayBuffer()),
      type: file.type || MIME_BY_EXTENSION[extOf(path)] || 'application/octet-stream',
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Saving
// ---------------------------------------------------------------------------

/** Names being written right now, per vault and folder, so two saves at once cannot pick the same one. */
const inFlight = new WeakMap<object, Map<string, Set<string>>>();

function reservedNames(rs: object, folder: string): Set<string> {
  const folders = inFlight.get(rs) ?? new Map<string, Set<string>>();
  inFlight.set(rs, folders);
  const names = folders.get(folder) ?? new Set<string>();
  folders.set(folder, names);
  return names;
}

async function exists(dir: Dir, name: string): Promise<boolean> {
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
async function writeFile(dir: Dir, name: string, file: File): Promise<void> {
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

/**
 * Whether the index is complete enough to judge a name's uniqueness. Waits for
 * a scan under way, but not for long: a huge vault must not hold up a paste.
 */
async function settleIndex(rs: RootState): Promise<boolean> {
  if (rs.complete) return true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([
    ensureScan(rs),
    new Promise<void>((resolve) => {
      timer = setTimeout(resolve, LINK_SCAN_WAIT_MS);
    }),
  ]);
  clearTimeout(timer);
  return rs.complete;
}

/**
 * Saves a pasted or dropped file where the vault rules (or, without a vault,
 * the legacy `images` folder) say, and returns the text to link it. Never
 * throws; the reason says why nothing was saved.
 */
export async function saveAttachment(
  ctx: DocContext,
  file: File,
  origin: AttachmentOrigin
): Promise<SaveResult> {
  try {
    let g = await gate(ctx);
    if (!g.ok && g.status.kind === 'needs-permission' && g.root) {
      // Works inside a click; a drop may not carry the activation.
      if (!(await ensurePermission(g.root, 'readwrite'))) {
        return { ok: false, reason: 'needs-permission' };
      }
      g = await gate(ctx);
    }
    if (!g.ok) return { ok: false, reason: g.status.kind };
    if (!(await ensurePermission(g.root, 'readwrite'))) {
      return { ok: false, reason: 'needs-permission' };
    }
    return await write(g, file, origin);
  } catch {
    showToast(t('attachment.saveFailed', { name: file.name }));
    return { ok: false, reason: 'failed' };
  }
}

async function write(
  g: Extract<Gate, { ok: true }>,
  file: File,
  origin: AttachmentOrigin
): Promise<SaveResult> {
  const info = await rootInfo(g.rs);
  // Not knowing the rules is no licence to guess: the legacy folder would be the wrong place in a vault.
  if (info.transient && !imagesRule()) throw new Error('vault rules could not be read');
  const config = imagesRule() ? null : info.config;
  const folder = attachmentDirectory(config, g.notePath);
  let dir = g.root;
  for (const segment of folder.split('/').filter((s) => s !== '')) {
    dir = await dir.getDirectoryHandle(segment, { create: true });
  }
  // Names are compared folded and NFC-normalised: Windows and macOS file
  // systems treat Photo.JPG as photo.jpg, and Finder hands out NFD names.
  const taken = new Set<string>();
  const names = listable(dir).keys?.();
  if (names) for await (const name of names) taken.add(fold(name));
  const reserved = reservedNames(g.rs, folder);
  let name: string;
  let key: string;
  // The listing can be missing or stale, so each candidate is also probed in
  // the folder and checked against saves still in flight: create + write
  // would otherwise replace an existing file. The name is reserved before
  // the (async) probe so a second save cannot pick it meanwhile.
  for (;;) {
    name = attachmentFileName(
      file,
      origin,
      new Date(),
      (n) => taken.has(fold(n)) || reserved.has(fold(n)),
      config
    );
    key = fold(name);
    reserved.add(key);
    if (!(await exists(dir, name))) break;
    reserved.delete(key);
    taken.add(key);
  }
  try {
    await writeFile(dir, name, file);
  } finally {
    reserved.delete(key);
  }

  const path = folder === '' ? name : `${folder}/${name}`;
  // A scan under way may already have walked past the folder, so it gets told.
  if (g.rs.walking || !g.rs.complete) g.rs.added.push(path);
  const settled = await settleIndex(g.rs);
  const index = addToIndex(g.rs.index ?? buildVaultIndex([]), path);
  g.rs.index = index;
  const kind = classifyTarget(path);
  const style = effectiveLinkStyle(useStore.getState().settings.linkStyle, config);
  // Without a vault the alt text stays the file's base name, as it always was.
  // Wikilinks never get one: a numeric name would read as a size.
  const legacyAlt = config === null && style === 'markdown';
  const alt = legacyAlt ? file.name.replace(/\.[^.]+$/, '') || 'image' : undefined;
  // A bare name is only right if no other file in the vault shares it, which an unfinished index cannot say.
  const shortest =
    (config?.newLinkFormat ?? (style === 'wikilink' ? 'shortest' : 'relative')) === 'shortest';
  const linkConfig =
    settled || !shortest
      ? config
      : { ...(config ?? DEFAULT_VAULT_CONFIG), newLinkFormat: 'absolute' as const };
  const markdown = formatAttachmentLink({
    style,
    config: linkConfig,
    index,
    targetPath: path,
    notePath: g.notePath,
    kind,
    ...(alt === undefined ? {} : { alt }),
  });
  return { ok: true, saved: { path, name, kind, markdown } };
}
