import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
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
}));

vi.mock('@/services/attachments', () => ({
  ...mocks,
  subscribeAttachments: () => () => {},
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
});
