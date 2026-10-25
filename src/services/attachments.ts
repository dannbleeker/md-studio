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
 *
 * This module is the service's one entry point and holds resolution and note
 * reading; the state, folder and scan are in attachmentCore, saving in
 * attachmentSave, the types in attachmentTypes and handle helpers in
 * dirHandles. Import from here, so a test's mock of this module covers all.
 */
import { classifyTarget, isAttachmentExtension } from '@/domain/embeds';
import { attachmentDirectory } from '@/domain/vaultConfig';
import { baseName, dirOf, extOf, joinPath, resolveTarget } from '@/domain/vaultIndex';
import { useStore } from '@/store';
import {
  configFor,
  ensureScan,
  type Gate,
  gate,
  type Located,
  lookups,
  MAX_LOOKUPS,
  MAX_NOTE_BYTES,
  MAX_URLS,
  MAX_URLS_ACTIVE,
  NOTE_CACHE_CHARS,
  NOTE_CACHE_ENTRIES,
  type NoteEntry,
  noteCache,
  noteRelativePath,
  noteTexts,
  type RootState,
  recordMiss,
  rescanAfterMiss,
  rootInfo,
  rootStateFor,
  scheduleMissNotify,
  unavailable,
  urls,
} from './attachmentCore';
import type {
  AttachmentUnavailable,
  DocContext,
  NoteRead,
  ResolvedAttachment,
  ResolveOptions,
} from './attachmentTypes';
import { fileAt, limited, revoke } from './dirHandles';

type Dir = FileSystemDirectoryHandle;

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
  opts?: { fromNotePath?: string | null; markdown?: boolean }
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
    ...(opts?.markdown ? { markdown: true } : {}),
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

/**
 * Folder mode: lists the files of a folder the user opened to browse, using
 * the same scan (and cap) as a note's vault folder. Needs read permission
 * already; never prompts. A finished scan is reused unless `force`.
 */
export async function scanFolder(
  root: FileSystemDirectoryHandle,
  force = false
): Promise<{ paths: readonly string[]; truncated: boolean }> {
  const rs = await rootStateFor(root);
  await ensureScan(rs, force);
  return { paths: rs.index?.paths ?? [], truncated: rs.truncated };
}

/** The file at a vault-relative path of a folder, or null. */
export const fileInFolder = (
  root: FileSystemDirectoryHandle,
  path: string
): Promise<FileSystemFileHandle | null> => fileAt(root, path);

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

export {
  adoptAttachmentFolder,
  adoptKnownRoot,
  attachmentStatus,
  attachmentsSupported,
  chooseAttachmentFolder,
  currentDocContext,
  getVault,
  grantAttachmentAccess,
  invalidateAttachmentIndex,
  noteRelativePath,
  refreshAttachments,
  resetAttachmentsForTest,
  subscribeAttachments,
} from './attachmentCore';
export { saveAttachment } from './attachmentSave';
export type {
  AttachmentStatus,
  AttachmentUnavailable,
  DocContext,
  NoteRead,
  ResolvedAttachment,
  ResolveOptions,
  SavedAttachment,
  SaveResult,
  VaultSnapshot,
} from './attachmentTypes';
