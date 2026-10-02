/**
 * Reading and writing real .md files.
 *
 * Chromium (Windows/desktop Chrome and Edge, installed PWA) gets the File
 * System Access API: a handle is kept so Save writes back to the same file.
 * Everywhere else (Firefox, Safari, mobile) falls back to an <input
 * type=file> picker for open and a download for save.
 */

export const MARKDOWN_TYPES: FilePickerAcceptType[] = [
  {
    description: 'Markdown',
    accept: { 'text/markdown': ['.md', '.markdown', '.mdown', '.mkd'] },
  },
];

export type OpenedFile = {
  name: string;
  markdown: string;
  handle: FileSystemFileHandle | null;
};

const isAbort = (err: unknown) => err instanceof DOMException && err.name === 'AbortError';

export async function readHandle(handle: FileSystemFileHandle): Promise<OpenedFile> {
  const file = await handle.getFile();
  return { name: file.name, markdown: await file.text(), handle };
}

/** Resolves to null when the user cancels the picker. */
export async function openFile(): Promise<OpenedFile | null> {
  if (window.showOpenFilePicker) {
    try {
      const [handle] = await window.showOpenFilePicker({ types: MARKDOWN_TYPES, id: 'md-studio' });
      return handle ? await readHandle(handle) : null;
    } catch (err) {
      if (isAbort(err)) return null;
      throw err;
    }
  }
  return openWithInput();
}

function openWithInput(): Promise<OpenedFile | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.md,.markdown,.mdown,.mkd,text/markdown,text/plain';
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      file.text().then((markdown) => resolve({ name: file.name, markdown, handle: null }), reject);
    });
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });
}

export type SaveResult = {
  kind: 'written' | 'downloaded';
  name: string;
  handle: FileSystemFileHandle | null;
};

/**
 * Writes to `handle` when there is one; otherwise asks for a location
 * (Save As). Resolves to null when the user cancels.
 */
export async function saveFile(
  markdown: string,
  suggestedName: string,
  handle: FileSystemFileHandle | null
): Promise<SaveResult | null> {
  let target = handle;
  if (!target && window.showSaveFilePicker) {
    try {
      target = await window.showSaveFilePicker({
        types: MARKDOWN_TYPES,
        suggestedName,
        id: 'md-studio',
      });
    } catch (err) {
      if (isAbort(err)) return null;
      throw err;
    }
  }
  if (target) {
    const writable = await target.createWritable();
    await writable.write(markdown);
    await writable.close();
    return { kind: 'written', name: target.name, handle: target };
  }
  downloadText(markdown, suggestedName, 'text/markdown');
  return { kind: 'downloaded', name: suggestedName, handle: null };
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function downloadText(content: string, fileName: string, type: string): void {
  downloadBlob(new Blob([content], { type: `${type};charset=utf-8` }), fileName);
}

/**
 * Writes a separate file (an export): asks where on Chromium, downloads
 * elsewhere. Never touches the document's own file handle. Resolves to
 * null when the user cancels.
 */
export async function saveBlobAs(
  blob: Blob,
  suggestedName: string,
  type: { description: string; mime: string; extension: string }
): Promise<SaveResult | null> {
  if (window.showSaveFilePicker) {
    let target: FileSystemFileHandle;
    try {
      target = await window.showSaveFilePicker({
        suggestedName,
        id: 'md-studio-export',
        types: [{ description: type.description, accept: { [type.mime]: [type.extension] } }],
      });
    } catch (err) {
      if (isAbort(err)) return null;
      throw err;
    }
    const writable = await target.createWritable();
    await writable.write(blob);
    await writable.close();
    return { kind: 'written', name: target.name, handle: target };
  }
  downloadBlob(blob, suggestedName);
  return { kind: 'downloaded', name: suggestedName, handle: null };
}
