import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startChain } from '@/domain/transclusion';
import { resetAttachmentsForTest } from '@/services/attachments';
import { resetStoreForTest, useStore } from '@/store';
import { registerPrepareForPrint } from '@/store/flush';
import { fakeVault, stubObjectUrls } from '../../../test/fakeFs';
import { liveDocContext, printDocument, withEmbedRender } from './embedView';

// The real attachment service and a fake vault: the case is the service answering "scanning".
const stored = new Map<string, unknown>();
vi.mock('@/services/handleStore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/handleStore')>()),
  getHandleAt: async (key: string) => stored.get(key) ?? null,
  putHandleAt: async (key: string, handle: unknown) => {
    stored.set(key, handle);
  },
  listHandlesWithPrefix: async (prefix: string) =>
    [...stored].filter(([key]) => key.startsWith(prefix)),
}));

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

const NOTE = 'Notes/n.md';

beforeEach(() => {
  stored.clear();
  resetAttachmentsForTest();
  resetStoreForTest();
  stubObjectUrls();
  window.showDirectoryPicker = vi.fn();
});

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('printing an open note', () => {
  it('draws an embed still waiting for the first vault scan before the printout starts', async () => {
    const vault = fakeVault({ [NOTE]: '# n', 'deep/dir/pic.png': 'png' });
    stored.set('dir:h1', vault.root);
    useStore.setState({ fileHandle: vault.file(NOTE), handleId: 'h1' });
    // A bare name is not at the root or in the attachment folder, so only the index finds it.
    const release = holdScan(vault.root);

    const host = document.createElement('span');
    document.body.append(host);
    await new Promise<void>((resolve) => {
      withEmbedRender((render) => {
        render.mountEmbed(host, '![[pic.png]]', {
          doc: liveDocContext,
          chain: startChain(null),
          fromNotePath: undefined,
          signal: { cancelled: false },
        });
        resolve();
      });
    });
    await vi.waitFor(() => expect(host.textContent).toBe('Loading…'));

    let shown = '';
    vi.spyOn(window, 'print').mockImplementation(() => {
      shown = host.innerHTML;
    });
    const printing = printDocument();
    // The scan ends a moment after Ctrl+P was pressed.
    setTimeout(release, 20);
    await printing;

    expect(shown).toContain('<img');
    expect(host.textContent).not.toContain('Loading');
  });

  it('lets the visual pane catch up before the printout starts', async () => {
    const order: string[] = [];
    const unregister = registerPrepareForPrint(() => order.push('prepare'));
    vi.spyOn(window, 'print').mockImplementation(() => {
      order.push('print');
    });
    await printDocument();
    unregister();
    expect(order).toEqual(['prepare', 'print']);
  });
});
