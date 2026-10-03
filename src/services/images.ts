/**
 * Pasted and dropped images.
 *
 * With the document saved on disk in Edge/Chrome, images go into an
 * `images` folder next to it and are linked by relative path, so the
 * Markdown stays small and portable along with its folder. That needs the
 * folder itself: browsers don't reveal a file's parent folder, so the user
 * picks it once per document (the picker opens there) and the handle is
 * kept. Everywhere else, or if they decline, the image is shrunk and
 * embedded as a data URL, which travels inside the file.
 */
import { imageExtension, imageFileName, relativeImagePath } from '@/domain/imagePaths';
import { t } from '@/i18n';
import { useStore } from '@/store';
import { requestConfirm, showToast } from '@/store/ui';
import { ensurePermission, getHandleAt, imageFolderKey, putHandleAt } from './handleStore';

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

/** The document's image folder, if one was chosen and access is (or can be) granted. */
export async function documentImageFolder(
  docHandleId: string,
  ask: boolean
): Promise<FileSystemDirectoryHandle | null> {
  const folder = await getHandleAt<FileSystemDirectoryHandle>(imageFolderKey(docHandleId));
  if (!folder) return null;
  if (!ask) return (await folder.queryPermission?.({ mode: 'read' })) === 'granted' ? folder : null;
  return (await ensurePermission(folder, 'readwrite')) ? folder : null;
}

async function chooseImageFolder(
  doc: FileSystemFileHandle,
  docHandleId: string
): Promise<FileSystemDirectoryHandle | null> {
  const picker = window.showDirectoryPicker;
  if (!picker) return null;
  try {
    const folder = await picker({ id: 'md-studio-images', mode: 'readwrite', startIn: doc });
    if (!(await folder.resolve(doc))) {
      showToast(t('image.folderMismatch', { name: doc.name }));
      return null;
    }
    await putHandleAt(imageFolderKey(docHandleId), folder);
    return folder;
  } catch {
    return null; // cancelled
  }
}

/** Saves into `images/` next to the document; returns the relative link. */
async function saveNextToDocument(
  folder: FileSystemDirectoryHandle,
  doc: FileSystemFileHandle,
  file: File
): Promise<string | null> {
  const docPath = await folder.resolve(doc);
  if (!docPath) return null;
  let dir = folder;
  for (const segment of docPath.slice(0, -1)) dir = await dir.getDirectoryHandle(segment);
  const images = await dir.getDirectoryHandle('images', { create: true });
  const existing = new Set<string>();
  for await (const name of (images as unknown as { keys(): AsyncIterable<string> }).keys()) {
    existing.add(name);
  }
  const name = imageFileName(new Date(), imageExtension(file.type), (n) => existing.has(n));
  const target = await images.getFileHandle(name, { create: true });
  const writable = await target.createWritable();
  await writable.write(file);
  await writable.close();
  return relativeImagePath(docPath, [...docPath.slice(0, -1), 'images', name]);
}

/**
 * Turns image files into Markdown image links: saved next to the document
 * when possible (asking for the folder the first time), else embedded.
 * `insert` receives each link's target URL and alt text.
 */
export async function placeImages(
  files: File[],
  insert: (src: string, alt: string) => void
): Promise<void> {
  const { fileHandle, handleId, loadId } = useStore.getState();
  // Saving or asking takes time, and both panes reuse one editor across
  // tabs: if another document is showing by now, the image isn't inserted
  // into it (its link would also point next to the first document).
  const stillHere = () => {
    if (useStore.getState().loadId === loadId) return true;
    showToast(t('image.documentChanged'));
    return false;
  };
  for (const file of files) {
    const alt = file.name.replace(/\.[^.]+$/, '') || 'image';
    try {
      if (fileHandle && handleId && window.showDirectoryPicker && !embedChosen.has(handleId)) {
        let folder = await documentImageFolder(handleId, true);
        if (!folder) {
          const useFolder = await requestConfirm({
            title: t('image.folderTitle'),
            body: t('image.folderBody', { name: fileHandle.name }),
            confirmLabel: t('image.folderChoose'),
          });
          if (useFolder) folder = await chooseImageFolder(fileHandle, handleId);
          else embedChosen.add(handleId);
        }
        if (folder) {
          const link = await saveNextToDocument(folder, fileHandle, file);
          if (link) {
            if (!stillHere()) return;
            insert(link, alt);
            continue;
          }
        }
      }
      const dataUrl = await toDataUrl(await shrink(file));
      if (!stillHere()) return;
      insert(dataUrl, alt);
      if (dataUrl.length > LARGE_EMBED) showToast(t('image.largeEmbed'));
    } catch {
      showToast(t('image.failed'));
    }
  }
}

const resolved = new Map<string, string>();

/**
 * Object URL for a relative image link in the open document, read from the
 * document's image folder. Null when there's no folder access (the visual
 * pane then shows the link's alt text). Never prompts: called while
 * rendering, outside a user gesture.
 */
export async function resolveRelativeImage(src: string): Promise<string | null> {
  const { fileHandle, handleId } = useStore.getState();
  if (!fileHandle || !handleId) return null;
  const key = `${handleId}|${src}`;
  const cached = resolved.get(key);
  if (cached) return cached;
  try {
    const folder = await documentImageFolder(handleId, false);
    const docPath = folder ? await folder.resolve(fileHandle) : null;
    if (!folder || !docPath) return null;
    const segments = [...docPath.slice(0, -1)];
    for (const part of src.split(/[?#]/)[0]!.split('/')) {
      if (part === '..') segments.pop();
      else if (part !== '.' && part !== '') segments.push(decodeURIComponent(part));
    }
    const name = segments.pop();
    if (!name) return null;
    let dir = folder;
    for (const segment of segments) dir = await dir.getDirectoryHandle(segment);
    const url = URL.createObjectURL(await (await dir.getFileHandle(name)).getFile());
    resolved.set(key, url);
    return url;
  } catch {
    return null;
  }
}
