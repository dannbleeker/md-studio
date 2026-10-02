import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDocument } from '@/domain/document';
import { resetStoreForTest, useStore } from '@/store';
import {
  openDroppedFile,
  openRecent,
  restoreDocumentHandle,
  saveDocument,
} from './documentActions';

const handles = new Map<string, FileSystemFileHandle>();
vi.mock('./handleStore', () => ({
  getHandle: async (id: string) => handles.get(id) ?? null,
  putHandle: async (h: FileSystemFileHandle) => {
    const id = `id-${handles.size + 1}`;
    handles.set(id, h);
    return id;
  },
  pruneHandles: async () => {},
  ensurePermission: async (h: FileSystemFileHandle & { granted?: boolean }) => h.granted !== false,
}));

type FakeHandle = FileSystemFileHandle & { content: string; granted?: boolean; missing?: boolean };

function fakeHandle(name: string, content: string, opts: Partial<FakeHandle> = {}): FakeHandle {
  const h = {
    kind: 'file',
    name,
    content,
    ...opts,
    async getFile() {
      if (h.missing) throw new DOMException('gone', 'NotFoundError');
      return new File([h.content], name);
    },
    async createWritable() {
      return {
        write: async (data: string) => {
          h.content = data;
        },
        close: async () => {},
      };
    },
  };
  return h as unknown as FakeHandle;
}

const recent = (handleId?: string) => ({
  fileName: 'notes.md',
  title: 'Notes',
  markdown: '# Snapshot',
  openedAt: 1,
  ...(handleId ? { handleId } : {}),
});

describe('recent files with handles', () => {
  beforeEach(() => {
    handles.clear();
    resetStoreForTest();
  });

  it('reopens the file from disk, current content, linked for Save', async () => {
    const h = fakeHandle('notes.md', '# On disk now');
    handles.set('h1', h);
    await openRecent(recent('h1'));
    const s = useStore.getState();
    expect(s.doc.markdown).toBe('# On disk now');
    expect(s.fileHandle).toBe(h);
    expect(s.handleId).toBe('h1');

    s.setMarkdown('# Edited', 'text');
    await saveDocument();
    expect(h.content).toBe('# Edited');
  });

  it('falls back to the snapshot when the file is gone', async () => {
    handles.set('h1', fakeHandle('notes.md', 'x', { missing: true }));
    await openRecent(recent('h1'));
    expect(useStore.getState().doc.markdown).toBe('# Snapshot');
    expect(useStore.getState().fileHandle).toBeNull();
  });

  it('falls back to the snapshot when permission is refused', async () => {
    handles.set('h1', fakeHandle('notes.md', 'x', { granted: false }));
    await openRecent(recent('h1'));
    expect(useStore.getState().doc.markdown).toBe('# Snapshot');
    expect(useStore.getState().fileHandle).toBeNull();
  });

  it('opens snapshot-only entries as before', async () => {
    await openRecent(recent());
    expect(useStore.getState().doc.markdown).toBe('# Snapshot');
  });

  it('re-attaches the open document’s file after a reload', async () => {
    const h = fakeHandle('a.md', '# A');
    handles.set('h9', h);
    localStorage.setItem('md-studio:document:v1', JSON.stringify(createDocument('# A', 'a.md')));
    localStorage.setItem('md-studio:document-handle:v1', JSON.stringify('h9'));
    resetStoreForTest();
    expect(useStore.getState().fileHandle).toBeNull();
    await restoreDocumentHandle();
    expect(useStore.getState().fileHandle).toBe(h);
  });

  it('does not write to a file whose permission was refused', async () => {
    const h = fakeHandle('a.md', 'original', { granted: false });
    useStore.getState().loadDocument(createDocument('new', 'a.md'), h, 'h1');
    delete (window as { showSaveFilePicker?: unknown }).showSaveFilePicker;
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    // jsdom has no object URLs.
    Object.defineProperty(URL, 'createObjectURL', { value: () => 'blob:x', configurable: true });
    Object.defineProperty(URL, 'revokeObjectURL', { value: () => {}, configurable: true });
    await saveDocument();
    expect(h.content).toBe('original');
    expect(click).toHaveBeenCalled(); // fell back to a download
    click.mockRestore();
  });
});

describe('opening a file that is already open', () => {
  beforeEach(() => resetStoreForTest());
  const fileNames = () => useStore.getState().tabs.map((t) => t.doc.fileName);

  it('switches to the tab of a file dropped twice, keeping its edits', async () => {
    await openDroppedFile(new File(['# Same'], 'same.md'));
    useStore.getState().setMarkdown('# Same, edited', 'text');
    await openDroppedFile(new File(['other'], 'other.md'));
    await openDroppedFile(new File(['# Same'], 'same.md'));
    expect(fileNames()).toEqual(['same.md', 'other.md']);
    expect(useStore.getState().doc.markdown).toBe('# Same, edited');
  });

  it('opens a new tab when the dropped content differs', async () => {
    await openDroppedFile(new File(['v1'], 'same.md'));
    await openDroppedFile(new File(['v2'], 'same.md'));
    expect(fileNames()).toEqual(['same.md', 'same.md']);
  });

  it('switches to an open snapshot instead of opening it again', async () => {
    const entry = { fileName: 'snap.md', title: '', markdown: 'snap', openedAt: 0 };
    await openRecent(entry);
    await openDroppedFile(new File(['x'], 'x.md'));
    await openRecent(entry);
    expect(fileNames()).toEqual(['snap.md', 'x.md']);
    expect(useStore.getState().doc.fileName).toBe('snap.md');
  });
});
