/**
 * Pasted and dropped files.
 *
 * With the document saved on disk in Edge/Chrome, files go into the document's
 * attachment folder (see attachments.ts) and are linked by the style the
 * vault or the settings ask for, so the Markdown stays small and portable
 * along with its folder. That needs the folder itself: browsers don't reveal
 * a file's parent folder, so the user picks it once and the handle is kept.
 * Everywhere else, or if they decline, an image is shrunk and embedded as a
 * data URL, which travels inside the file; other files cannot be embedded and
 * are not inserted.
 */
import type { EmbedKind } from '@/domain/embeds';
import type { AttachmentOrigin } from '@/domain/vaultConfig';
import { t } from '@/i18n';
import { useStore } from '@/store';
import { requestConfirm, showToast } from '@/store/ui';
import {
  attachmentStatus,
  attachmentsSupported,
  chooseAttachmentFolder,
  currentDocContext,
  saveAttachment,
} from './attachments';

/** Longest side of embedded images; larger ones are scaled down. */
const MAX_EMBED_SIDE = 1600;
/** Embedded images over this size get a warning: the Markdown file grows with them. */
const LARGE_EMBED = 1_000_000;

/** Documents (by handle id) whose user chose embedding this session. */
const embedChosen = new Set<string>();

async function shrink(file: File): Promise<Blob> {
  // Vector and animated images would lose everything that makes them so.
  if (file.type === 'image/svg+xml' || file.type === 'image/gif') return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EMBED_SIDE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 400_000) return file;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const encode = (type: string) =>
      new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.85));
    const webp = await encode('image/webp');
    const out = webp?.type === 'image/webp' ? webp : await encode('image/jpeg');
    return out && out.size < file.size ? out : file;
  } catch {
    return file;
  }
}

const toDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

export type PlacedAttachment =
  | { via: 'wikilink'; raw: string; kind: EmbedKind }
  | { via: 'markdown'; src: string; alt: string; kind: EmbedKind; text: string }
  | { via: 'data'; src: string; alt: string; kind: 'image'; text: string };

const isImage = (file: File) => file.type.startsWith('image/');

const escapeAlt = (alt: string) => alt.replace(/[\\[\]]/g, '\\$&');

/** Destination and alt of a `![alt](dest)` or `[label](dest)` link written by saveAttachment. */
function parseMarkdownLink(text: string): { src: string; alt: string } {
  const match = /^!?\[((?:\\.|[^\]\\])*)\]\((.*)\)$/s.exec(text);
  if (!match) return { src: text, alt: '' };
  return { src: match[2] ?? '', alt: (match[1] ?? '').replace(/\\([\\[\]|])/g, '$1') };
}

function placed(markdown: string, kind: EmbedKind): PlacedAttachment {
  if (markdown.startsWith('![[')) return { via: 'wikilink', raw: markdown, kind };
  return { via: 'markdown', ...parseMarkdownLink(markdown), kind, text: markdown };
}

/** Why a file that cannot be embedded was not added, so the user knows what to do about it. */
function skipMessage(reason: string): string {
  switch (reason) {
    case 'needs-permission':
      return t('attachment.needsPermission');
    case 'no-folder':
      return t('attachment.noFolder');
    case 'no-note-file':
      return t('attachment.noNoteFile');
    default:
      return t('attachment.saveUnsupported');
  }
}

/**
 * Saves each file to the attachment folder when it can and hands `insert` the
 * link to put in the document. When it cannot, an image is embedded instead
 * and anything else is skipped with a toast that says why.
 */
export async function placeFiles(
  files: File[],
  origin: AttachmentOrigin,
  insert: (p: PlacedAttachment) => void
): Promise<void> {
  const ctx = currentDocContext();
  const { loadId } = useStore.getState();
  // Saving or asking takes time, and both panes reuse one editor across
  // tabs: if another document is showing by now, the file isn't inserted
  // into it (its link would also point next to the first document).
  const stillHere = () => {
    if (useStore.getState().loadId === loadId) return true;
    showToast(t('image.documentChanged'));
    return false;
  };
  for (const file of files) {
    try {
      let status = await attachmentStatus(ctx);
      // First image in a document with no folder yet: ask once, as before.
      if (
        status.kind === 'no-folder' &&
        isImage(file) &&
        ctx.fileHandle &&
        ctx.handleId &&
        !embedChosen.has(ctx.handleId)
      ) {
        const useFolder = await requestConfirm({
          title: t('image.folderTitle'),
          body: t('image.folderBody', { name: ctx.fileHandle.name }),
          confirmLabel: t('image.folderChoose'),
        });
        if (useFolder) {
          if (await chooseAttachmentFolder(ctx)) status = await attachmentStatus(ctx);
        } else embedChosen.add(ctx.handleId);
      }
      let reason: string = status.kind;
      if (status.kind === 'ready' || status.kind === 'needs-permission') {
        const result = await saveAttachment(ctx, file, origin);
        if (result.ok) {
          if (!stillHere()) return;
          insert(placed(result.saved.markdown, result.saved.kind));
          continue;
        }
        reason = result.reason;
      }
      if (!isImage(file)) {
        showToast(skipMessage(reason));
        continue;
      }
      const alt = file.name.replace(/\.[^.]+$/, '') || 'image';
      const src = await toDataUrl(await shrink(file));
      if (!stillHere()) return;
      insert({ via: 'data', src, alt, kind: 'image', text: `![${escapeAlt(alt)}](${src})` });
      if (src.length > LARGE_EMBED) showToast(t('image.largeEmbed'));
      if (reason === 'needs-permission' || reason === 'failed') {
        showToast(t('attachment.imageFallback', { reason }));
      }
    } catch {
      showToast(t('image.failed'));
    }
  }
}

/**
 * Dropped files are taken over when any is an image (it can always be embedded;
 * placeFiles toasts for the others it cannot save), or when they can be saved
 * to a folder.
 */
export function isHandledDrop(files: readonly File[]): boolean {
  return files.length === 0 || files.some(isImage) || attachmentsSupported();
}
