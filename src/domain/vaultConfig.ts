/**
 * Obsidian vault conventions for attachments: which folder new files go to,
 * what they are called, and how links to them are written. Pure. The caller
 * reads .obsidian/app.json and passes the result in, so nothing here touches
 * storage or the DOM.
 *
 * A null config means the folder has no .obsidian directory. Every helper then
 * keeps the behaviour from before vault support (an images folder beside the
 * note, standard Markdown links), so those users see no change.
 */
import { formatWikiEmbed } from './embedLinks';
import { classifyTarget, type EmbedKind, MEDIA_KINDS } from './embeds';
import { imageExtension, imageFileName, mimeExtension } from './imagePaths';
import {
  baseName,
  dirOf,
  extOf,
  joinPath,
  relativePath,
  shortestUniquePath,
  type VaultIndex,
} from './vaultIndex';

export type LinkStyle = 'wikilink' | 'markdown' | 'auto';
export type NewLinkFormat = 'shortest' | 'relative' | 'absolute';

export interface VaultConfig {
  /** '/' vault root, './' note folder, './sub' under the note folder, anything else a fixed folder. */
  attachmentFolderPath: string;
  useMarkdownLinks: boolean;
  newLinkFormat: NewLinkFormat;
}

export const DEFAULT_VAULT_CONFIG: VaultConfig = Object.freeze({
  attachmentFolderPath: '/',
  useMarkdownLinks: false,
  newLinkFormat: 'shortest',
});

const LINK_FORMATS: readonly NewLinkFormat[] = ['shortest', 'relative', 'absolute'];

/**
 * Reads the three settings this app uses. Anything else in app.json is ignored,
 * and a bad value only resets its own field, so one typo cannot drop the rest.
 */
export function parseVaultConfig(json: string | null): VaultConfig | null {
  if (json === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return DEFAULT_VAULT_CONFIG;
  }
  if (!isRecord(parsed)) return DEFAULT_VAULT_CONFIG;
  const folder = ownField(parsed, 'attachmentFolderPath');
  const markdown = ownField(parsed, 'useMarkdownLinks');
  const format = ownField(parsed, 'newLinkFormat');
  return {
    attachmentFolderPath:
      typeof folder === 'string' ? folder : DEFAULT_VAULT_CONFIG.attachmentFolderPath,
    useMarkdownLinks:
      typeof markdown === 'boolean' ? markdown : DEFAULT_VAULT_CONFIG.useMarkdownLinks,
    newLinkFormat: isLinkFormat(format) ? format : DEFAULT_VAULT_CONFIG.newLinkFormat,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Own properties only, so no key can ever be answered by the prototype chain. */
function ownField(obj: Record<string, unknown>, key: string): unknown {
  return Object.hasOwn(obj, key) ? obj[key] : undefined;
}

function isLinkFormat(value: unknown): value is NewLinkFormat {
  return LINK_FORMATS.some((format) => format === value);
}

/** An explicit setting wins; 'auto' follows the vault and falls back to Markdown links without one. */
export function effectiveLinkStyle(
  setting: LinkStyle,
  config: VaultConfig | null
): 'wikilink' | 'markdown' {
  if (setting !== 'auto') return setting;
  if (config === null) return 'markdown';
  return config.useMarkdownLinks ? 'markdown' : 'wikilink';
}

/**
 * Vault-relative folder that new attachments for `notePath` go to, with no
 * leading or trailing slash. '' is the vault root. A path that climbs out of
 * the vault also gives '', so nothing is ever written outside it.
 */
export function attachmentDirectory(config: VaultConfig | null, notePath: string): string {
  const noteFolder = joinPath(dirOf(notePath));
  if (noteFolder === null) return '';
  if (config === null) return joinPath(noteFolder, 'images') ?? '';
  const folder = config.attachmentFolderPath;
  if (folder === '/' || folder === '') return '';
  if (folder === '.' || folder === './') return noteFolder;
  if (folder.startsWith('./')) return joinPath(noteFolder, folder.slice(2)) ?? '';
  return joinPath(folder) ?? '';
}

export type AttachmentOrigin = 'paste' | 'drop';

const PASTED_PREFIX = 'Pasted image';
const MAX_NAME = 120;
const MAX_EXTENSION = 17; // with the dot: a longer "extension" is just part of the name
const NAME_RESERVED = new Set(['\\', '/', ':', '*', '?', '"', '<', '>', '|', '#', '^', '[', ']']);

/**
 * File name for a new attachment. Clipboard images get a timestamp name (or
 * the legacy image-YYYYMMDD-HHmmss name without a vault config); anything else
 * keeps its own name, sanitised. Collisions get " 1", " 2" and so on.
 */
export function attachmentFileName(
  file: { name: string; type: string },
  origin: AttachmentOrigin,
  now: Date,
  taken: (name: string) => boolean,
  config: VaultConfig | null
): string {
  if (origin === 'paste' && file.type.startsWith('image/')) {
    if (config === null) return imageFileName(now, imageExtension(file.type), taken);
    return uniqueName(`${PASTED_PREFIX} ${stamp(now)}.${clipboardExtension(file)}`, taken);
  }
  return uniqueName(withImageExtension(sanitizeName(file.name), file.type), taken);
}

/** Extensions that name the same bytes as the MIME type's usual one but that nothing shows as an image. */
const EXTENSION_ALIASES = new Set(['jfif', 'jfi', 'jpe', 'pjpeg', 'pjp', 'apng']);

/**
 * An image dragged out of a web page often arrives with no extension or an odd
 * one, and the link kind is read from the name, so it would be inserted as a
 * plain link instead of an image. The type says what it is: add its
 * extension, or swap a known alias (.jfif) for it. Types a browser cannot
 * show (HEIC, TIFF) only get one when the name has none.
 */
function withImageExtension(name: string, type: string): string {
  if (!type.toLowerCase().startsWith('image/') || classifyTarget(name) === 'image') return name;
  const ext = mimeExtension(type);
  if (ext === null) return name;
  const { stem, ext: own } = splitExtension(name);
  const showable = classifyTarget(`x.${ext}`) === 'image';
  if (own === '') return truncate(`${name}.${ext}`);
  if (showable && EXTENSION_ALIASES.has(own.slice(1).toLowerCase())) return `${stem}.${ext}`;
  return showable ? truncate(`${name}.${ext}`) : name;
}

/**
 * Extension for a clipboard image. imageExtension falls back to png for types
 * it does not know, so for those the file's own extension is used when it looks sane.
 */
function clipboardExtension(file: { name: string; type: string }): string {
  const byType = imageExtension(file.type);
  if (byType !== 'png' || file.type === 'image/png') return byType;
  const byName = extOf(file.name);
  return /^[a-z0-9]{1,8}$/.test(byName) ? byName : 'png';
}

/** Local time, zero padded: 20261012083005. Local so the name matches what the user sees on their clock. */
function stamp(when: Date): string {
  const pad = (n: number, width = 2) => String(n).padStart(width, '0');
  return [
    pad(when.getFullYear(), 4),
    pad(when.getMonth() + 1),
    pad(when.getDate()),
    pad(when.getHours()),
    pad(when.getMinutes()),
    pad(when.getSeconds()),
  ].join('');
}

function uniqueName(name: string, taken: (name: string) => boolean): string {
  if (!taken(name)) return name;
  const { stem, ext } = splitExtension(name);
  let candidate = name;
  for (let n = 1; taken(candidate); n++) candidate = `${stem} ${n}${ext}`;
  return candidate;
}

function splitExtension(name: string): { stem: string; ext: string } {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? { stem: name.slice(0, dot), ext: name.slice(dot) } : { stem: name, ext: '' };
}

/**
 * Makes a file name safe in a file system and in a wikilink or Markdown link:
 * reserved and control characters become dashes, whitespace runs collapse,
 * edge dots and spaces go. Case and non-ASCII letters are kept as typed.
 */
function sanitizeName(name: string): string {
  let cleaned = '';
  for (const ch of name) {
    const code = ch.codePointAt(0) ?? 0;
    const control = code < 0x20 || (code >= 0x7f && code <= 0x9f);
    cleaned += NAME_RESERVED.has(ch) || control ? '-' : ch;
  }
  const trimmed = truncate(cleaned.replace(/\s+/g, ' ').replace(/^[. ]+|[. ]+$/g, ''));
  return trimmed === '' ? 'attachment' : trimmed;
}

/** Cuts to MAX_NAME code points, keeping the extension when it is a plausible one. */
function truncate(name: string): string {
  if (Array.from(name).length <= MAX_NAME) return name;
  const { stem, ext } = splitExtension(name);
  const keep = ext.length <= MAX_EXTENSION ? ext : '';
  const room = MAX_NAME - Array.from(keep).length;
  const head = Array.from(keep === '' ? name : stem)
    .slice(0, room)
    .join('')
    .replace(/[. ]+$/, '');
  return `${head}${keep}`;
}

/**
 * Percent-encodes what would end or change a Markdown link destination, per
 * segment, and keeps the slashes. Non-ASCII stays readable. '&' and backslash
 * are encoded too: an entity or escape inside a destination would otherwise
 * change the path that is read back.
 */
const LINK_UNSAFE = /[%()<>[\]#?&\\\s]/g;

/** encodeURIComponent leaves parentheses alone, so they are escaped by hand. */
const encodeChar = (ch: string): string =>
  ch === '(' || ch === ')'
    ? `%${ch.charCodeAt(0).toString(16).toUpperCase()}`
    : encodeURIComponent(ch);

export function encodeLinkPath(path: string): string {
  return path
    .split('/')
    .map((segment) => segment.replace(LINK_UNSAFE, encodeChar))
    .join('/');
}

/** Alt text and link labels: brackets, backslash and pipe are escaped so the link parses as written. */
const escapeLabel = (text: string): string => text.replace(/[\\[\]|]/g, '\\$&');

/**
 * Link text for a new attachment. Wikilinks default to shortest, Markdown
 * links to note-relative (the old image behaviour), when there is no config.
 * Shortest drops '.md' for notes; the other two formats keep it.
 */
export function formatAttachmentLink(p: {
  style: 'wikilink' | 'markdown';
  config: VaultConfig | null;
  index: VaultIndex;
  targetPath: string;
  notePath: string | null;
  kind: EmbedKind;
  alt?: string;
}): string {
  const format: NewLinkFormat =
    p.config === null ? (p.style === 'wikilink' ? 'shortest' : 'relative') : p.config.newLinkFormat;
  const text = linkTarget(format, p.index, p.targetPath, p.notePath);
  if (p.style === 'wikilink') {
    return formatWikiEmbed({
      target: noteRelativeMark(format, text, p.notePath),
      alt: p.alt ?? null,
    });
  }
  const dest = encodeLinkPath(text);
  // A bang makes a media image; for other files and notes a bang would be wrong.
  if (MEDIA_KINDS.has(p.kind)) return `![${escapeLabel(p.alt ?? '')}](${dest})`;
  return `[${escapeLabel(p.alt ?? baseName(text))}](${dest})`;
}

/**
 * A bare wikilink name is looked up from the vault root first, so a root file
 * of the same name would win over the file beside the note. './' makes the
 * resolver start at the note. Markdown links already do, and a note in the
 * root has nothing to confuse.
 */
function noteRelativeMark(format: NewLinkFormat, text: string, notePath: string | null): string {
  if (format !== 'relative' || text.includes('/') || notePath === null) return text;
  return dirOf(notePath) === '' ? text : `./${text}`;
}

function linkTarget(
  format: NewLinkFormat,
  index: VaultIndex,
  targetPath: string,
  notePath: string | null
): string {
  if (format === 'shortest') return shortestUniquePath(index, targetPath);
  if (format === 'relative') {
    return relativePath(notePath === null ? '' : dirOf(notePath), targetPath);
  }
  return targetPath;
}
