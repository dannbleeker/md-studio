import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDocument } from '@/domain/document';
import { resetStoreForTest, useStore } from '@/store';
import { useUiStore } from '@/store/ui';
import { fakeVault } from '../../test/fakeFs';
import { resetAttachmentsForTest } from './attachments';
import { isHandledDrop, type PlacedAttachment, placeFiles } from './images';

const stored = new Map<string, unknown>();
vi.mock('./handleStore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./handleStore')>()),
  getHandleAt: async (key: string) => stored.get(key) ?? null,
  putHandleAt: async (key: string, handle: unknown) => {
    stored.set(key, handle);
  },
  listHandlesWithPrefix: async (prefix: string) =>
    [...stored].filter(([key]) => key.startsWith(prefix)),
}));

const png = () => new File([new Uint8Array([137, 80, 78, 71])], 'shot.png', { type: 'image/png' });
const pdf = () => new File(['%PDF'], 'paper.pdf', { type: 'application/pdf' });
const messages = () => useUiStore.getState().toasts.map((toast) => toast.message);

// A declined folder is remembered per document for the session, so each test gets its own id.
let nextId = 0;

describe('placeFiles', () => {
  let inserted: PlacedAttachment[];
  const insert = (p: PlacedAttachment) => inserted.push(p);

  /** A document at notes.md in a vault; its folder is not chosen yet. */
  function openDocument(files: Record<string, string> = {}, permission?: 'granted' | 'prompt') {
    const vault = fakeVault(
      { 'notes.md': '# x', ...files },
      permission ? { permission } : undefined
    );
    const handle = vault.file('notes.md');
    const id = `doc${++nextId}`;
    useStore.getState().loadDocument(createDocument('# x', 'notes.md'), handle, id);
    return { vault, handle, id };
  }

  beforeEach(() => {
    stored.clear();
    inserted = [];
    resetAttachmentsForTest();
    resetStoreForTest();
    useUiStore.setState({ confirm: null, toasts: [] });
    Reflect.deleteProperty(window, 'showDirectoryPicker');
  });

  it('embeds when the document is not on disk', async () => {
    await placeFiles([png()], 'paste', insert);
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({ via: 'data', alt: 'shot', kind: 'image' });
    expect(inserted[0]?.via === 'data' && inserted[0].src).toMatch(/^data:image\/png;base64,/);
    expect(messages()).toEqual([]);
  });

  describe('scaling a large picture down', () => {
    /** A canvas like Safari's: asked for WebP, it hands back PNG. */
    function safariCanvas(width: number) {
      const bitmap = { width, height: 100, close: vi.fn() };
      vi.stubGlobal('createImageBitmap', async () => bitmap);
      const asked: string[] = [];
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
        drawImage: () => {},
      } as unknown as CanvasRenderingContext2D);
      vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((done, type) => {
        asked.push(type ?? '');
        const made = type === 'image/webp' ? 'image/png' : (type ?? 'image/png');
        done(new Blob(['x'], { type: made }));
      });
      return { bitmap, asked };
    }
    const bigPng = () => new File([new Uint8Array(500_000)], 'shot.png', { type: 'image/png' });
    const bigJpeg = () => new File([new Uint8Array(500_000)], 'photo.jpg', { type: 'image/jpeg' });

    afterEach(() => {
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    });

    it('keeps a PNG a PNG where WebP is missing, so transparency survives', async () => {
      const canvas = safariCanvas(3200);
      await placeFiles([bigPng()], 'paste', insert);
      expect(canvas.asked).not.toContain('image/jpeg');
      expect(inserted[0]?.via === 'data' && inserted[0].src).toMatch(/^data:image\/png;base64,/);
      expect(canvas.bitmap.close).toHaveBeenCalled();
    });

    it('still makes a JPEG of a photo where WebP is missing', async () => {
      safariCanvas(3200);
      await placeFiles([bigJpeg()], 'paste', insert);
      expect(inserted[0]?.via === 'data' && inserted[0].src).toMatch(/^data:image\/jpeg;base64,/);
    });
  });

  it('saves into images/ next to the document once a folder is chosen', async () => {
    const { vault } = openDocument();
    window.showDirectoryPicker = vi.fn(async () => vault.root);

    const first = placeFiles([png()], 'paste', insert);
    // The first image asks whether to use a folder.
    await vi.waitFor(() => expect(useUiStore.getState().confirm).not.toBeNull());
    useUiStore.getState().confirm?.resolve(true);
    await first;
    expect(inserted[0]).toMatchObject({ via: 'markdown', alt: 'shot', kind: 'image' });
    expect(inserted[0]?.via === 'markdown' && inserted[0].src).toMatch(
      /^images\/image-\d{8}-\d{6}\.png$/
    );
    expect(inserted[0]?.via === 'markdown' && inserted[0].text).toMatch(
      /^!\[shot\]\(images\/image-\d{8}-\d{6}\.png\)$/
    );
    expect(vault.written.size).toBe(1);

    // The next one goes straight to the folder.
    await placeFiles([png()], 'paste', insert);
    expect(useUiStore.getState().confirm).toBeNull();
    expect(inserted[1]).toMatchObject({ via: 'markdown' });
    expect(inserted[1]?.via === 'markdown' && inserted[1].src).toMatch(/^images\/image-.*\.png$/);
    expect(vault.written.size).toBe(2);
  });

  it('asks about a folder once per drop, even when the folder picker is cancelled', async () => {
    openDocument();
    window.showDirectoryPicker = vi.fn(async () => {
      throw new DOMException('cancelled', 'AbortError');
    });
    let asked = 0;
    const placing = placeFiles([png(), png(), png()], 'drop', insert);
    for (let i = 0; i < 3 && inserted.length < 3; i++) {
      await vi.waitFor(() =>
        expect(useUiStore.getState().confirm !== null || inserted.length === 3).toBe(true)
      );
      const confirm = useUiStore.getState().confirm;
      if (!confirm) break;
      asked++;
      confirm.resolve(true);
      await vi.waitFor(() => expect(useUiStore.getState().confirm).not.toBe(confirm));
    }
    await placing;
    expect(asked).toBe(1);
    expect(inserted.map((p) => p.via)).toEqual(['data', 'data', 'data']);
  });

  it('does not insert into a document opened while the file was being placed', async () => {
    const { vault } = openDocument();
    window.showDirectoryPicker = vi.fn(async () => vault.root);
    const placing = placeFiles([png()], 'paste', insert);
    await vi.waitFor(() => expect(useUiStore.getState().confirm).not.toBeNull());
    // The user switches to another document before answering.
    useStore.getState().loadDocument(createDocument('# other', 'other.md'), null);
    useUiStore.getState().confirm?.resolve(false);
    await placing;
    expect(inserted).toEqual([]);
    expect(messages().at(-1)).toMatch(/another document/);
  });

  it('does not insert a saved file either when the document changed during the save', async () => {
    const { vault, id } = openDocument({ '.obsidian/app.json': '{}' });
    stored.set(`dir:${id}`, vault.root);
    window.showDirectoryPicker = vi.fn();
    const original = vault.root.getFileHandle.bind(vault.root);
    vi.spyOn(vault.root, 'getFileHandle').mockImplementation(async (name, options) => {
      useStore.getState().loadDocument(createDocument('# other', 'other.md'), null);
      return original(name, options);
    });
    await placeFiles([png()], 'paste', insert);
    expect(inserted).toEqual([]);
    expect(messages().at(-1)).toMatch(/another document/);
  });

  it('embeds, and stops asking, when the user declines the folder', async () => {
    openDocument();
    window.showDirectoryPicker = vi.fn();
    const first = placeFiles([png()], 'paste', insert);
    await vi.waitFor(() => expect(useUiStore.getState().confirm).not.toBeNull());
    useUiStore.getState().confirm?.resolve(false);
    await first;
    expect(inserted[0]).toMatchObject({ via: 'data' });
    await placeFiles([png()], 'paste', insert);
    expect(useUiStore.getState().confirm).toBeNull();
    expect(window.showDirectoryPicker).not.toHaveBeenCalled();
    expect(inserted).toHaveLength(2);
  });

  it('refuses a folder that does not contain the document', async () => {
    openDocument();
    const elsewhere = fakeVault({ 'other.md': '' });
    window.showDirectoryPicker = vi.fn(async () => elsewhere.root);
    const first = placeFiles([png()], 'paste', insert);
    await vi.waitFor(() => expect(useUiStore.getState().confirm).not.toBeNull());
    useUiStore.getState().confirm?.resolve(true);
    await first;
    expect(inserted[0]).toMatchObject({ via: 'data' });
    expect(messages().some((m) => m.includes('doesn’t contain'))).toBe(true);
  });

  it('inserts a wikilink in a vault whose app.json asks for wikilinks', async () => {
    const { vault, id } = openDocument({
      '.obsidian/app.json': '{"attachmentFolderPath":"Assets"}',
    });
    stored.set(`dir:${id}`, vault.root);
    window.showDirectoryPicker = vi.fn();
    await placeFiles([png()], 'paste', insert);
    expect(useUiStore.getState().confirm).toBeNull();
    expect(inserted[0]).toMatchObject({ via: 'wikilink', kind: 'image' });
    expect(inserted[0]?.via === 'wikilink' && inserted[0].raw).toMatch(
      /^!\[\[Pasted image \d{14}\.png\]\]$/
    );
    expect([...vault.written.keys()][0]).toMatch(/^Assets\/Pasted image /);
  });

  it('inserts any file type in a vault, keeping the dropped name', async () => {
    const { vault, id } = openDocument({ '.obsidian/app.json': '{}' });
    stored.set(`dir:${id}`, vault.root);
    window.showDirectoryPicker = vi.fn();
    await placeFiles([pdf()], 'drop', insert);
    expect(inserted[0]).toMatchObject({ via: 'wikilink', raw: '![[paper.pdf]]', kind: 'pdf' });
  });

  it('inserts Markdown links with the destination and alt split out', async () => {
    const { vault, id } = openDocument({
      '.obsidian/app.json': '{"attachmentFolderPath":"Assets"}',
    });
    stored.set(`dir:${id}`, vault.root);
    window.showDirectoryPicker = vi.fn();
    useStore.getState().updateSettings({ linkStyle: 'markdown' });
    await placeFiles([pdf(), png()], 'drop', insert);
    expect(inserted).toEqual([
      { via: 'markdown', src: 'paper.pdf', alt: '', kind: 'pdf', text: '![](paper.pdf)' },
      { via: 'markdown', src: 'shot.png', alt: '', kind: 'image', text: '![](shot.png)' },
    ]);
  });

  describe('when the file cannot be saved', () => {
    function promptVault(requestFails: boolean) {
      const { vault, id } = openDocument({ '.obsidian/app.json': '{}' }, 'prompt');
      stored.set(`dir:${id}`, vault.root);
      window.showDirectoryPicker = vi.fn();
      if (requestFails) {
        // A drop has no user activation, so asking throws.
        vi.spyOn(vault.root, 'requestPermission').mockRejectedValue(
          new DOMException('no activation', 'SecurityError')
        );
      }
      return vault;
    }

    it('embeds an image and names a permission problem', async () => {
      const vault = promptVault(true);
      await placeFiles([png()], 'drop', insert);
      expect(inserted[0]).toMatchObject({ via: 'data' });
      expect(vault.written.size).toBe(0);
      expect(messages()).toEqual([expect.stringContaining('Allow access in the bar above')]);
      expect(messages()[0]).not.toContain('needs-permission');
    });

    it('inserts nothing for another file and points at the notice', async () => {
      promptVault(true);
      await placeFiles([pdf()], 'drop', insert);
      expect(inserted).toEqual([]);
      expect(messages()).toEqual([expect.stringContaining('see the bar above the editor')]);
    });

    it('saves when the paste can ask and the user allows', async () => {
      const vault = promptVault(false);
      await placeFiles([pdf()], 'paste', insert);
      expect(inserted[0]).toMatchObject({ via: 'wikilink' });
      expect(vault.written.size).toBe(1);
    });

    it('embeds an image and names a failed write', async () => {
      const { vault, id } = openDocument({ '.obsidian/app.json': '{}' });
      stored.set(`dir:${id}`, vault.root);
      window.showDirectoryPicker = vi.fn();
      vi.spyOn(vault.root, 'getFileHandle').mockRejectedValue(new Error('read-only disk'));
      await placeFiles([png()], 'drop', insert);
      expect(inserted[0]).toMatchObject({ via: 'data' });
      expect(messages().some((m) => m.includes('could not be saved'))).toBe(true);
      expect(messages().some((m) => m.includes('(failed)'))).toBe(false);
    });

    it('tells the user to choose a folder when a saved note has none yet', async () => {
      openDocument();
      window.showDirectoryPicker = vi.fn();
      await placeFiles([pdf()], 'drop', insert);
      expect(inserted).toEqual([]);
      expect(messages()).toEqual([expect.stringContaining('Choose attachment folder')]);
      expect(messages()[0]).not.toMatch(/browser/);
    });

    it('tells the user to save the note when it is not on disk', async () => {
      window.showDirectoryPicker = vi.fn();
      await placeFiles([pdf()], 'drop', insert);
      expect(inserted).toEqual([]);
      expect(messages()).toEqual([expect.stringContaining('Save this document to disk first')]);
    });

    it('inserts nothing for another file when the browser cannot save', async () => {
      await placeFiles([pdf()], 'drop', insert);
      expect(inserted).toEqual([]);
      expect(messages()).toEqual([expect.stringContaining('cannot save files to a folder')]);
    });
  });

  it('keeps going after one file fails', async () => {
    await placeFiles([pdf(), png()], 'drop', insert);
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({ via: 'data' });
  });
});

describe('isHandledDrop', () => {
  beforeEach(() => {
    Reflect.deleteProperty(window, 'showDirectoryPicker');
  });

  it('takes images anywhere', () => {
    expect(isHandledDrop([png()])).toBe(true);
    expect(isHandledDrop([])).toBe(true);
  });

  it('takes other files only where they can be saved', () => {
    expect(isHandledDrop([pdf()])).toBe(false);
    window.showDirectoryPicker = vi.fn();
    expect(isHandledDrop([pdf()])).toBe(true);
  });

  it('takes a mix with an image anywhere, so the image is not lost', () => {
    expect(isHandledDrop([pdf(), png()])).toBe(true);
  });
});
