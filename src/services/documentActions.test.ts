import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDocument } from '@/domain/document';
import { resetStoreForTest, useStore } from '@/store';
import { useUiStore } from '@/store/ui';
import {
  checkDiskChanges,
  openDroppedFile,
  openRecent,
  openUserGuide,
  restoreDocumentHandle,
  saveDocument,
  switchTab,
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

describe('files changed on disk outside MD Studio', () => {
  beforeEach(() => {
    handles.clear();
    resetStoreForTest();
  });
  const openOnDisk = (h: FakeHandle) =>
    useStore.getState().loadDocument(createDocument(h.content, h.name), h, 'id-x');

  it('reloads a tab without unsaved changes', async () => {
    const h = fakeHandle('a.md', 'v1');
    openOnDisk(h);
    h.content = 'v2 from another app';
    await checkDiskChanges();
    expect(useStore.getState().doc).toMatchObject({
      markdown: 'v2 from another app',
      savedMarkdown: 'v2 from another app',
    });
  });

  it('keeps unsaved work and asks before Save overwrites the newer file', async () => {
    const h = fakeHandle('a.md', 'v1');
    openOnDisk(h);
    useStore.getState().setMarkdown('my edit', 'text');
    h.content = 'v2 from another device';
    await checkDiskChanges();
    expect(useStore.getState().doc.markdown).toBe('my edit');

    const saving = saveDocument();
    await vi.waitFor(() => expect(useUiStore.getState().confirm).not.toBeNull());
    useUiStore.getState().confirm?.resolve(false);
    await saving;
    expect(h.content).toBe('v2 from another device');

    const again = saveDocument();
    await vi.waitFor(() => expect(useUiStore.getState().confirm).not.toBeNull());
    useUiStore.getState().confirm?.resolve(true);
    await again;
    expect(h.content).toBe('my edit');
  });

  it('saves without asking when the file is as we left it', async () => {
    const h = fakeHandle('a.md', 'v1');
    openOnDisk(h);
    useStore.getState().setMarkdown('v1 edited', 'text');
    await saveDocument();
    expect(useUiStore.getState().confirm).toBeNull();
    expect(h.content).toBe('v1 edited');
  });
});

describe('saves that take a while', () => {
  beforeEach(() => {
    handles.clear();
    resetStoreForTest();
  });

  /** A handle whose write waits until `release()` is called. */
  function slowHandle(name: string, content: string) {
    let release = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const h = fakeHandle(name, content);
    const createWritable = h.createWritable.bind(h);
    Object.assign(h, {
      async createWritable() {
        const w = await createWritable();
        return { write: w.write, close: async () => gate.then(w.close) };
      },
    });
    return { h, release: () => release() };
  }

  it('keeps edits made during a save marked as unsaved', async () => {
    const { h, release } = slowHandle('a.md', 'v1');
    useStore.getState().loadDocument(createDocument('v1', 'a.md'), h, 'id-a');
    useStore.getState().setMarkdown('v2', 'text');
    const saving = saveDocument();
    await vi.waitFor(() => expect(h.content).toBe('v2'));
    useStore.getState().setMarkdown('v3 typed during the save', 'text');
    release();
    await saving;
    expect(useStore.getState().doc).toMatchObject({
      markdown: 'v3 typed during the save',
      savedMarkdown: 'v2',
    });
  });

  it('records the save on the tab it started in, even after a tab switch', async () => {
    const { h, release } = slowHandle('a.md', 'A');
    useStore.getState().loadDocument(createDocument('A', 'a.md'), h, 'id-a');
    const tabA = useStore.getState().activeTabId;
    useStore.getState().setMarkdown('A edited', 'text');
    useStore.getState().loadDocument(createDocument('B', 'b.md'), null);
    const tabB = useStore.getState().activeTabId;
    await switchTab(tabA);
    const saving = saveDocument();
    await vi.waitFor(() => expect(h.content).toBe('A edited'));
    await switchTab(tabB);
    release();
    await saving;
    const s = useStore.getState();
    expect(s.doc).toMatchObject({ fileName: 'b.md', markdown: 'B' });
    expect(s.fileHandle).toBeNull();
    expect(s.tabs.find((t) => t.id === tabA)?.doc).toMatchObject({
      markdown: 'A edited',
      savedMarkdown: 'A edited',
    });
  });
});

describe('bundled documents', () => {
  beforeEach(() => resetStoreForTest());

  it('opens the user guide once, then switches back to its tab', async () => {
    await openUserGuide();
    const guide = useStore.getState().doc;
    expect(guide.fileName).toBe('User-Guide.md');
    expect(guide.markdown).toMatch(/^# /);
    await openDroppedFile(new File(['x'], 'x.md'));
    await openUserGuide();
    expect(useStore.getState().tabs.map((t) => t.doc.fileName)).toEqual(['User-Guide.md', 'x.md']);
    expect(useStore.getState().doc.fileName).toBe('User-Guide.md');
  });
});
