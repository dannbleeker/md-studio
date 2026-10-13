import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { classifyTarget } from '@/domain/embeds';
import { startChain } from '@/domain/transclusion';
import type { DocContext, ResolvedAttachment } from '@/services/attachments';
import { resetStoreForTest } from '@/store';
import {
  type EmbedRenderContext,
  flushPendingEmbeds,
  mountEmbed,
  mountImageResolver,
} from './embedRender';

const mocks = vi.hoisted(() => ({
  resolveAttachment: vi.fn(),
  peekAttachment: vi.fn(),
  readNoteText: vi.fn(),
  peekNoteRead: vi.fn(),
  noteRelativePath: vi.fn(),
  getVault: vi.fn(),
}));
const listeners = vi.hoisted(() => new Set<() => void>());

vi.mock('@/services/attachments', () => ({
  ...mocks,
  subscribeAttachments: (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
}));

/** Reports an element as visible only when the test says so. */
class FakeObserver {
  static instances: FakeObserver[] = [];
  static options: IntersectionObserverInit | undefined;
  private targets = new Set<Element>();
  constructor(
    private callback: (entries: IntersectionObserverEntry[]) => void,
    options?: IntersectionObserverInit
  ) {
    FakeObserver.options = options;
    FakeObserver.instances.push(this);
  }
  observe(el: Element) {
    this.targets.add(el);
  }
  unobserve(el: Element) {
    this.targets.delete(el);
  }
  disconnect() {
    this.targets.clear();
  }
  get observed() {
    return [...this.targets];
  }
  show(el: Element) {
    if (!this.targets.has(el)) return;
    this.callback([{ target: el, isIntersecting: true } as IntersectionObserverEntry]);
  }
}

const observer = () => {
  const first = FakeObserver.instances[0];
  if (!first) throw new Error('no observer yet');
  return first;
};

const ok = (
  over: Partial<Extract<ResolvedAttachment, { state: 'ok' }>> = {}
): ResolvedAttachment => ({
  state: 'ok',
  path: 'a.png',
  name: 'a.png',
  kind: 'image',
  url: 'blob:a',
  ambiguous: false,
  ...over,
});

let host: HTMLElement;
const doc: DocContext = { fileHandle: null, handleId: 'h1' };
const context = (): EmbedRenderContext => ({
  doc: () => doc,
  chain: startChain(null),
  fromNotePath: undefined,
  signal: { cancelled: false },
});

beforeAll(() => {
  vi.stubGlobal('IntersectionObserver', FakeObserver);
});

beforeEach(() => {
  resetStoreForTest();
  for (const fn of Object.values(mocks)) fn.mockReset();
  mocks.peekAttachment.mockReturnValue(undefined);
  mocks.peekNoteRead.mockReturnValue(undefined);
  mocks.noteRelativePath.mockResolvedValue('Host.md');
  host = document.createElement('span');
  document.body.append(host);
});

afterEach(() => {
  document.body.replaceChildren();
});

describe('deferral until visible', () => {
  it('resolves nothing until the embed is near the viewport', async () => {
    mocks.resolveAttachment.mockResolvedValue(ok());
    mountEmbed(host, '![[a.png]]', context());
    expect(FakeObserver.options?.rootMargin).toBe('400px');
    expect(mocks.resolveAttachment).not.toHaveBeenCalled();
    expect(host.textContent).toBe('Loading…');
    observer().show(host);
    await vi.waitFor(() => expect(host.querySelector('img')).not.toBeNull());
    expect(mocks.resolveAttachment).toHaveBeenCalledTimes(1);
  });

  it('a hidden pane never fires, so nothing loads', async () => {
    mocks.resolveAttachment.mockResolvedValue(ok());
    mountEmbed(host, '![[a.png]]', context());
    await Promise.resolve();
    expect(mocks.resolveAttachment).not.toHaveBeenCalled();
  });

  it('draws an image from a synchronous cache hit without waiting', () => {
    mocks.peekAttachment.mockReturnValue(ok());
    mountEmbed(host, '![[a.png]]', context());
    expect(host.querySelector('img')?.getAttribute('src')).toBe('blob:a');
  });

  it('does not build a PDF frame from a cache hit until visible', async () => {
    mocks.peekAttachment.mockReturnValue(
      ok({ path: 'x.pdf', name: 'x.pdf', kind: 'pdf', url: 'blob:pdf' })
    );
    mocks.resolveAttachment.mockResolvedValue(
      ok({ path: 'x.pdf', name: 'x.pdf', kind: 'pdf', url: 'blob:pdf' })
    );
    mountEmbed(host, '![[x.pdf]]', context());
    expect(host.querySelector('iframe')).toBeNull();
    observer().show(host);
    await vi.waitFor(() => expect(host.querySelector('iframe')).not.toBeNull());
  });

  it('stops watching when destroyed before it became visible', async () => {
    mocks.resolveAttachment.mockResolvedValue(ok());
    const view = mountEmbed(host, '![[a.png]]', context());
    expect(observer().observed).toContain(host);
    view.destroy();
    expect(observer().observed).not.toContain(host);
    observer().show(host);
    await Promise.resolve();
    expect(mocks.resolveAttachment).not.toHaveBeenCalled();
  });

  it('defers a Markdown image the same way and keeps its written src meanwhile', async () => {
    mocks.resolveAttachment.mockResolvedValue(ok({ url: 'blob:md' }));
    const img = document.createElement('img');
    img.setAttribute('src', 'images/a%20b.png');
    host.append(img);
    mountImageResolver(img, 'images/a%20b.png', { doc: () => doc, signal: { cancelled: false } });
    expect(mocks.resolveAttachment).not.toHaveBeenCalled();
    expect(img.getAttribute('src')).toBe('images/a%20b.png');
    observer().show(img);
    await vi.waitFor(() => expect(img.getAttribute('src')).toBe('blob:md'));
    // Decoded path first, the literal one as the retry.
    expect(mocks.resolveAttachment).toHaveBeenCalledWith(doc, 'images/a b.png', {
      markdown: true,
      alternates: ['images/a%20b.png'],
    });
  });
});

describe('printing', () => {
  // Embeds left waiting by earlier tests are loaded (and fail harmlessly) here.
  beforeEach(async () => {
    await flushPendingEmbeds();
    mocks.resolveAttachment.mockReset();
  });

  it('loads every embed that never became visible, and waits for them', async () => {
    mocks.resolveAttachment.mockResolvedValue(ok());
    const second = document.createElement('span');
    document.body.append(second);
    mountEmbed(host, '![[a.png]]', context());
    mountEmbed(second, '![[b.png]]', context());
    const img = document.createElement('img');
    img.setAttribute('src', 'images/c.png');
    document.body.append(img);
    mountImageResolver(img, 'images/c.png', { doc: () => doc, signal: { cancelled: false } });
    expect(mocks.resolveAttachment).not.toHaveBeenCalled();

    await flushPendingEmbeds();

    // Settled by the time the promise resolves, not merely started.
    expect(host.querySelector('img')).not.toBeNull();
    expect(second.querySelector('img')).not.toBeNull();
    expect(img.getAttribute('src')).toBe('blob:a');
    // Nothing is left for the observer to load a second time.
    expect(observer().observed).not.toContain(host);
    mocks.resolveAttachment.mockClear();
    observer().show(host);
    await Promise.resolve();
    expect(mocks.resolveAttachment).not.toHaveBeenCalled();
  });

  it('waits for an embed that is already loading', async () => {
    let finish!: (value: ResolvedAttachment) => void;
    mocks.resolveAttachment.mockReturnValue(
      new Promise<ResolvedAttachment>((resolve) => {
        finish = resolve;
      })
    );
    mountEmbed(host, '![[a.png]]', context());
    observer().show(host);
    expect(mocks.resolveAttachment).toHaveBeenCalledTimes(1);
    let settled = false;
    const flushed = flushPendingEmbeds().then(() => {
      settled = true;
    });
    for (let i = 0; i < 5; i++) await Promise.resolve();
    expect(settled).toBe(false);
    expect(host.textContent).toBe('Loading…');
    finish(ok());
    await flushed;
    expect(host.querySelector('img')).not.toBeNull();
  });

  it('waits for the first scan of the vault when an embed is still waiting on the index', async () => {
    let scanned = false;
    mocks.resolveAttachment.mockImplementation(async () =>
      scanned ? ok({ path: 'deep/pic.png', name: 'pic.png' }) : { state: 'scanning' }
    );
    // The scan finishing notifies every view, as the real service does.
    mocks.getVault.mockImplementation(async () => {
      scanned = true;
      for (const listener of [...listeners]) listener();
      return { complete: true };
    });
    mountEmbed(host, '![[pic.png]]', context());
    observer().show(host);
    await vi.waitFor(() => expect(mocks.resolveAttachment).toHaveBeenCalled());
    for (let i = 0; i < 5; i++) await Promise.resolve();
    expect(host.textContent).toBe('Loading…');

    await flushPendingEmbeds();

    expect(mocks.getVault).toHaveBeenCalledWith(doc, { complete: true });
    expect(host.querySelector('img')).not.toBeNull();
  });

  it('does not wait on a scan once nothing is waiting for it', async () => {
    mocks.resolveAttachment.mockResolvedValue(ok());
    mountEmbed(host, '![[a.png]]', context());
    observer().show(host);
    await vi.waitFor(() => expect(host.querySelector('img')).not.toBeNull());
    await flushPendingEmbeds();
    expect(mocks.getVault).not.toHaveBeenCalled();
  });

  it('does not wait forever for a scan that never finishes', async () => {
    vi.useFakeTimers();
    try {
      mocks.resolveAttachment.mockResolvedValue({ state: 'scanning' });
      mocks.getVault.mockReturnValue(new Promise(() => {}));
      mountEmbed(host, '![[pic.png]]', context());
      observer().show(host);
      let settled = false;
      void flushPendingEmbeds().then(() => {
        settled = true;
      });
      await vi.advanceTimersByTimeAsync(30_000);
      expect(settled).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('starts the loads when the browser is about to print', async () => {
    mocks.resolveAttachment.mockResolvedValue(ok());
    mountEmbed(host, '![[a.png]]', context());
    expect(host.textContent).toBe('Loading…');
    window.dispatchEvent(new Event('beforeprint'));
    await vi.waitFor(() => expect(host.querySelector('img')).not.toBeNull());
  });

  it('does not load an embed that was destroyed first', async () => {
    mocks.resolveAttachment.mockResolvedValue(ok());
    mountEmbed(host, '![[a.png]]', context()).destroy();
    await flushPendingEmbeds();
    expect(mocks.resolveAttachment).not.toHaveBeenCalled();
  });

  it('loadAllEmbeds is what the Print command waits for', async () => {
    const { loadAllEmbeds, withEmbedRender } = await import('./embedView');
    await new Promise<void>((resolve) => withEmbedRender(() => resolve()));
    mocks.resolveAttachment.mockResolvedValue(ok());
    mountEmbed(host, '![[a.png]]', context());
    await loadAllEmbeds();
    expect(host.querySelector('img')).not.toBeNull();
  });

  it('printDocument prints only after every embed has loaded, and Ctrl+P and the command share it', async () => {
    const { printDocument, withEmbedRender } = await import('./embedView');
    await new Promise<void>((resolve) => withEmbedRender(() => resolve()));
    mocks.resolveAttachment.mockResolvedValue(ok());
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    mountEmbed(host, '![[a.png]]', context());
    expect(host.querySelector('img')).toBeNull();
    await printDocument();
    // Loaded by the time print starts, not merely started.
    expect(host.querySelector('img')).not.toBeNull();
    expect(print).toHaveBeenCalledTimes(1);
    print.mockRestore();
  });

  it('turns lazy images eager and waits for them to decode before it resolves', async () => {
    const lazy = document.createElement('img');
    lazy.setAttribute('src', 'blob:one');
    lazy.setAttribute('loading', 'lazy');
    const plain = document.createElement('img');
    plain.setAttribute('src', 'blob:two');
    document.body.append(lazy, plain);
    let finish!: () => void;
    const decode = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        })
    );
    lazy.decode = decode;
    plain.decode = () => Promise.reject(new Error('broken image'));
    let settled = false;
    const flushed = flushPendingEmbeds().then(() => {
      settled = true;
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(lazy.getAttribute('loading')).toBe('eager');
    expect(decode).toHaveBeenCalled();
    expect(settled).toBe(false);
    finish();
    await flushed;
    expect(settled).toBe(true);
  });

  it('does not hang on an image that never decodes', async () => {
    vi.useFakeTimers();
    try {
      const stuck = document.createElement('img');
      stuck.setAttribute('src', 'blob:stuck');
      stuck.decode = () => new Promise<void>(() => {});
      document.body.append(stuck);
      let settled = false;
      void flushPendingEmbeds().then(() => {
        settled = true;
      });
      await vi.advanceTimersByTimeAsync(6000);
      expect(settled).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('loads the embeds a transcluded note registers while it loads', async () => {
    mocks.readNoteText.mockResolvedValue({
      state: 'ok',
      path: 'Note.md',
      text: '![[inner.png]]\n',
      lastModified: 1,
      size: 15,
    });
    mocks.resolveAttachment.mockImplementation(
      async (_d: DocContext, target: string): Promise<ResolvedAttachment> => ({
        state: 'ok',
        path: target,
        name: target,
        kind: 'image',
        url: `blob:${target}`,
        ambiguous: false,
      })
    );
    mountEmbed(host, '![[Note]]', context());
    await flushPendingEmbeds();
    // The inner embed only exists once the note is drawn; the flush went round again for it.
    expect(host.querySelector('.md-transclusion img')?.getAttribute('src')).toBe('blob:inner.png');
  });

  it('resolves a Markdown image with an extension outside the image table to the vault file', async () => {
    for (const name of ['icon.ico', 'x.jfif', 'x.tiff', 'x.apng', 'x.svgz', 'noext']) {
      mocks.resolveAttachment.mockResolvedValue(
        // Same classifier the real resolver uses: an extensionless name comes back as 'note'.
        ok({ path: `Notes/${name}`, name, kind: classifyTarget(name), url: `blob:${name}` })
      );
      const img = document.createElement('img');
      img.setAttribute('src', name);
      document.body.append(img);
      mountImageResolver(img, name, { doc: () => doc, signal: { cancelled: false } });
      await flushPendingEmbeds();
      expect(img.getAttribute('src'), name).toBe(`blob:${name}`);
    }
  });

  it('leaves the written src when a Markdown image resolves to a .md note', async () => {
    mocks.resolveAttachment.mockResolvedValue(
      ok({ path: 'Notes/b.md', name: 'b.md', kind: 'note', url: 'blob:note' })
    );
    const img = document.createElement('img');
    img.setAttribute('src', 'b');
    document.body.append(img);
    mountImageResolver(img, 'b', { doc: () => doc, signal: { cancelled: false } });
    await flushPendingEmbeds();
    expect(img.getAttribute('src')).toBe('b');
  });

  it('leaves the written src when the file is a note, PDF, audio or video', async () => {
    mocks.resolveAttachment.mockResolvedValue(
      ok({ path: 'a.pdf', name: 'a.pdf', kind: 'pdf', url: 'blob:pdf' })
    );
    const img = document.createElement('img');
    img.setAttribute('src', 'a.pdf');
    document.body.append(img);
    mountImageResolver(img, 'a.pdf', { doc: () => doc, signal: { cancelled: false } });
    await flushPendingEmbeds();
    expect(img.getAttribute('src')).toBe('a.pdf');
  });
});
