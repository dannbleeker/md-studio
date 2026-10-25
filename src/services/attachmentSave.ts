/**
 * Saving a pasted or dropped file into the vault: where the rules say, under
 * a name no other file or concurrent save has, then the link text for it.
 * Callers import saveAttachment from attachments.ts.
 */
import { classifyTarget } from '@/domain/embeds';
import {
  type AttachmentOrigin,
  attachmentDirectory,
  attachmentFileName,
  DEFAULT_VAULT_CONFIG,
  effectiveLinkStyle,
  formatAttachmentLink,
} from '@/domain/vaultConfig';
import { addToIndex, buildVaultIndex, fold } from '@/domain/vaultIndex';
import { t } from '@/i18n';
import { useStore } from '@/store';
import { showToast } from '@/store/ui';
import {
  ensureScan,
  type Gate,
  gate,
  imagesRule,
  LINK_SCAN_WAIT_MS,
  type RootState,
  rootInfo,
} from './attachmentCore';
import type { DocContext, SaveResult } from './attachmentTypes';
import { exists, listable, writeFile } from './dirHandles';
import { ensurePermission } from './handleStore';

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
