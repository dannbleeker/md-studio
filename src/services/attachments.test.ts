import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDocument } from '@/domain/document';
import { DEFAULT_VAULT_CONFIG } from '@/domain/vaultConfig';
import { resetStoreForTest, useStore } from '@/store';
import { useUiStore } from '@/store/ui';
import { fakeVault, stubObjectUrls } from '../../test/fakeFs';
import {
  adoptAttachmentFolder,
  adoptKnownRoot,
  attachmentStatus,
  attachmentsSupported,
  chooseAttachmentFolder,
  currentDocContext,
  type DocContext,
  getVault,
  grantAttachmentAccess,
  invalidateAttachmentIndex,
  noteRelativePath,
  peekAttachment,
  peekNoteRead,
  readAttachmentBytes,
  readNoteText,
  refreshAttachments,
  resetAttachmentsForTest,
  resolveAttachment,
  saveAttachment,
  subscribeAttachments,
} from './attachments';

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

const NOTE = 'Notes/Daily/n.md';
const OBSIDIAN = { '.obsidian/app.json': '{}' };

/** A vault holding the note, with its root stored as the document's folder. */
function setup(
  files: Record<string, string | Uint8Array> = {},
  opts?: { permission?: 'granted' | 'prompt' | 'denied'; id?: string; note?: string }
) {
  const note = opts?.note ?? NOTE;
  const id = opts?.id ?? 'h1';
  const vault = fakeVault(
    { [note]: '# n', ...files },
    opts?.permission ? { permission: opts.permission } : undefined
  );
  stored.set(`dir:${id}`, vault.root);
  const ctx: DocContext = { fileHandle: vault.file(note), handleId: id };
  return { vault, ctx };
}

const complete = (ctx: DocContext) => getVault(ctx, { complete: true });
const messages = () => useUiStore.getState().toasts.map((toast) => toast.message);
const png = (name = 'shot.png') =>
  new File([new Uint8Array([137, 80, 78, 71])], name, { type: 'image/png' });

/** Makes the next scan of the vault wait until the returned function is called. */
function holdScan(root: FileSystemDirectoryHandle): () => void {
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const holder = root as unknown as { values(): AsyncIterable<FileSystemHandle> };
  const original = holder.values;
  holder.values = async function* () {
    await gate;
    yield* original.call(root);
  };
  return release;
}

/** Counts how many times a folder's contents were listed, i.e. how many scans ran. */
function scanCounter(root: FileSystemDirectoryHandle) {
  return vi.spyOn(root as unknown as { values(): AsyncIterable<unknown> }, 'values');
}

let urls: ReturnType<typeof stubObjectUrls>;

beforeEach(() => {
  stored.clear();
  resetAttachmentsForTest();
  resetStoreForTest();
  useUiStore.setState({ confirm: null, toasts: [] });
  window.showDirectoryPicker = vi.fn();
  urls = stubObjectUrls();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('attachmentStatus', () => {
  it('is unsupported without a directory picker', async () => {
    const { ctx } = setup();
    Reflect.deleteProperty(window, 'showDirectoryPicker');
    expect(attachmentsSupported()).toBe(false);
    expect(await attachmentStatus(ctx)).toEqual({ kind: 'unsupported' });
  });

  it('needs a note file and its handle id', async () => {
    const { ctx } = setup();
    expect(await attachmentStatus({ fileHandle: null, handleId: 'h1' })).toEqual({
      kind: 'no-note-file',
    });
    expect(await attachmentStatus({ fileHandle: ctx.fileHandle, handleId: null })).toEqual({
      kind: 'no-note-file',
    });
  });

  it('has no folder until one is stored or adopted', async () => {
    const { ctx } = setup();
    stored.clear();
    expect(await attachmentStatus(ctx)).toEqual({ kind: 'no-folder' });
  });

  it('asks for permission before reading anything, and never prompts', async () => {
    const { vault, ctx } = setup({}, { permission: 'prompt' });
    const resolve = vi.spyOn(vault.root, 'resolve');
    const request = vi.spyOn(vault.root, 'requestPermission');
    expect(await attachmentStatus(ctx)).toEqual({ kind: 'needs-permission', folderName: 'vault' });
    expect(resolve).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
  });

  it('treats a handle without queryPermission as granted', async () => {
    const { vault, ctx } = setup();
    (vault.root as { queryPermission?: unknown }).queryPermission = undefined;
    expect((await attachmentStatus(ctx)).kind).toBe('ready');
  });

  it('reports ready with the folder name, vault root flag and scan state', async () => {
    const { ctx } = setup(OBSIDIAN);
    const status = await attachmentStatus(ctx);
    expect(status).toEqual({
      kind: 'ready',
      folderName: 'vault',
      isVaultRoot: true,
      misses: 0,
      scanning: true,
    });
    await complete(ctx);
    expect(await attachmentStatus(ctx)).toMatchObject({ kind: 'ready', scanning: false });
  });

  it('is not a vault root without .obsidian', async () => {
    const { ctx } = setup();
    expect(await attachmentStatus(ctx)).toMatchObject({ kind: 'ready', isVaultRoot: false });
  });

  it('reads no-folder when the stored folder does not contain the note', async () => {
    const { ctx } = setup();
    stored.set('dir:h1', fakeVault({ 'other.md': '' }).root);
    expect(await attachmentStatus(ctx)).toEqual({ kind: 'no-folder' });
  });

  it('reads no-folder when resolving the note throws', async () => {
    const { vault, ctx } = setup();
    vi.spyOn(vault.root, 'resolve').mockRejectedValue(new Error('gone'));
    expect(await attachmentStatus(ctx)).toEqual({ kind: 'no-folder' });
  });

  it('adopts a folder known from another document when none is stored', async () => {
    const { vault } = setup({}, { id: 'other' });
    const ctx = { fileHandle: vault.file(NOTE), handleId: 'fresh' };
    expect((await attachmentStatus(ctx)).kind).toBe('ready');
    expect(stored.get('dir:fresh')).toBe(vault.root);
  });
});

describe('chooseAttachmentFolder', () => {
  it('calls the picker before awaiting anything, starting at the note', async () => {
    const { vault, ctx } = setup();
    stored.clear();
    window.showDirectoryPicker = vi.fn(async () => vault.root);
    const done = chooseAttachmentFolder(ctx);
    expect(window.showDirectoryPicker).toHaveBeenCalledWith({
      id: 'md-studio-images',
      mode: 'readwrite',
      startIn: ctx.fileHandle,
    });
    expect(await done).toBe(true);
    expect(stored.get('dir:h1')).toBe(vault.root);
    expect((await attachmentStatus(ctx)).kind).toBe('ready');
  });

  it('refuses a folder that does not contain the note', async () => {
    const { ctx } = setup();
    stored.clear();
    window.showDirectoryPicker = vi.fn(async () => fakeVault({ 'x.md': '' }).root);
    expect(await chooseAttachmentFolder(ctx)).toBe(false);
    expect(stored.has('dir:h1')).toBe(false);
    expect(messages().some((m) => m.includes('doesn’t contain'))).toBe(true);
  });

  it('returns false when the picker is cancelled', async () => {
    const { ctx } = setup();
    window.showDirectoryPicker = vi.fn(async () => {
      throw new DOMException('cancelled', 'AbortError');
    });
    expect(await chooseAttachmentFolder(ctx)).toBe(false);
  });

  it('notifies subscribers and replaces the previous folder', async () => {
    const { vault, ctx } = setup();
    await attachmentStatus(ctx);
    const listener = vi.fn();
    subscribeAttachments(listener);
    window.showDirectoryPicker = vi.fn(async () => vault.root);
    await chooseAttachmentFolder(ctx);
    await vi.waitFor(() => expect(listener).toHaveBeenCalled());
  });
});

describe('grantAttachmentAccess', () => {
  it('asks for permission and makes the folder ready', async () => {
    const { vault, ctx } = setup({}, { permission: 'prompt' });
    expect((await attachmentStatus(ctx)).kind).toBe('needs-permission');
    expect(await grantAttachmentAccess(ctx)).toBe(true);
    expect((await attachmentStatus(ctx)).kind).toBe('ready');
    expect(vault.root.queryPermission).toBeDefined();
  });

  it('is false when the user refuses', async () => {
    const { ctx } = setup({}, { permission: 'denied' });
    expect(await grantAttachmentAccess(ctx)).toBe(false);
  });

  it('is false without a stored folder', async () => {
    const { ctx } = setup();
    stored.clear();
    invalidateAttachmentIndex('h1');
    expect(await grantAttachmentAccess(ctx)).toBe(false);
  });
});

describe('Save As and adopting a known folder', () => {
  it('Save As keeps the folder when it contains the new note', async () => {
    const { vault } = setup({ 'Notes/Daily/new.md': '' });
    await adoptAttachmentFolder('h1', 'h2', vault.file('Notes/Daily/new.md'));
    expect(stored.get('dir:h2')).toBe(vault.root);
  });

  it('Save As does nothing when the folder does not contain the new note', async () => {
    setup();
    const elsewhere = fakeVault({ 'else.md': '' });
    await adoptAttachmentFolder('h1', 'h2', elsewhere.file('else.md'));
    expect(stored.has('dir:h2')).toBe(false);
  });

  it('Save As does nothing without a source folder', async () => {
    const { vault } = setup();
    await adoptAttachmentFolder('nope', 'h2', vault.file(NOTE));
    expect(stored.has('dir:h2')).toBe(false);
  });

  async function nested() {
    const vault = fakeVault({
      'Vault/.obsidian/app.json': '{}',
      'Vault/Notes/n.md': '# n',
    });
    const outer = vault.root;
    const vaultRoot = await outer.getDirectoryHandle('Vault');
    const notes = await vaultRoot.getDirectoryHandle('Notes');
    const ctx: DocContext = { fileHandle: vault.file('Vault/Notes/n.md'), handleId: 'fresh' };
    return { outer, vaultRoot, notes, ctx };
  }

  it('prefers a folder that holds .obsidian', async () => {
    const { outer, vaultRoot, notes, ctx } = await nested();
    stored.set('dir:a', notes);
    stored.set('dir:b', outer);
    stored.set('dir:c', vaultRoot);
    expect(await adoptKnownRoot(ctx)).toBe(true);
    expect(stored.get('dir:fresh')).toBe(vaultRoot);
  });

  it('otherwise prefers the outermost folder', async () => {
    const vault = fakeVault({ 'A/B/n.md': '' });
    const a = await vault.root.getDirectoryHandle('A');
    const b = await a.getDirectoryHandle('B');
    stored.set('dir:inner', b);
    stored.set('dir:mid', a);
    stored.set('dir:outer', vault.root);
    expect(await adoptKnownRoot({ fileHandle: vault.file('A/B/n.md'), handleId: 'fresh' })).toBe(
      true
    );
    expect(stored.get('dir:fresh')).toBe(vault.root);
  });

  it('skips candidates whose resolve throws', async () => {
    const { outer, notes, ctx } = await nested();
    vi.spyOn(outer, 'resolve').mockRejectedValue(new Error('boom'));
    stored.set('dir:a', outer);
    stored.set('dir:b', notes);
    expect(await adoptKnownRoot(ctx)).toBe(true);
    expect(stored.get('dir:fresh')).toBe(notes);
  });

  it('skips candidates that would need a permission prompt', async () => {
    const { outer, notes, ctx } = await nested();
    vi.spyOn(outer, 'queryPermission').mockResolvedValue('prompt');
    const request = vi.spyOn(outer, 'requestPermission');
    stored.set('dir:a', outer);
    stored.set('dir:b', notes);
    expect(await adoptKnownRoot(ctx)).toBe(true);
    expect(stored.get('dir:fresh')).toBe(notes);
    expect(request).not.toHaveBeenCalled();
  });

  it('returns false when no known folder contains the note', async () => {
    stored.set('dir:a', fakeVault({ 'x.md': '' }).root);
    const lone = fakeVault({ 'n.md': '' });
    expect(await adoptKnownRoot({ fileHandle: lone.file('n.md'), handleId: 'fresh' })).toBe(false);
    expect(stored.has('dir:fresh')).toBe(false);
  });

  it('ignores stored entries that are not folders', async () => {
    stored.set('dir:a', { kind: 'file', name: 'x' });
    const lone = fakeVault({ 'n.md': '' });
    expect(await adoptKnownRoot({ fileHandle: lone.file('n.md'), handleId: 'fresh' })).toBe(false);
  });

  it('notifies subscribers when a folder is adopted', async () => {
    const { vault } = setup({}, { id: 'other' });
    const listener = vi.fn();
    subscribeAttachments(listener);
    await adoptKnownRoot({ fileHandle: vault.file(NOTE), handleId: 'fresh' });
    await vi.waitFor(() => expect(listener).toHaveBeenCalled());
  });
});

describe('vault configuration and scan', () => {
  it('skips dot folders and node_modules but reads app.json', async () => {
    const { ctx } = setup({
      '.obsidian/app.json': JSON.stringify({
        attachmentFolderPath: 'Assets',
        useMarkdownLinks: true,
      }),
      '.trash/old.png': 'x',
      'node_modules/p/x.png': 'x',
      'Assets/a.png': 'x',
      '.hidden.png': 'x',
    });
    const vault = await complete(ctx);
    expect(vault?.complete).toBe(true);
    expect(vault?.index.paths).toContain('Assets/a.png');
    expect(vault?.index.paths).toContain(NOTE);
    expect(vault?.index.paths.some((p) => p.startsWith('.') || p.includes('node_modules'))).toBe(
      false
    );
    expect(vault?.config).toEqual({
      attachmentFolderPath: 'Assets',
      useMarkdownLinks: true,
      newLinkFormat: 'shortest',
    });
    expect(vault?.notePath).toBe(NOTE);
  });

  it('uses the defaults for a .obsidian folder without app.json', async () => {
    const { ctx } = setup({ '.obsidian/workspace.json': '{}' });
    expect((await complete(ctx))?.config).toEqual(DEFAULT_VAULT_CONFIG);
  });

  it('has no config without a .obsidian folder', async () => {
    const { ctx } = setup();
    expect((await complete(ctx))?.config).toBeNull();
  });

  it('the images-folder rule forces the legacy config even inside a vault', async () => {
    const { ctx } = setup(OBSIDIAN);
    useStore.getState().updateSettings({ attachmentRules: 'images' });
    expect((await complete(ctx))?.config).toBeNull();
  });

  it('returns null for a document without a usable folder', async () => {
    const { ctx } = setup();
    stored.clear();
    expect(await getVault(ctx)).toBeNull();
    expect(await noteRelativePath(ctx)).toBeNull();
  });

  it('indexes a 50k-file vault up to the cap, with partial snapshots, and says so', async () => {
    const files: Record<string, string> = {};
    for (let i = 0; i < 50_100; i++) files[`d${i % 40}/f${i}.png`] = '';
    files['Notes/Daily/near.png'] = '';
    const { ctx } = setup(files);
    // The first status call starts the scan in the background.
    expect(await attachmentStatus(ctx)).toMatchObject({ scanning: true });

    // Not found is never reported while the index is incomplete ...
    expect(await resolveAttachment(ctx, 'not-there.png')).toEqual({ state: 'scanning' });
    // ... but a bare name beside the note resolves at once, without the index.
    expect(await resolveAttachment(ctx, 'near.png')).toMatchObject({
      state: 'ok',
      path: 'Notes/Daily/near.png',
    });

    const sizes: number[] = [];
    let snapshot = await getVault(ctx);
    while (snapshot && !snapshot.complete) {
      sizes.push(snapshot.index.paths.length);
      await new Promise((resolve) => setTimeout(resolve, 0));
      snapshot = await getVault(ctx);
    }
    expect(sizes.some((n) => n > 0 && n < 50_000)).toBe(true);
    expect(snapshot?.complete).toBe(true);
    expect(snapshot?.truncated).toBe(true);
    expect(snapshot?.index.paths).toHaveLength(50_000);
    expect(messages().some((m) => m.includes('50000'))).toBe(true);
    expect(await resolveAttachment(ctx, 'not-there.png')).toMatchObject({ state: 'missing' });
  }, 30_000);
});

describe('scanning a vault with a folder that cannot be listed', () => {
  it('skips that folder and still indexes the rest', async () => {
    const { vault, ctx } = setup({
      ...OBSIDIAN,
      'a/x.md': '',
      'b/y.png': 'png',
      'c/deep/z.md': '',
    });
    const broken = await vault.root.getDirectoryHandle('a');
    (broken as unknown as { values(): AsyncIterable<unknown> }).values = () => ({
      [Symbol.asyncIterator]: () => ({
        next: async () => {
          throw new DOMException('a was not found', 'NotFoundError');
        },
      }),
    });
    const snapshot = await complete(ctx);
    expect(snapshot?.index.paths).toEqual(
      expect.arrayContaining(['Notes/Daily/n.md', 'b/y.png', 'c/deep/z.md'])
    );
    expect(snapshot?.index.paths).not.toContain('a/x.md');
    expect(await resolveAttachment(ctx, 'y.png')).toMatchObject({ state: 'ok', path: 'b/y.png' });
  });
});

describe('resolveAttachment', () => {
  const FILES = { ...OBSIDIAN, 'Attachments/pic.png': 'png' };

  it('is unavailable with the reason from the status', async () => {
    const { ctx } = setup({}, { permission: 'prompt' });
    expect(await resolveAttachment(ctx, 'pic.png')).toEqual({
      state: 'unavailable',
      reason: 'needs-permission',
    });
    expect(await resolveAttachment({ fileHandle: null, handleId: null }, 'pic.png')).toEqual({
      state: 'unavailable',
      reason: 'no-note-file',
    });
  });

  it('resolves a bare name through the index', async () => {
    const { ctx } = setup(FILES);
    await complete(ctx);
    expect(await resolveAttachment(ctx, 'pic.png')).toEqual({
      state: 'ok',
      path: 'Attachments/pic.png',
      name: 'pic.png',
      kind: 'image',
      url: 'blob:fake/1',
      ambiguous: false,
    });
  });

  it('reports ambiguity and picks the file nearest the note', async () => {
    const { ctx } = setup({ 'A/dup.png': '', 'Notes/Daily/dup.png': '' });
    await complete(ctx);
    expect(await resolveAttachment(ctx, 'dup.png')).toMatchObject({
      path: 'Notes/Daily/dup.png',
      ambiguous: true,
    });
  });

  it('matches case-insensitively when nothing matches exactly', async () => {
    const { ctx } = setup(FILES);
    await complete(ctx);
    expect(await resolveAttachment(ctx, 'PIC.PNG')).toMatchObject({ path: 'Attachments/pic.png' });
  });

  it('resolves a path suffix and ./ and ../ targets without the index', async () => {
    const { vault, ctx } = setup({ 'Notes/x.png': '', 'Attachments/pic.png': '' });
    const release = holdScan(vault.root);
    expect(await resolveAttachment(ctx, 'Attachments/pic.png')).toMatchObject({
      path: 'Attachments/pic.png',
    });
    expect(await resolveAttachment(ctx, '../x.png')).toMatchObject({ path: 'Notes/x.png' });
    expect(await resolveAttachment(ctx, './missing.png')).toEqual({ state: 'scanning' });
    release();
    await complete(ctx);
    expect(await resolveAttachment(ctx, './missing.png')).toMatchObject({ state: 'missing' });
  });

  it('finds a bare name in the configured attachment folder before the scan ends', async () => {
    const { ctx } = setup({
      '.obsidian/app.json': JSON.stringify({ attachmentFolderPath: 'Assets' }),
      'Assets/pic.png': '',
    });
    expect(await resolveAttachment(ctx, 'pic.png')).toMatchObject({
      state: 'ok',
      path: 'Assets/pic.png',
    });
  });

  it('finds a bare name at the vault root before the scan ends', async () => {
    const { ctx } = setup({ 'pic.png': '' });
    expect(await resolveAttachment(ctx, 'pic.png')).toMatchObject({ state: 'ok', path: 'pic.png' });
  });

  it('keeps a malformed percent sign in a file name', async () => {
    const { ctx } = setup({ 'Attachments/50%.png': '' });
    await complete(ctx);
    expect(await resolveAttachment(ctx, '50%.png')).toMatchObject({ path: 'Attachments/50%.png' });
  });

  it('resolves notes whose names contain dots', async () => {
    const { ctx } = setup({
      'Note v1.2.md': 'a',
      'Meeting 2024.01.15.md': 'b',
      'Dr. Smith.md': 'c',
    });
    await complete(ctx);
    for (const [target, path] of [
      ['Note v1.2', 'Note v1.2.md'],
      ['Meeting 2024.01.15', 'Meeting 2024.01.15.md'],
      ['Dr. Smith', 'Dr. Smith.md'],
    ] as const) {
      expect(await resolveAttachment(ctx, target)).toMatchObject({
        state: 'ok',
        path,
        kind: 'note',
      });
    }
  });

  it('gives the file kind from the resolved path', async () => {
    const { ctx } = setup({ 'a.pdf': '', 'b.mp3': '', 'c.zip': '' });
    await complete(ctx);
    expect(await resolveAttachment(ctx, 'a.pdf')).toMatchObject({ kind: 'pdf' });
    expect(await resolveAttachment(ctx, 'b.mp3')).toMatchObject({ kind: 'audio' });
    expect(await resolveAttachment(ctx, 'c.zip')).toMatchObject({ kind: 'other' });
  });

  it('flags a missing target in a vault root', async () => {
    const { ctx } = setup(OBSIDIAN);
    await complete(ctx);
    expect(await resolveAttachment(ctx, 'nope.png')).toEqual({
      state: 'missing',
      rootLooksLikeVault: true,
    });
  });

  it('flags a missing target outside a vault root', async () => {
    const { ctx } = setup();
    await complete(ctx);
    expect(await resolveAttachment(ctx, 'nope.png')).toEqual({
      state: 'missing',
      rootLooksLikeVault: false,
    });
  });

  it('counts distinct misses in the status and notifies after a delay', async () => {
    const { ctx } = setup();
    await complete(ctx);
    const listener = vi.fn();
    subscribeAttachments(listener);
    await resolveAttachment(ctx, 'nope.png');
    await resolveAttachment(ctx, 'nope.png');
    await resolveAttachment(ctx, 'other.png');
    expect(await attachmentStatus(ctx)).toMatchObject({ misses: 2 });
    await vi.waitFor(() => expect(listener).toHaveBeenCalledTimes(1));
  });

  describe('Markdown links resolve beside the note first', () => {
    const COLLIDING = {
      'Notes/Daily/images/x.png': 'near',
      'images/x.png': 'root',
    };

    it('prefers the note-relative file over the root-level one', async () => {
      const { ctx } = setup(COLLIDING);
      for (let pass = 0; pass < 2; pass++) {
        // Before the scan ends, and after.
        expect(await resolveAttachment(ctx, 'images/x.png', { markdown: true })).toMatchObject({
          path: 'Notes/Daily/images/x.png',
        });
        await complete(ctx);
      }
    });

    it('a wikilink with the same target means the vault path', async () => {
      const { ctx } = setup(COLLIDING);
      expect(await resolveAttachment(ctx, 'images/x.png')).toMatchObject({ path: 'images/x.png' });
    });

    it('falls back to the vault rules, and to the literal spelling', async () => {
      const { ctx } = setup({ 'Attachments/y.png': '', 'Notes/Daily/a%20b.png': '' });
      await complete(ctx);
      expect(await resolveAttachment(ctx, 'y.png', { markdown: true })).toMatchObject({
        path: 'Attachments/y.png',
      });
      expect(
        await resolveAttachment(ctx, 'a b.png', { markdown: true, alternates: ['a%20b.png'] })
      ).toMatchObject({ path: 'Notes/Daily/a%20b.png' });
    });

    it('walks ../ from the note and never above the root', async () => {
      const { ctx } = setup({ 'Notes/up.png': '' });
      expect(await resolveAttachment(ctx, '../up.png', { markdown: true })).toMatchObject({
        path: 'Notes/up.png',
      });
      await complete(ctx);
      expect(await resolveAttachment(ctx, '../../../../up.png', { markdown: true })).toMatchObject({
        state: 'missing',
      });
    });
  });

  describe('object URLs', () => {
    it('reuses the URL while the file is unchanged', async () => {
      const { ctx } = setup(FILES);
      await complete(ctx);
      const first = await resolveAttachment(ctx, 'pic.png');
      const second = await resolveAttachment(ctx, 'pic.png');
      expect(first).toMatchObject({ url: 'blob:fake/1' });
      expect(second).toMatchObject({ url: 'blob:fake/1' });
      expect(urls.create).toHaveBeenCalledTimes(1);
      expect(urls.revoke).not.toHaveBeenCalled();
    });

    it('revokes and recreates the URL when the file changed', async () => {
      const { vault, ctx } = setup(FILES);
      await complete(ctx);
      await resolveAttachment(ctx, 'pic.png');
      vault.setLastModified('Attachments/pic.png', 99_000);
      expect(await resolveAttachment(ctx, 'pic.png')).toMatchObject({ url: 'blob:fake/2' });
      expect(urls.revoke).toHaveBeenCalledWith('blob:fake/1');
    });

    it('revokes every URL of a document when its folder is invalidated', async () => {
      const { ctx } = setup(FILES);
      await complete(ctx);
      await resolveAttachment(ctx, 'pic.png');
      invalidateAttachmentIndex('h1', true);
      expect(urls.revoke).toHaveBeenCalledWith('blob:fake/1');
      expect(peekAttachment(ctx, 'pic.png')).toBeUndefined();
    });

    it('keeps at most 500 live URLs', async () => {
      const files: Record<string, string> = {};
      for (let i = 0; i < 502; i++) files[`img${i}.png`] = '';
      const { ctx } = setup(files);
      await complete(ctx);
      for (let i = 0; i < 502; i++) await resolveAttachment(ctx, `img${i}.png`);
      expect(urls.revoke).toHaveBeenCalledTimes(2);
    }, 20_000);

    it('opens at most eight files at once', async () => {
      const files: Record<string, string> = {};
      for (let i = 0; i < 20; i++) files[`f${i}.png`] = '';
      const { vault, ctx } = setup(files);
      await complete(ctx);
      let open = 0;
      let peak = 0;
      for (let i = 0; i < 20; i++) {
        const handle = vault.file(`f${i}.png`);
        const original = handle.getFile.bind(handle);
        handle.getFile = async () => {
          open += 1;
          peak = Math.max(peak, open);
          await new Promise((resolve) => setTimeout(resolve, 1));
          open -= 1;
          return original();
        };
      }
      const all = await Promise.all(
        Array.from({ length: 20 }, (_, i) => resolveAttachment(ctx, `f${i}.png`))
      );
      expect(all.every((r) => r.state === 'ok')).toBe(true);
      expect(peak).toBeLessThanOrEqual(8);
      expect(peak).toBeGreaterThan(1);
    });
  });
});

describe('peekAttachment and document switches', () => {
  function twoTabs() {
    const a = setup({ 'pic.png': 'A' }, { id: 'a' });
    const b = setup({ 'pic.png': 'B' }, { id: 'b' });
    return { a, b };
  }

  it('returns only what was resolved for that document', async () => {
    const { a, b } = twoTabs();
    expect(peekAttachment(a.ctx, 'pic.png')).toBeUndefined();
    const first = await resolveAttachment(a.ctx, 'pic.png');
    expect(peekAttachment(a.ctx, 'pic.png')).toEqual(first);
    // The other document has the same target in a different vault.
    expect(peekAttachment(b.ctx, 'pic.png')).toBeUndefined();
    const second = await resolveAttachment(b.ctx, 'pic.png');
    expect(second).toMatchObject({ state: 'ok' });
    expect(second).not.toEqual(first);
    expect(peekAttachment(a.ctx, 'pic.png')).toEqual(first);
  });

  it('does not answer for another note handle under the same id', async () => {
    const { a } = twoTabs();
    await resolveAttachment(a.ctx, 'pic.png');
    const renamed = { fileHandle: a.vault.file('pic.png'), handleId: 'a' };
    expect(peekAttachment(renamed, 'pic.png')).toBeUndefined();
  });

  it('keys the cache by origin note, markdown flag and target', async () => {
    const { a } = twoTabs();
    await resolveAttachment(a.ctx, 'pic.png');
    expect(peekAttachment(a.ctx, 'pic.png', { markdown: true })).toBeUndefined();
    expect(peekAttachment(a.ctx, 'pic.png', { fromNotePath: 'x/y.md' })).toBeUndefined();
    expect(peekAttachment(a.ctx, 'other.png')).toBeUndefined();
    expect(peekAttachment({ fileHandle: null, handleId: null }, 'pic.png')).toBeUndefined();
  });

  it('notifies listeners when the active document or its load id changes', async () => {
    const { a, b } = twoTabs();
    const listener = vi.fn();
    const stop = subscribeAttachments(listener);
    useStore.getState().loadDocument(createDocument('# a', 'n.md'), a.ctx.fileHandle, 'a');
    await vi.waitFor(() => expect(listener).toHaveBeenCalledTimes(1));
    useStore.getState().loadDocument(createDocument('# b', 'n.md'), b.ctx.fileHandle, 'b');
    await vi.waitFor(() => expect(listener).toHaveBeenCalledTimes(2));
    expect(currentDocContext().handleId).toBe('b');
    stop();
    useStore.getState().loadDocument(createDocument('# a', 'n.md'), a.ctx.fileHandle, 'a');
    await Promise.resolve();
    await Promise.resolve();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('notifies when only the file handle is restored after a tab loaded without it', async () => {
    const { a } = twoTabs();
    useStore.getState().loadDocument(createDocument('# a', 'n.md'), null, 'a');
    await Promise.resolve();
    const listener = vi.fn();
    const stop = subscribeAttachments(listener);
    useStore.getState().restoreFileHandle(a.ctx.fileHandle as FileSystemFileHandle);
    await vi.waitFor(() => expect(listener).toHaveBeenCalledTimes(1));
    stop();
  });

  it('coalesces several changes in one tick into one notification', async () => {
    const { a } = twoTabs();
    const listener = vi.fn();
    subscribeAttachments(listener);
    useStore.getState().loadDocument(createDocument('# a', 'n.md'), a.ctx.fileHandle, 'a');
    useStore.getState().loadDocument(createDocument('# a', 'n.md'), a.ctx.fileHandle, 'a');
    await vi.waitFor(() => expect(listener).toHaveBeenCalled());
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('survives a listener that throws', async () => {
    const { a } = twoTabs();
    subscribeAttachments(() => {
      throw new Error('broken view');
    });
    const ok = vi.fn();
    subscribeAttachments(ok);
    useStore.getState().loadDocument(createDocument('# a', 'n.md'), a.ctx.fileHandle, 'a');
    await vi.waitFor(() => expect(ok).toHaveBeenCalled());
  });
});

describe('rescans', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  /** A loaded document with a finished first scan; returns a scan counter. */
  async function scanned() {
    const { vault, ctx } = setup({ 'pic.png': '' });
    useStore.getState().loadDocument(createDocument('# n', 'n.md'), ctx.fileHandle, 'h1');
    const scans = scanCounter(vault.root);
    await complete(ctx);
    return { vault, ctx, scans };
  }

  const flush = () => vi.advanceTimersByTimeAsync(0);

  it('rescans on a miss only 30 s after the last scan finished', async () => {
    const { ctx, scans } = await scanned();
    expect(scans).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await resolveAttachment(ctx, 'nope.png')).toMatchObject({ state: 'missing' });
    await flush();
    expect(scans).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(21_000);
    expect(await resolveAttachment(ctx, 'nope.png')).toMatchObject({ state: 'missing' });
    await flush();
    expect(scans).toHaveBeenCalledTimes(2);
    // The throttle restarts from the end of that scan.
    await vi.advanceTimersByTimeAsync(5_000);
    await resolveAttachment(ctx, 'nope.png');
    await flush();
    expect(scans).toHaveBeenCalledTimes(2);
  });

  it('never runs two scans at once', async () => {
    const { ctx, scans } = await scanned();
    await vi.advanceTimersByTimeAsync(31_000);
    await Promise.all([
      resolveAttachment(ctx, 'a.png'),
      resolveAttachment(ctx, 'b.png'),
      resolveAttachment(ctx, 'c.png'),
    ]);
    await flush();
    expect(scans).toHaveBeenCalledTimes(2);
  });

  it('keeps serving the old index during a rescan', async () => {
    const { vault, ctx } = await scanned();
    await vi.advanceTimersByTimeAsync(31_000);
    const release = holdScan(vault.root);
    await resolveAttachment(ctx, 'nope.png'); // starts the rescan, which waits on the gate
    expect(await resolveAttachment(ctx, 'pic.png')).toMatchObject({ state: 'ok' });
    release();
    await flush();
  });

  it('rescans after a refocus once 10 s have passed, picking up new files', async () => {
    const { vault, ctx, scans } = await scanned();
    await vi.advanceTimersByTimeAsync(5_000);
    window.dispatchEvent(new Event('focus'));
    await flush();
    expect(scans).toHaveBeenCalledTimes(1); // too soon
    const added = await vault.root.getFileHandle('late.png', { create: true });
    expect(added.name).toBe('late.png');
    await vi.advanceTimersByTimeAsync(6_000);
    // Still marked stale, so the next resolve rescans.
    await resolveAttachment(ctx, 'pic.png');
    await flush();
    expect(scans).toHaveBeenCalledTimes(2);
    expect((await complete(ctx))?.index.paths).toContain('late.png');
  });

  it('rescans on a refocus by itself when the throttle allows', async () => {
    const { scans } = await scanned();
    await vi.advanceTimersByTimeAsync(11_000);
    window.dispatchEvent(new Event('focus'));
    await flush();
    expect(scans).toHaveBeenCalledTimes(2);
  });

  it('treats a page that becomes visible like a focus', async () => {
    const { scans } = await scanned();
    await vi.advanceTimersByTimeAsync(11_000);
    document.dispatchEvent(new Event('visibilitychange'));
    await flush();
    expect(scans).toHaveBeenCalledTimes(2);
  });

  it('refreshAttachments bypasses the throttles and joins a scan in flight', async () => {
    const { ctx, scans } = await scanned();
    await Promise.all([refreshAttachments(ctx), refreshAttachments(ctx)]);
    expect(scans).toHaveBeenCalledTimes(2);
    await refreshAttachments(ctx);
    expect(scans).toHaveBeenCalledTimes(3);
  });

  it('refreshAttachments does nothing without a folder', async () => {
    await refreshAttachments({ fileHandle: null, handleId: null });
  });

  it('clears the miss count when a scan finishes', async () => {
    const { ctx } = await scanned();
    await resolveAttachment(ctx, 'nope.png');
    expect(await attachmentStatus(ctx)).toMatchObject({ misses: 1 });
    await refreshAttachments(ctx);
    expect(await attachmentStatus(ctx)).toMatchObject({ misses: 0 });
  });

  it('merges a file saved during a scan into the finished index', async () => {
    const { vault, ctx } = await scanned();
    await refreshAttachments(ctx);
    const saved = await saveAttachment(ctx, png('during.png'), 'drop');
    expect(saved.ok).toBe(true);
    expect(vault.written.size).toBe(1);
    await refreshAttachments(ctx);
    expect((await complete(ctx))?.index.paths).toContain('Notes/Daily/images/during.png');
  });
});

describe('readNoteText', () => {
  it('reads the live editor text for an empty target in the host note', async () => {
    const { ctx } = setup();
    useStore.getState().loadDocument(createDocument('live text', 'n.md'), ctx.fileHandle, 'h1');
    useStore.getState().setMarkdown('live text, edited', 'text');
    const read = await readNoteText(ctx, '');
    expect(read).toMatchObject({ state: 'ok', path: NOTE, text: 'live text, edited' });
    expect(peekNoteRead(ctx, '')).toMatchObject({ state: 'ok', text: 'live text, edited' });
  });

  it('gives an empty path for a host note with no folder', async () => {
    const lone = fakeVault({ 'n.md': '' });
    useStore.getState().loadDocument(createDocument('text', 'n.md'), lone.file('n.md'), 'x');
    expect(await readNoteText({ fileHandle: lone.file('n.md'), handleId: 'x' }, '')).toMatchObject({
      state: 'ok',
      path: '',
      text: 'text',
    });
  });

  it('reads a transcluded note’s own file for an empty target', async () => {
    const { ctx } = setup({ 'Other.md': 'other text' });
    expect(await readNoteText(ctx, '', { fromNotePath: 'Other.md' })).toMatchObject({
      state: 'ok',
      path: 'Other.md',
      text: 'other text',
    });
    expect(await readNoteText(ctx, '', { fromNotePath: 'Gone.md' })).toMatchObject({
      state: 'missing',
    });
    expect(await readNoteText(ctx, '', { fromNotePath: null })).toMatchObject({ state: 'missing' });
  });

  it('flags a note whose name two files share, from the read and from the cache', async () => {
    const { ctx } = setup({ 'A/dup.md': 'far', 'Notes/Daily/dup.md': 'near' });
    await complete(ctx);
    expect(await readNoteText(ctx, 'dup')).toMatchObject({
      path: 'Notes/Daily/dup.md',
      text: 'near',
      ambiguous: true,
    });
    expect(peekNoteRead(ctx, 'dup')).toMatchObject({ path: 'Notes/Daily/dup.md', ambiguous: true });
    expect(await readNoteText(ctx, 'Other')).not.toHaveProperty('ambiguous');
  });

  it('reads a named note with the file size and modified time', async () => {
    const { ctx } = setup({ 'Other.md': 'other text' });
    await complete(ctx);
    expect(await readNoteText(ctx, 'Other')).toEqual({
      state: 'ok',
      path: 'Other.md',
      text: 'other text',
      lastModified: 1_000,
      size: 10,
    });
  });

  it('reports scanning, missing and unavailable', async () => {
    const { vault, ctx } = setup(OBSIDIAN);
    const release = holdScan(vault.root);
    expect(await readNoteText(ctx, 'Nowhere')).toEqual({ state: 'scanning' });
    release();
    await complete(ctx);
    expect(await readNoteText(ctx, 'Nowhere')).toEqual({
      state: 'missing',
      rootLooksLikeVault: true,
    });
    stored.clear();
    invalidateAttachmentIndex('h1');
    expect(await readNoteText(ctx, 'Other')).toEqual({ state: 'unavailable', reason: 'no-folder' });
    expect(await readNoteText(ctx, '', { fromNotePath: 'Other.md' })).toEqual({
      state: 'unavailable',
      reason: 'no-folder',
    });
  });

  it('refuses notes over 2 MB', async () => {
    const { ctx } = setup({ 'Big.md': 'x'.repeat(2 * 1024 * 1024 + 1) });
    await complete(ctx);
    expect(await readNoteText(ctx, 'Big')).toMatchObject({ state: 'missing' });
  });

  it('serves cached text synchronously and revalidates against the file', async () => {
    const { vault, ctx } = setup({ 'Other.md': 'v1' });
    await complete(ctx);
    expect(peekNoteRead(ctx, 'Other')).toBeUndefined();
    expect(peekNoteRead({ fileHandle: ctx.fileHandle, handleId: null }, 'Other')).toBeUndefined();
    await readNoteText(ctx, 'Other');
    expect(peekNoteRead(ctx, 'Other')).toMatchObject({ state: 'ok', text: 'v1' });

    const writer = await vault.file('Other.md').createWritable();
    await writer.write('v2, longer');
    await writer.close();
    // Stale while revalidating: the old text stays available until it is read again.
    expect(peekNoteRead(ctx, 'Other')).toMatchObject({ text: 'v1' });
    expect(await readNoteText(ctx, 'Other')).toMatchObject({ text: 'v2, longer' });
    expect(peekNoteRead(ctx, 'Other')).toMatchObject({ text: 'v2, longer' });
    // A rescan marks nothing for dropping.
    await refreshAttachments(ctx);
    expect(peekNoteRead(ctx, 'Other')).toMatchObject({ text: 'v2, longer' });
  });

  it('keeps at most 20 notes', async () => {
    const files: Record<string, string> = {};
    for (let i = 0; i < 25; i++) files[`n${i}.md`] = `t${i}`;
    const { ctx } = setup(files);
    await complete(ctx);
    for (let i = 0; i < 25; i++) await readNoteText(ctx, `n${i}`);
    expect(peekNoteRead(ctx, 'n0')).toBeUndefined();
    expect(peekNoteRead(ctx, 'n24')).toMatchObject({ text: 't24' });
  });

  it('keeps at most 4 MB of text', async () => {
    const files: Record<string, string> = {};
    for (let i = 0; i < 4; i++) files[`big${i}.md`] = String(i).repeat(1_500_000);
    const { ctx } = setup(files);
    await complete(ctx);
    for (let i = 0; i < 4; i++) await readNoteText(ctx, `big${i}`);
    expect(peekNoteRead(ctx, 'big0')).toBeUndefined();
    expect(peekNoteRead(ctx, 'big3')).toMatchObject({ state: 'ok' });
  });
});

describe('readAttachmentBytes', () => {
  it('returns bytes and a type from the extension', async () => {
    const { ctx } = setup({ 'a.pdf': new Uint8Array([1, 2, 3]), 'b.weird': 'x' });
    const pdf = await readAttachmentBytes(ctx, 'a.pdf');
    expect(Array.from(pdf?.bytes ?? [])).toEqual([1, 2, 3]);
    expect(pdf?.type).toBe('application/pdf');
    expect((await readAttachmentBytes(ctx, 'b.weird'))?.type).toBe('application/octet-stream');
    expect(urls.create).not.toHaveBeenCalled();
  });

  it('is null for a missing file or an unusable folder', async () => {
    const { ctx } = setup();
    expect(await readAttachmentBytes(ctx, 'nope.png')).toBeNull();
    expect(await readAttachmentBytes({ fileHandle: null, handleId: null }, 'a.png')).toBeNull();
  });
});

describe('saveAttachment', () => {
  const config = (folder: string, extra: Record<string, unknown> = {}) => ({
    '.obsidian/app.json': JSON.stringify({ attachmentFolderPath: folder, ...extra }),
  });

  it.each([
    ['/', ''],
    ['./', 'Notes/Daily/'],
    ['./sub', 'Notes/Daily/sub/'],
    ['Assets/Deep', 'Assets/Deep/'],
  ])('writes into the %s rule', async (rule, folder) => {
    const { vault, ctx } = setup(config(rule));
    const result = await saveAttachment(ctx, png('photo.png'), 'drop');
    expect(result).toMatchObject({
      ok: true,
      saved: { path: `${folder}photo.png`, name: 'photo.png', kind: 'image' },
    });
    expect([...vault.written.keys()]).toEqual([`${folder}photo.png`]);
  });

  it('names pasted images by timestamp and links them as wikilinks in a vault', async () => {
    const { ctx } = setup(config('Assets'));
    const result = await saveAttachment(ctx, png(), 'paste');
    expect(result.ok && result.saved.name).toMatch(/^Pasted image \d{14}\.png$/);
    expect(result.ok && result.saved.markdown).toMatch(/^!\[\[Pasted image \d{14}\.png\]\]$/);
  });

  it('numbers colliding names', async () => {
    const { ctx } = setup(config('/'));
    const names = [];
    for (let i = 0; i < 3; i++) {
      const result = await saveAttachment(ctx, png('same.png'), 'drop');
      names.push(result.ok ? result.saved.name : null);
    }
    expect(names).toEqual(['same.png', 'same 1.png', 'same 2.png']);
  });

  it('does not replace a file whose name differs only in case or Unicode form', async () => {
    const { ctx, vault } = setup({
      ...config('/'),
      'photo.jpg': 'old',
      'Cafe\u0301.png': 'old nfd',
    });
    const upper = await saveAttachment(ctx, png('Photo.JPG'), 'drop');
    const nfc = await saveAttachment(ctx, png('Caf\u00e9.png'), 'drop');
    expect(upper.ok && upper.saved.name).toBe('Photo 1.JPG');
    expect(nfc.ok && nfc.saved.name).toBe('Caf\u00e9 1.png');
    expect([...vault.written.keys()].sort()).toEqual(['Caf\u00e9 1.png', 'Photo 1.JPG']);
  });

  it('probes the folder when it cannot be listed, and never writes over an existing file', async () => {
    const { ctx, vault } = setup({ ...config('/'), 'same.png': 'old' });
    (vault.root as unknown as { keys?: unknown }).keys = undefined;
    const result = await saveAttachment(ctx, png('same.png'), 'drop');
    expect(result.ok && result.saved.name).toBe('same 1.png');
    expect(vault.written.has('same.png')).toBe(false);
  });

  it('gives two saves at the same moment different names', async () => {
    const { ctx } = setup(config('/'));
    const [a, b] = await Promise.all([
      saveAttachment(ctx, png('same.png'), 'drop'),
      saveAttachment(ctx, png('SAME.png'), 'drop'),
    ]);
    const names = [a, b].map((r) => (r.ok ? r.saved.name : null));
    expect(new Set(names.map((n) => n?.toLowerCase())).size).toBe(2);
  });

  it('writes Markdown links when the setting asks, with no alt text in a vault', async () => {
    const { ctx } = setup(config('Assets'));
    useStore.getState().updateSettings({ linkStyle: 'markdown' });
    const image = await saveAttachment(ctx, png('my photo.png'), 'drop');
    // The default link format is the shortest path that stays unique.
    expect(image.ok && image.saved.markdown).toBe('![](my%20photo.png)');
    const pdf = await saveAttachment(
      ctx,
      new File(['x'], 'report.pdf', { type: 'application/pdf' }),
      'drop'
    );
    expect(pdf.ok && pdf.saved.markdown).toBe('![](report.pdf)');
    const zip = await saveAttachment(
      ctx,
      new File(['x'], 'data.zip', { type: 'application/zip' }),
      'drop'
    );
    expect(zip.ok && zip.saved.markdown).toBe('[data.zip](data.zip)');
  });

  it('writes the full path under the absolute link format', async () => {
    const { ctx } = setup(config('Assets', { newLinkFormat: 'absolute', useMarkdownLinks: true }));
    const result = await saveAttachment(ctx, png('my photo.png'), 'drop');
    expect(result.ok && result.saved.markdown).toBe('![](Assets/my%20photo.png)');
  });

  it('follows useMarkdownLinks from app.json under the auto setting', async () => {
    const { ctx } = setup(config('Assets', { useMarkdownLinks: true }));
    const result = await saveAttachment(ctx, png('a.png'), 'drop');
    expect(result.ok && result.saved.markdown).toBe('![](a.png)');
  });

  it('uses relative paths when app.json asks for them', async () => {
    const { ctx } = setup(config('Assets', { newLinkFormat: 'relative' }));
    const result = await saveAttachment(ctx, png('a.png'), 'drop');
    expect(result.ok && result.saved.markdown).toBe('![[../../Assets/a.png]]');
  });

  it('keeps the legacy behaviour without a .obsidian folder', async () => {
    const { vault, ctx } = setup();
    const result = await saveAttachment(ctx, png(), 'paste');
    expect(result.ok && result.saved.path).toMatch(
      /^Notes\/Daily\/images\/image-\d{8}-\d{6}\.png$/
    );
    expect(result.ok && result.saved.markdown).toMatch(
      /^!\[shot\]\(images\/image-\d{8}-\d{6}\.png\)$/
    );
    expect(vault.written.size).toBe(1);
  });

  it('keeps the legacy behaviour under the images-folder rule', async () => {
    const { ctx } = setup(config('Assets'));
    useStore.getState().updateSettings({ attachmentRules: 'images' });
    const result = await saveAttachment(ctx, png(), 'paste');
    expect(result.ok && result.saved.path).toMatch(/^Notes\/Daily\/images\/image-/);
  });

  it('puts the new file in the index so it resolves at once', async () => {
    const { ctx } = setup(config('Assets'));
    await complete(ctx);
    const result = await saveAttachment(ctx, png('fresh.png'), 'drop');
    expect(result.ok).toBe(true);
    expect(await resolveAttachment(ctx, 'fresh.png')).toMatchObject({
      state: 'ok',
      path: 'Assets/fresh.png',
    });
  });

  it('reports each reason it cannot save', async () => {
    const { ctx } = setup();
    Reflect.deleteProperty(window, 'showDirectoryPicker');
    expect(await saveAttachment(ctx, png(), 'paste')).toEqual({ ok: false, reason: 'unsupported' });
    window.showDirectoryPicker = vi.fn();
    expect(await saveAttachment({ fileHandle: null, handleId: null }, png(), 'paste')).toEqual({
      ok: false,
      reason: 'no-note-file',
    });
    stored.clear();
    invalidateAttachmentIndex('h1');
    expect(await saveAttachment(ctx, png(), 'paste')).toEqual({ ok: false, reason: 'no-folder' });
  });

  it('asks for write access inside a click, and says needs-permission when refused', async () => {
    const { vault, ctx } = setup({}, { permission: 'prompt' });
    // A drop carries no user activation: requesting throws.
    const request = vi
      .spyOn(vault.root, 'requestPermission')
      .mockRejectedValue(new DOMException('no activation', 'SecurityError'));
    expect(await saveAttachment(ctx, png(), 'drop')).toEqual({
      ok: false,
      reason: 'needs-permission',
    });
    expect(vault.written.size).toBe(0);
    request.mockRestore();
    // A paste or a click can ask, and the user allows it.
    expect((await saveAttachment(ctx, png(), 'paste')).ok).toBe(true);
  });

  it('says needs-permission when the user denies access', async () => {
    const { ctx } = setup({}, { permission: 'denied' });
    expect(await saveAttachment(ctx, png(), 'paste')).toEqual({
      ok: false,
      reason: 'needs-permission',
    });
  });

  it('says needs-permission when only read access is granted and writing is refused', async () => {
    const { vault, ctx } = setup(OBSIDIAN);
    vi.spyOn(vault.root, 'queryPermission').mockImplementation(async (d) =>
      d?.mode === 'read' ? 'granted' : 'prompt'
    );
    vi.spyOn(vault.root, 'requestPermission').mockResolvedValue('denied');
    expect(await saveAttachment(ctx, png(), 'paste')).toEqual({
      ok: false,
      reason: 'needs-permission',
    });
  });

  it('never throws: a failed write aborts the stream, leaves no file and toasts', async () => {
    const { vault, ctx } = setup(OBSIDIAN);
    const close = vi.fn();
    const abort = vi.fn(async () => undefined);
    const original = vault.root.getFileHandle.bind(vault.root);
    vi.spyOn(vault.root, 'getFileHandle').mockImplementation(async (name, options) => {
      const handle = await original(name, options);
      handle.createWritable = (async () => ({
        write: async () => {
          throw new Error('disk full');
        },
        close,
        abort,
      })) as unknown as typeof handle.createWritable;
      return handle;
    });
    expect(await saveAttachment(ctx, png('x.png'), 'drop')).toEqual({
      ok: false,
      reason: 'failed',
    });
    expect(abort).toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
    expect(messages().some((m) => m.includes('x.png'))).toBe(true);
    await expect(vault.root.getFileHandle('x.png')).rejects.toMatchObject({
      name: 'NotFoundError',
    });
  });

  it('never throws when the folder cannot be created', async () => {
    const { vault, ctx } = setup(config('Assets'));
    vi.spyOn(vault.root, 'getDirectoryHandle').mockImplementation(async (name) => {
      if (name === 'Assets') throw new DOMException('read only', 'NotAllowedError');
      throw new DOMException('nope', 'NotFoundError');
    });
    expect(await saveAttachment(ctx, png(), 'paste')).toEqual({ ok: false, reason: 'failed' });
  });
});

describe('module hygiene', () => {
  it('currentDocContext reads the open document', () => {
    const { ctx } = setup();
    useStore.getState().loadDocument(createDocument('# x', 'n.md'), ctx.fileHandle, 'h1');
    expect(currentDocContext()).toEqual({ fileHandle: ctx.fileHandle, handleId: 'h1' });
  });

  it('shares one scan between documents whose folders are the same entry', async () => {
    const { vault, ctx } = setup({ 'Notes/Daily/o.md': '' });
    stored.set('dir:h2', vault.root);
    const other = { fileHandle: vault.file('Notes/Daily/o.md'), handleId: 'h2' };
    const scans = scanCounter(vault.root);
    await Promise.all([complete(ctx), complete(other)]);
    expect(scans).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Review fixes: lifecycle, caches, failure handling
// ---------------------------------------------------------------------------

type Listing = { values(): AsyncIterable<FileSystemHandle> };

/** Makes one folder's listing wait for the returned release function. */
function holdDir(dir: FileSystemDirectoryHandle): () => void {
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const holder = dir as unknown as Listing;
  const original = holder.values;
  holder.values = async function* () {
    await gate;
    yield* original.call(dir);
  };
  return release;
}

/** Makes one folder's listing throw, until the returned function restores it. */
function breakDir(dir: FileSystemDirectoryHandle, name = 'NotAllowedError'): () => void {
  const holder = dir as unknown as Listing;
  const original = holder.values;
  holder.values = () => ({
    [Symbol.asyncIterator]: () => ({
      next: async () => {
        throw new DOMException('refused', name);
      },
    }),
  });
  return () => {
    holder.values = original;
  };
}

async function addFile(root: FileSystemDirectoryHandle, path: string, data = 'x'): Promise<void> {
  const segments = path.split('/');
  const name = segments.pop() as string;
  let dir = root;
  for (const segment of segments) dir = await dir.getDirectoryHandle(segment, { create: true });
  const writable = await (await dir.getFileHandle(name, { create: true })).createWritable();
  await writable.write(data);
  await writable.close();
}

const attConfig = (folder: string) => ({
  '.obsidian/app.json': JSON.stringify({ attachmentFolderPath: folder }),
});

describe('a file saved while a rescan runs', () => {
  it('is still in the index when that rescan finishes', async () => {
    const { vault, ctx } = setup({ ...attConfig('Att'), 'Att/old.png': '', 'Z/z.md': '' });
    await complete(ctx);
    const z = await vault.root.getDirectoryHandle('Z');
    const release = holdDir(z);
    const rescan = refreshAttachments(ctx);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect((await saveAttachment(ctx, png('new.png'), 'drop')).ok).toBe(true);
    release();
    await rescan;
    expect(await resolveAttachment(ctx, 'new.png')).toMatchObject({
      state: 'ok',
      path: 'Att/new.png',
    });
  });
});

describe('cached lookups and rescans', () => {
  it('a rescan lets a nearer same-named file win over the cached path', async () => {
    const { vault, ctx } = setup({ 'img/a.png': 'x' });
    await complete(ctx);
    expect(await resolveAttachment(ctx, 'a.png')).toMatchObject({ path: 'img/a.png' });
    await addFile(vault.root, 'Notes/Daily/a.png');
    await refreshAttachments(ctx);
    expect(await resolveAttachment(ctx, 'a.png')).toMatchObject({ path: 'Notes/Daily/a.png' });
  });

  it('a rescan flags a later duplicate as ambiguous', async () => {
    const { vault, ctx } = setup({ 'img/a.png': 'x' });
    await complete(ctx);
    expect(await resolveAttachment(ctx, 'a.png')).toMatchObject({ ambiguous: false });
    await addFile(vault.root, 'zzz/a.png');
    await refreshAttachments(ctx);
    expect(await resolveAttachment(ctx, 'a.png')).toMatchObject({ ambiguous: true });
  });

  it('a bare name picked while the first scan runs agrees with the finished index', async () => {
    const { vault, ctx } = setup(
      { 'x.png': '1', 'Notes/x.png': '2', ...OBSIDIAN },
      { note: 'Notes/n.md' }
    );
    const release = holdScan(vault.root);
    expect(await resolveAttachment(ctx, 'x.png')).toMatchObject({ path: 'Notes/x.png' });
    release();
    await complete(ctx);
    const settled = await resolveAttachment(ctx, 'x.png');
    // A fresh session resolving after the scan gives this very answer.
    resetAttachmentsForTest();
    await complete(ctx);
    expect(await resolveAttachment(ctx, 'x.png')).toMatchObject({
      path: (settled as { path: string }).path,
    });
  });
});

describe('links written before the index is complete', () => {
  it('never writes a bare name that is not unique in the vault', async () => {
    const { ctx } = setup({ ...attConfig('attachments'), 'Notes/Daily/photo.png': 'other' });
    const result = await saveAttachment(ctx, png('photo.png'), 'drop');
    expect(result).toMatchObject({
      ok: true,
      saved: { path: 'attachments/photo.png', markdown: '![[attachments/photo.png]]' },
    });
    await complete(ctx);
    expect(await resolveAttachment(ctx, 'attachments/photo.png')).toMatchObject({
      path: 'attachments/photo.png',
    });
  });

  it('falls back to the full path when the first scan is too slow to wait for', async () => {
    vi.useFakeTimers();
    const { vault, ctx } = setup({ ...attConfig('attachments'), 'Elsewhere/photo.png': 'other' });
    holdScan(vault.root);
    const saving = saveAttachment(ctx, png('photo.png'), 'drop');
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await saving).toMatchObject({
      ok: true,
      saved: { markdown: '![[attachments/photo.png]]' },
    });
  });

  it('still uses the shortest name once the index says it is unique', async () => {
    const { ctx } = setup(attConfig('attachments'));
    const result = await saveAttachment(ctx, png('only.png'), 'drop');
    expect(result).toMatchObject({ ok: true, saved: { markdown: '![[only.png]]' } });
  });
});

describe('notes over the size limit', () => {
  it('say so instead of looking missing', async () => {
    const { ctx } = setup({ 'Big.md': 'x'.repeat(2 * 1024 * 1024 + 1), 'Small.md': 'ok' });
    await complete(ctx);
    expect(await readNoteText(ctx, 'Big')).toMatchObject({ state: 'missing', tooLarge: true });
    expect(await readNoteText(ctx, 'Nope')).not.toHaveProperty('tooLarge');
  });
});

describe('writing a file that fails half way', () => {
  function failingHandle(
    vault: ReturnType<typeof setup>['vault'],
    patch: (handle: FileSystemFileHandle) => void
  ) {
    const original = vault.root.getFileHandle.bind(vault.root);
    vi.spyOn(vault.root, 'getFileHandle').mockImplementation(async (name, options) => {
      const handle = await original(name, options);
      if (options?.create) patch(handle);
      return handle;
    });
  }

  it('removes the empty file when createWritable throws', async () => {
    const { vault, ctx } = setup(OBSIDIAN);
    failingHandle(vault, (handle) => {
      handle.createWritable = (async () => {
        throw new DOMException('locked', 'NoModificationAllowedError');
      }) as unknown as typeof handle.createWritable;
    });
    expect(await saveAttachment(ctx, png('a.png'), 'drop')).toEqual({
      ok: false,
      reason: 'failed',
    });
    await expect(vault.root.getFileHandle('a.png')).rejects.toMatchObject({
      name: 'NotFoundError',
    });
  });

  it('removes the empty file when close throws', async () => {
    const { vault, ctx } = setup(OBSIDIAN);
    const abort = vi.fn(async () => undefined);
    failingHandle(vault, (handle) => {
      handle.createWritable = (async () => ({
        write: async () => undefined,
        close: async () => {
          throw new DOMException('full', 'QuotaExceededError');
        },
        abort,
      })) as unknown as typeof handle.createWritable;
    });
    expect(await saveAttachment(ctx, png('a.png'), 'drop')).toEqual({
      ok: false,
      reason: 'failed',
    });
    expect(abort).toHaveBeenCalled();
    await expect(vault.root.getFileHandle('a.png')).rejects.toMatchObject({
      name: 'NotFoundError',
    });
  });
});

describe('a folder that cannot be listed during a scan', () => {
  it('keeps what a rescan knew about it', async () => {
    const { vault, ctx } = setup({ 'Other/b.png': '' });
    await complete(ctx);
    const other = await vault.root.getDirectoryHandle('Other');
    const restore = breakDir(other);
    await refreshAttachments(ctx);
    expect((await complete(ctx))?.index.paths).toContain('Other/b.png');
    expect(await resolveAttachment(ctx, 'b.png')).toMatchObject({ state: 'ok' });
    restore();
  });

  it('retries after a refocus instead of treating the gap as final', async () => {
    vi.useFakeTimers();
    const { vault, ctx } = setup({ 'Other/b.png': '' });
    await complete(ctx);
    const restore = breakDir(await vault.root.getDirectoryHandle('Other'));
    await refreshAttachments(ctx);
    restore();
    await vi.advanceTimersByTimeAsync(11_000);
    await resolveAttachment(ctx, 'b.png');
    await vi.advanceTimersByTimeAsync(0);
    expect(await resolveAttachment(ctx, 'b.png')).toMatchObject({ state: 'ok' });
  });

  it('grantAttachmentAccess rescans a folder whose first listing failed', async () => {
    const { vault, ctx } = setup({ 'img/a.png': '' });
    const restore = breakDir(vault.root);
    expect((await complete(ctx))?.index.paths).toEqual([]);
    restore();
    expect(await grantAttachmentAccess(ctx)).toBe(true);
    await vi.waitFor(async () =>
      expect(await resolveAttachment(ctx, 'a.png')).toMatchObject({ state: 'ok' })
    );
  });
});

describe('a lapsed permission during a refocus', () => {
  it('does not scan, and a later grant brings the index back', async () => {
    vi.useFakeTimers();
    const { vault, ctx } = setup({ 'img/a.png': '', 'img/b.png': '' });
    useStore.getState().loadDocument(createDocument('# n', 'n.md'), ctx.fileHandle, 'h1');
    await complete(ctx);
    subscribeAttachments(() => undefined);
    await resolveAttachment(ctx, 'a.png');
    const restore = breakDir(vault.root);
    vault.setPermission('prompt');
    await vi.advanceTimersByTimeAsync(60_000);
    window.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(0);
    vault.setPermission('granted');
    restore();
    expect(await grantAttachmentAccess(ctx)).toBe(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(await resolveAttachment(ctx, 'b.png')).toMatchObject({ state: 'ok' });
  });

  it('keeps the old index while the refocus is skipped', async () => {
    vi.useFakeTimers();
    const { vault, ctx } = setup({ 'img/a.png': '' });
    useStore.getState().loadDocument(createDocument('# n', 'n.md'), ctx.fileHandle, 'h1');
    await complete(ctx);
    subscribeAttachments(() => undefined);
    const scans = scanCounter(vault.root);
    vault.setPermission('prompt');
    await vi.advanceTimersByTimeAsync(60_000);
    window.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(0);
    expect(scans).not.toHaveBeenCalled();
  });
});

describe('Save As onto a document that already has a folder', () => {
  it('keeps that document’s own choice', async () => {
    const { vault } = setup({ 'Sub/b.md': '' });
    const sub = await vault.root.getDirectoryHandle('Sub');
    stored.set('dir:a', sub);
    stored.set('dir:b', vault.root);
    await adoptAttachmentFolder('a', 'b', vault.file('Sub/b.md'));
    expect(stored.get('dir:b')).toBe(vault.root);
  });
});

describe('the truncated-index toast', () => {
  it('shows once per folder, not after every scan', async () => {
    const files: Record<string, string> = {};
    for (let i = 0; i < 50_050; i++) files[`d${i % 40}/f${i}.png`] = '';
    const { ctx } = setup(files);
    await complete(ctx);
    await refreshAttachments(ctx);
    await refreshAttachments(ctx);
    expect(messages().filter((m) => m.includes('50000'))).toHaveLength(1);
  }, 60_000);
});

describe('vault configuration that cannot be read', () => {
  it('is not cached as "not a vault"', async () => {
    const { vault, ctx } = setup(attConfig('Att'));
    const original = vault.root.getDirectoryHandle.bind(vault.root);
    let failures = 1;
    vi.spyOn(vault.root, 'getDirectoryHandle').mockImplementation(async (name, options) => {
      if (name === '.obsidian' && failures-- > 0) {
        throw new DOMException('denied', 'NotAllowedError');
      }
      return original(name, options);
    });
    expect(await attachmentStatus(ctx)).toMatchObject({ isVaultRoot: false });
    expect(await attachmentStatus(ctx)).toMatchObject({ isVaultRoot: true });
  });

  it('does not save into the legacy folder when the vault rules cannot be read', async () => {
    const { vault, ctx } = setup(attConfig('Att'));
    const original = vault.root.getDirectoryHandle.bind(vault.root);
    let failures = 1;
    vi.spyOn(vault.root, 'getDirectoryHandle').mockImplementation(async (name, options) => {
      if (name === '.obsidian' && failures-- > 0) {
        throw new DOMException('denied', 'NotAllowedError');
      }
      return original(name, options);
    });
    expect(await saveAttachment(ctx, png('p.png'), 'drop')).toEqual({
      ok: false,
      reason: 'failed',
    });
    expect(vault.written.size).toBe(0);
    expect(await saveAttachment(ctx, png('p.png'), 'drop')).toMatchObject({
      ok: true,
      saved: { path: 'Att/p.png' },
    });
  });
});

describe('object URLs of a document on screen', () => {
  const many = (n: number) => {
    const files: Record<string, string> = {};
    for (let i = 0; i < n; i++) files[`p${i}.png`] = '';
    return files;
  };

  it('are not revoked for the active document, even past 500', async () => {
    const { ctx } = setup(many(510));
    useStore.getState().loadDocument(createDocument('# n', 'n.md'), ctx.fileHandle, 'h1');
    await complete(ctx);
    for (let i = 0; i < 510; i++) await resolveAttachment(ctx, `p${i}.png`);
    expect(urls.revoke).not.toHaveBeenCalled();
  }, 30_000);

  it('are evicted from other documents first', async () => {
    const { vault, ctx } = setup(many(503));
    stored.set('dir:h2', vault.root);
    const other = { fileHandle: ctx.fileHandle, handleId: 'h2' };
    await complete(ctx);
    for (let i = 0; i < 3; i++) await resolveAttachment(other, `p${i}.png`);
    useStore.getState().loadDocument(createDocument('# n', 'n.md'), ctx.fileHandle, 'h1');
    for (let i = 3; i < 503; i++) await resolveAttachment(ctx, `p${i}.png`);
    expect(urls.revoke).toHaveBeenCalledTimes(3);
    expect(urls.revoke).toHaveBeenCalledWith('blob:fake/1');
  }, 30_000);
});

describe('the miss count behind the banner', () => {
  it('belongs to the document that missed', async () => {
    const { vault, ctx } = setup({ 'other.md': '' });
    stored.set('dir:h2', vault.root);
    const other = { fileHandle: vault.file('other.md'), handleId: 'h2' };
    await complete(ctx);
    await resolveAttachment(ctx, 'missing.png');
    expect(await attachmentStatus(ctx)).toMatchObject({ misses: 1 });
    expect(await attachmentStatus(other)).toMatchObject({ misses: 0 });
  });

  it('drops a miss once the same target resolves', async () => {
    const { vault, ctx } = setup();
    await complete(ctx);
    const listener = vi.fn();
    subscribeAttachments(listener);
    expect(await resolveAttachment(ctx, 'late.png', { markdown: true })).toMatchObject({
      state: 'missing',
    });
    expect(await attachmentStatus(ctx)).toMatchObject({ misses: 1 });
    await addFile(vault.root, 'Notes/Daily/late.png');
    listener.mockClear();
    expect(await resolveAttachment(ctx, 'late.png', { markdown: true })).toMatchObject({
      state: 'ok',
    });
    expect(await attachmentStatus(ctx)).toMatchObject({ misses: 0 });
    await vi.waitFor(() => expect(listener).toHaveBeenCalled());
  });

  describe('when the text of the open note changes', () => {
    /** Opens the note with this text and has a view miss the given target. */
    async function missed(markdown: string, target: string) {
      const { vault, ctx } = setup({ 'Notes/Daily/photo.png': 'x' });
      useStore.getState().loadDocument(createDocument(markdown, 'n.md'), ctx.fileHandle, 'h1');
      await complete(ctx);
      const listener = vi.fn();
      subscribeAttachments(listener);
      await resolveAttachment(ctx, target);
      expect(await attachmentStatus(ctx)).toMatchObject({ misses: 1 });
      listener.mockClear();
      return { vault, ctx, listener };
    }

    it('drops a miss for a target that was edited into another one', async () => {
      const { ctx, listener } = await missed('![[typo.png]]', 'typo.png');
      useStore.getState().setMarkdown('![[photo.png]]', 'text');
      await resolveAttachment(ctx, 'photo.png');
      await vi.waitFor(async () =>
        expect(await attachmentStatus(ctx)).toMatchObject({ misses: 0 })
      );
      expect(listener).toHaveBeenCalled();
    });

    it('drops a miss when its embed is deleted', async () => {
      const { ctx } = await missed('![[typo.png]]', 'typo.png');
      useStore.getState().setMarkdown('nothing here', 'text');
      await vi.waitFor(async () =>
        expect(await attachmentStatus(ctx)).toMatchObject({ misses: 0 })
      );
    });

    it('keeps a miss whose embed is still there, however its path is spelled', async () => {
      const { ctx } = await missed('![](my%20pic.png)', 'my pic.png');
      useStore.getState().setMarkdown('![](my%20pic.png)\n\nmore', 'text');
      await new Promise((resolve) => setTimeout(resolve, 700));
      expect(await attachmentStatus(ctx)).toMatchObject({ misses: 1 });
    });

    it('leaves the misses of an embedded note alone', async () => {
      const { vault, ctx } = setup({ 'other.md': '![[gone.png]]' });
      useStore.getState().loadDocument(createDocument('![[other]]', 'n.md'), ctx.fileHandle, 'h1');
      await complete(ctx);
      subscribeAttachments(() => undefined);
      await resolveAttachment(ctx, 'gone.png', { fromNotePath: 'other.md' });
      expect(await attachmentStatus(ctx)).toMatchObject({ misses: 1 });
      useStore.getState().setMarkdown('![[other]] edited', 'text');
      await new Promise((resolve) => setTimeout(resolve, 700));
      expect(await attachmentStatus(ctx)).toMatchObject({ misses: 1 });
      expect(vault).toBeDefined();
    });
  });

  it('starts again when the document is loaded again', async () => {
    const { ctx } = setup();
    useStore.getState().loadDocument(createDocument('# n', 'n.md'), ctx.fileHandle, 'h1');
    await complete(ctx);
    subscribeAttachments(() => undefined);
    await resolveAttachment(ctx, 'missing.png');
    expect(await attachmentStatus(ctx)).toMatchObject({ misses: 1 });
    useStore.getState().loadDocument(createDocument('# n2', 'n.md'), ctx.fileHandle, 'h1');
    expect(await attachmentStatus(ctx)).toMatchObject({ misses: 0 });
  });
});
