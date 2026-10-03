import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDocument } from '@/domain/document';
import { resetStoreForTest, useStore } from '@/store';
import { useUiStore } from '@/store/ui';
import { placeImages } from './images';

const stored = new Map<string, unknown>();
vi.mock('./handleStore', () => ({
  getHandleAt: async (key: string) => stored.get(key) ?? null,
  putHandleAt: async (key: string, h: unknown) => {
    stored.set(key, h);
  },
  imageFolderKey: (id: string) => `dir:${id}`,
  ensurePermission: async () => true,
}));

type FakeFolder = {
  kind: 'directory';
  name: string;
  files: Map<string, Blob>;
  subdirs: Map<string, FakeFolder>;
  resolve(h: object): Promise<string[] | null>;
  getDirectoryHandle(n: string): Promise<FakeFolder>;
  getFileHandle(n: string): Promise<{ createWritable(): Promise<unknown> }>;
  keys(): AsyncGenerator<string>;
};

/** Minimal in-memory folder tree with the FileSystemDirectoryHandle calls images.ts uses. */
function folder(name: string, doc: object, docPath: string[] | null): FakeFolder {
  const files = new Map<string, Blob>();
  const subdirs = new Map<string, FakeFolder>();
  const dir: FakeFolder = {
    kind: 'directory',
    name,
    files,
    subdirs,
    resolve: async (h: object) => (h === doc ? docPath : null),
    getDirectoryHandle: async (n: string) => {
      if (!subdirs.has(n)) subdirs.set(n, folder(n, doc, null));
      return subdirs.get(n)!;
    },
    getFileHandle: async (n: string) => ({
      createWritable: async () => ({
        write: async (b: Blob) => {
          files.set(n, b);
        },
        close: async () => {},
      }),
    }),
    async *keys() {
      yield* files.keys();
    },
  };
  return dir;
}

const png = () => new File([new Uint8Array([137, 80, 78, 71])], 'shot.png', { type: 'image/png' });

describe('placeImages', () => {
  const docHandle = { kind: 'file', name: 'notes.md' } as unknown as FileSystemFileHandle;
  let inserted: Array<[string, string]>;
  const insert = (src: string, alt: string) => inserted.push([src, alt]);

  beforeEach(() => {
    stored.clear();
    inserted = [];
    resetStoreForTest();
    useUiStore.setState({ confirm: null, toasts: [] });
  });

  it('embeds when the document is not on disk', async () => {
    await placeImages([png()], insert);
    expect(inserted[0]?.[0]).toMatch(/^data:image\/png;base64,/);
    expect(inserted[0]?.[1]).toBe('shot');
  });

  it('saves into images/ next to the document once a folder is chosen', async () => {
    useStore.getState().loadDocument(createDocument('# x', 'notes.md'), docHandle, 'h1');
    const root = folder('docs', docHandle, ['notes.md']);
    window.showDirectoryPicker = vi.fn(async () => root as unknown as FileSystemDirectoryHandle);

    const first = placeImages([png()], insert);
    // The first image asks whether to use a folder.
    await vi.waitFor(() => expect(useUiStore.getState().confirm).not.toBeNull());
    useUiStore.getState().confirm?.resolve(true);
    await first;
    expect(inserted[0]?.[0]).toMatch(/^images\/image-\d{8}-\d{6}\.png$/);
    expect(root.subdirs.get('images')?.files.size).toBe(1);

    // The next one goes straight to the folder.
    await placeImages([png()], insert);
    expect(useUiStore.getState().confirm).toBeNull();
    expect(inserted[1]?.[0]).toMatch(/^images\/image-.*\.png$/);
    expect(root.subdirs.get('images')?.files.size).toBe(2);
  });

  it('does not insert into a document opened while the image was being placed', async () => {
    useStore.getState().loadDocument(createDocument('# x', 'notes.md'), docHandle, 'h1');
    window.showDirectoryPicker = vi.fn(
      async () => folder('docs', docHandle, ['notes.md']) as unknown as FileSystemDirectoryHandle
    );
    const placing = placeImages([png()], insert);
    await vi.waitFor(() => expect(useUiStore.getState().confirm).not.toBeNull());
    // The user switches to another document before answering.
    useStore.getState().loadDocument(createDocument('# other', 'other.md'), null);
    useUiStore.getState().confirm?.resolve(false);
    await placing;
    expect(inserted).toEqual([]);
    expect(useUiStore.getState().toasts.at(-1)?.message).toMatch(/another document/);
  });

  it('embeds, and stops asking, when the user declines the folder', async () => {
    useStore.getState().loadDocument(createDocument('# x', 'notes.md'), docHandle, 'h2');
    window.showDirectoryPicker = vi.fn();
    const first = placeImages([png()], insert);
    await vi.waitFor(() => expect(useUiStore.getState().confirm).not.toBeNull());
    useUiStore.getState().confirm?.resolve(false);
    await first;
    expect(inserted[0]?.[0]).toMatch(/^data:/);
    await placeImages([png()], insert);
    expect(useUiStore.getState().confirm).toBeNull();
    expect(window.showDirectoryPicker).not.toHaveBeenCalled();
  });

  it('refuses a folder that does not contain the document', async () => {
    useStore.getState().loadDocument(createDocument('# x', 'notes.md'), docHandle, 'h3');
    const elsewhere = folder('other', docHandle, null);
    window.showDirectoryPicker = vi.fn(
      async () => elsewhere as unknown as FileSystemDirectoryHandle
    );
    const first = placeImages([png()], insert);
    await vi.waitFor(() => expect(useUiStore.getState().confirm).not.toBeNull());
    useUiStore.getState().confirm?.resolve(true);
    await first;
    expect(inserted[0]?.[0]).toMatch(/^data:/);
    expect(useUiStore.getState().toasts.some((t) => t.message.includes('doesn’t contain'))).toBe(
      true
    );
  });
});
