import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_LIVE_TRANSCLUSIONS, startChain } from '@/domain/transclusion';
import type { DocContext, NoteRead, ResolvedAttachment } from '@/services/attachments';
import { resetStoreForTest, useStore } from '@/store';
import { stubObjectUrls } from '../../../test/fakeFs';
import { type EmbedRenderContext, mountEmbed } from './embedRender';

type Listener = () => void;
const listeners = new Set<Listener>();
const unsubscribed = vi.fn();

const mocks = vi.hoisted(() => ({
  resolveAttachment: vi.fn(),
  peekAttachment: vi.fn(),
  readNoteText: vi.fn(),
  peekNoteRead: vi.fn(),
  noteRelativePath: vi.fn(),
}));

vi.mock('@/services/attachments', () => ({
  resolveAttachment: mocks.resolveAttachment,
  peekAttachment: mocks.peekAttachment,
  readNoteText: mocks.readNoteText,
  peekNoteRead: mocks.peekNoteRead,
  noteRelativePath: mocks.noteRelativePath,
  subscribeAttachments: (listener: Listener) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
      unsubscribed();
    };
  },
}));

const notify = () => {
  for (const listener of [...listeners]) listener();
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

const noteOk = (over: Partial<Extract<NoteRead, { state: 'ok' }>> = {}): NoteRead => ({
  state: 'ok',
  path: 'Note.md',
  text: '# Title\n\nBody text.\n',
  lastModified: 1,
  size: 20,
  ...over,
});

let current: DocContext;
let host: HTMLElement;
let signal: { cancelled: boolean };

const context = (over: Partial<EmbedRenderContext> = {}): EmbedRenderContext => ({
  doc: () => current,
  chain: startChain(null),
  fromNotePath: undefined,
  signal,
  ...over,
});

// Note views are counted across the page; a test that leaves one mounted must not use up
// the slots of the next.
const mounted: Array<{ destroy(): void }> = [];
const track = <T extends { destroy(): void }>(view: T): T => {
  mounted.push(view);
  return view;
};

const mount = (raw: string, over: Partial<EmbedRenderContext> = {}) =>
  track(mountEmbed(host, raw, context(over)));

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};

beforeEach(() => {
  resetStoreForTest();
  stubObjectUrls();
  listeners.clear();
  unsubscribed.mockClear();
  for (const fn of Object.values(mocks)) fn.mockReset();
  mocks.peekAttachment.mockReturnValue(undefined);
  mocks.peekNoteRead.mockReturnValue(undefined);
  mocks.noteRelativePath.mockResolvedValue('Host.md');
  current = { fileHandle: null, handleId: 'h1' };
  signal = { cancelled: false };
  host = document.createElement('span');
  document.body.append(host);
});

afterEach(() => {
  for (const view of mounted.splice(0)) view.destroy();
  document.body.replaceChildren();
});

describe('placeholders and states', () => {
  it('shows the loading chip first, then the image with its size and alt', async () => {
    const pending = deferred<ResolvedAttachment>();
    mocks.resolveAttachment.mockReturnValue(pending.promise);
    mount('![[a b.png|nice|300x200]]');
    expect(host.textContent).toBe('Loading…');
    pending.resolve(ok());
    await vi.waitFor(() => expect(host.querySelector('img')).not.toBeNull());
    const img = host.querySelector('img');
    expect(img?.getAttribute('src')).toBe('blob:a');
    expect(img?.alt).toBe('nice');
    expect(img?.width).toBe(300);
    expect(img?.height).toBe(200);
    // The embed itself is deferred until visible; a lazy image would be blank in a printout.
    expect(img?.loading).not.toBe('lazy');
    // The target is passed on exactly as written.
    expect(mocks.resolveAttachment).toHaveBeenCalledWith(current, 'a b.png', {});
  });

  it('passes the note a transcluded embed sits in as the place to resolve from', async () => {
    mocks.resolveAttachment.mockResolvedValue(ok());
    mount('![[a.png]]', { fromNotePath: 'Sub/inner.md' });
    await vi.waitFor(() => expect(host.querySelector('img')).not.toBeNull());
    expect(mocks.resolveAttachment).toHaveBeenCalledWith(current, 'a.png', {
      fromNotePath: 'Sub/inner.md',
    });
  });

  it('keeps the loading chip while the index is scanning, never Not found', async () => {
    mocks.resolveAttachment.mockResolvedValue({ state: 'scanning' });
    mount('![[late.png]]');
    await vi.waitFor(() => expect(mocks.resolveAttachment).toHaveBeenCalled());
    await Promise.resolve();
    expect(host.textContent).toBe('Loading…');
    expect(host.textContent).not.toContain('Not found');
  });

  it('a scanning answer does not replace what is already drawn', async () => {
    mocks.resolveAttachment.mockResolvedValue(ok());
    mount('![[a.png]]');
    await vi.waitFor(() => expect(host.querySelector('img')).not.toBeNull());
    mocks.resolveAttachment.mockResolvedValue({ state: 'scanning' });
    notify();
    await vi.waitFor(() => expect(mocks.resolveAttachment).toHaveBeenCalledTimes(2));
    await Promise.resolve();
    expect(host.querySelector('img')).not.toBeNull();
  });

  it('shows the original token and the label when the file is missing', async () => {
    mocks.resolveAttachment.mockResolvedValue({ state: 'missing', rootLooksLikeVault: true });
    mount('![[gone.png|200]]');
    await vi.waitFor(() => expect(host.querySelector('.md-embed-missing')).not.toBeNull());
    const chip = host.querySelector('.md-embed-missing');
    expect(chip?.textContent).toContain('Not found: gone.png');
    expect(chip?.querySelector('code')?.textContent).toBe('![[gone.png|200]]');
    expect(chip?.getAttribute('title')).toBeNull();
  });

  it('adds the folder hint when the chosen folder does not look like a vault', async () => {
    mocks.resolveAttachment.mockResolvedValue({ state: 'missing', rootLooksLikeVault: false });
    mount('![[gone.png]]');
    await vi.waitFor(() => expect(host.querySelector('.md-embed-missing')).not.toBeNull());
    expect(host.querySelector('.md-embed-missing')?.getAttribute('title')).toMatch(/parent folder/);
  });

  it('shows an unavailable placeholder with the token', async () => {
    mocks.resolveAttachment.mockResolvedValue({ state: 'unavailable', reason: 'needs-permission' });
    mount('![[a.png]]');
    await vi.waitFor(() => expect(host.querySelector('.md-embed-unavailable')).not.toBeNull());
    expect(host.querySelector('code')?.textContent).toBe('![[a.png]]');
  });

  it('puts a tooltip on an ambiguous match naming the file shown', async () => {
    mocks.resolveAttachment.mockResolvedValue(ok({ path: 'img/a.png', ambiguous: true }));
    mount('![[a.png]]');
    await vi.waitFor(() => expect(host.querySelector('img')).not.toBeNull());
    expect(host.querySelector('img')?.title).toBe(
      'Several files share this name. Showing img/a.png.'
    );
  });

  it.each([
    ['![[x.pdf]]', 'pdf', '.md-embed-pdf'],
    ['![[x.mp3]]', 'audio', 'audio'],
    ['![[x.webm]]', 'video', 'video'],
    ['![[x.zip]]', 'other', '.md-embed-file'],
  ] as const)('puts the ambiguity tooltip on %s too', async (raw, kind, selector) => {
    const path = raw.slice(3, -2);
    mocks.resolveAttachment.mockResolvedValue(
      ok({ path: `sub/${path}`, name: path, kind, url: 'blob:x', ambiguous: true })
    );
    mount(raw);
    await vi.waitFor(() => expect(host.querySelector(selector)).not.toBeNull());
    const shown = host.querySelector<HTMLElement>(selector);
    expect(shown?.title).toContain(`Several files share this name. Showing sub/${path}.`);
  });

  it('keeps a remote image lazy, since nothing else defers its request', () => {
    useStore.getState().updateSettings({ webImages: true });
    mount('![[https://example.com/a.png]]');
    expect(host.querySelector('img')?.loading).toBe('lazy');
  });

  it('draws a plain wikilink as an inert chip with the alias', () => {
    mount('[[Plain|alias]]');
    expect(host.querySelector('.md-wikilink')?.textContent).toBe('alias');
    expect(mocks.resolveAttachment).not.toHaveBeenCalled();
  });

  it('draws a wikilink without alias as the note and section', () => {
    mount('[[Plain#Part]]');
    expect(host.querySelector('.md-wikilink')?.textContent).toBe('Plain > Part');
  });

  it('shows the text itself for a token it cannot read', () => {
    mount('![[]]');
    expect(host.textContent).toBe('![[]]');
  });

  it('draws a web image only when the setting allows it', () => {
    mount('![[https://example.com/a.png|alt text]]');
    expect(host.querySelector('img.image-blocked')?.getAttribute('alt')).toBe('alt text');
    expect(host.querySelector('img')?.hasAttribute('src')).toBe(false);
    useStore.getState().updateSettings({ webImages: true });
    expect(host.querySelector('img')?.getAttribute('src')).toBe('https://example.com/a.png');
    expect(mocks.resolveAttachment).not.toHaveBeenCalled();
  });
});

describe('media', () => {
  it('draws a PDF in an iframe at its page, with an Open link beside it', async () => {
    mocks.resolveAttachment.mockResolvedValue(
      ok({ path: 'x.pdf', name: 'x.pdf', kind: 'pdf', url: 'blob:pdf' })
    );
    mount('![[x.pdf#page=2&height=300|500]]');
    await vi.waitFor(() => expect(host.querySelector('iframe')).not.toBeNull());
    const frame = host.querySelector('iframe');
    expect(frame?.getAttribute('src')).toBe('blob:pdf#page=2');
    expect(frame?.style.height).toBe('300px');
    expect(frame?.style.width).toBe('500px');
    expect(frame?.hasAttribute('sandbox')).toBe(false);
    const open = host.querySelector<HTMLAnchorElement>('a.md-embed-open');
    expect(open?.getAttribute('href')).toBe('blob:pdf');
    expect(open?.target).toBe('_blank');
    expect(open?.rel).toBe('noopener noreferrer');
    expect(host.classList.contains('md-embed-block')).toBe(true);
  });

  it('caps a PDF height and defaults it to 400', async () => {
    mocks.resolveAttachment.mockResolvedValue(
      ok({ path: 'x.pdf', name: 'x.pdf', kind: 'pdf', url: 'blob:pdf' })
    );
    mount('![[x.pdf#height=5000]]');
    await vi.waitFor(() => expect(host.querySelector('iframe')).not.toBeNull());
    expect(host.querySelector('iframe')?.style.height).toBe('1200px');
    host.replaceChildren();
    const other = document.createElement('span');
    document.body.append(other);
    mountEmbed(other, '![[x.pdf]]', context());
    await vi.waitFor(() => expect(other.querySelector('iframe')).not.toBeNull());
    expect(other.querySelector('iframe')?.style.height).toBe('400px');
  });

  it('draws audio with controls and no preloading', async () => {
    mocks.resolveAttachment.mockResolvedValue(
      ok({ path: 's.mp3', name: 's.mp3', kind: 'audio', url: 'blob:snd' })
    );
    mount('![[s.mp3]]');
    await vi.waitFor(() => expect(host.querySelector('audio')).not.toBeNull());
    const audio = host.querySelector('audio');
    expect(audio?.controls).toBe(true);
    expect(audio?.preload).toBe('none');
    expect(audio?.getAttribute('src')).toBe('blob:snd');
  });

  it('shows an Open link when the browser cannot play the media', async () => {
    mocks.resolveAttachment.mockResolvedValue(
      ok({ path: 's.mp3', name: 's.mp3', kind: 'audio', url: 'blob:snd' })
    );
    mount('![[s.mp3]]');
    await vi.waitFor(() => expect(host.querySelector('audio')).not.toBeNull());
    host.querySelector('audio')?.dispatchEvent(new Event('error'));
    expect(host.querySelector('audio')).toBeNull();
    expect(host.textContent).toContain('This browser cannot play s.mp3');
    expect(host.querySelector('a.md-embed-open')).not.toBeNull();
  });

  it('draws video with the width from the size', async () => {
    mocks.resolveAttachment.mockResolvedValue(
      ok({ path: 'v.webm', name: 'v.webm', kind: 'video', url: 'blob:vid' })
    );
    mount('![[v.webm|480]]');
    await vi.waitFor(() => expect(host.querySelector('video')).not.toBeNull());
    const video = host.querySelector('video');
    expect(video?.controls).toBe(true);
    expect(video?.preload).toBe('none');
    expect(video?.width).toBe(480);
  });

  it('draws another file as a chip with an Open link', async () => {
    mocks.resolveAttachment.mockResolvedValue(
      ok({ path: 'data.zip', name: 'data.zip', kind: 'other', url: 'blob:zip' })
    );
    mount('![[data.zip]]');
    await vi.waitFor(() => expect(host.querySelector('.md-embed-file')).not.toBeNull());
    expect(host.textContent).toContain('File: data.zip');
    expect(host.querySelector('a.md-embed-open')?.getAttribute('href')).toBe('blob:zip');
  });
});

describe('lifecycle', () => {
  it('ignores an answer that arrives after the token changed', async () => {
    const first = deferred<ResolvedAttachment>();
    const second = deferred<ResolvedAttachment>();
    mocks.resolveAttachment.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const view = mount('![[one.png]]');
    view.update('![[two.png]]');
    second.resolve(ok({ path: 'two.png', name: 'two.png', url: 'blob:two' }));
    await vi.waitFor(() => expect(host.querySelector('img')).not.toBeNull());
    first.resolve(ok({ path: 'one.png', name: 'one.png', url: 'blob:one' }));
    await Promise.resolve();
    await Promise.resolve();
    expect(host.querySelector('img')?.getAttribute('src')).toBe('blob:two');
  });

  it('does not draw after destroy, and unsubscribes', async () => {
    const pending = deferred<ResolvedAttachment>();
    mocks.resolveAttachment.mockReturnValue(pending.promise);
    const view = mount('![[a.png]]');
    expect(listeners.size).toBe(1);
    view.destroy();
    expect(unsubscribed).toHaveBeenCalledTimes(1);
    expect(listeners.size).toBe(0);
    pending.resolve(ok());
    await Promise.resolve();
    await Promise.resolve();
    expect(host.querySelector('img')).toBeNull();
  });

  it('does not draw when the view was cancelled meanwhile', async () => {
    const pending = deferred<ResolvedAttachment>();
    mocks.resolveAttachment.mockReturnValue(pending.promise);
    mount('![[a.png]]');
    signal.cancelled = true;
    pending.resolve(ok());
    await Promise.resolve();
    await Promise.resolve();
    expect(host.querySelector('img')).toBeNull();
  });

  it('draws the first frame from the synchronous cache', () => {
    mocks.peekAttachment.mockReturnValue(ok());
    mocks.resolveAttachment.mockReturnValue(new Promise(() => {}));
    mount('![[a.png|100]]');
    expect(host.querySelector('img')?.getAttribute('src')).toBe('blob:a');
  });

  it('keeps the drawing when a notification brings the same answer', async () => {
    mocks.resolveAttachment.mockResolvedValue(ok());
    mount('![[a.png]]');
    await vi.waitFor(() => expect(host.querySelector('img')).not.toBeNull());
    const before = host.querySelector('img');
    notify();
    await vi.waitFor(() => expect(mocks.resolveAttachment).toHaveBeenCalledTimes(2));
    await Promise.resolve();
    expect(host.querySelector('img')).toBe(before);
  });

  it('draws a new URL after a notification changes the answer', async () => {
    mocks.resolveAttachment.mockResolvedValue(ok());
    mount('![[a.png]]');
    await vi.waitFor(() => expect(host.querySelector('img')).not.toBeNull());
    mocks.resolveAttachment.mockResolvedValue(ok({ url: 'blob:new' }));
    notify();
    await vi.waitFor(() => expect(host.querySelector('img')?.getAttribute('src')).toBe('blob:new'));
  });
});

describe('two documents with the same token', () => {
  it('shows each vault its own file after a document switch', async () => {
    const urlFor = (doc: DocContext) => (doc.handleId === 'tabA' ? 'blob:vaultA' : 'blob:vaultB');
    mocks.resolveAttachment.mockImplementation(async (doc: DocContext) => ok({ url: urlFor(doc) }));
    current = { fileHandle: null, handleId: 'tabA' };
    mount('![[same.png]]');
    await vi.waitFor(() =>
      expect(host.querySelector('img')?.getAttribute('src')).toBe('blob:vaultA')
    );
    // The editor keeps the view across the switch (the token is equal);
    // the attachment service notifies on the document change.
    current = { fileHandle: null, handleId: 'tabB' };
    notify();
    await vi.waitFor(() =>
      expect(host.querySelector('img')?.getAttribute('src')).toBe('blob:vaultB')
    );
  });

  it("drops the old tab's drawing at once when the new one has to load", async () => {
    mocks.resolveAttachment.mockResolvedValueOnce(ok({ url: 'blob:vaultA' }));
    current = { fileHandle: null, handleId: 'tabA' };
    mount('![[same.png]]');
    await vi.waitFor(() => expect(host.querySelector('img')).not.toBeNull());
    const pending = deferred<ResolvedAttachment>();
    mocks.resolveAttachment.mockReturnValue(pending.promise);
    current = { fileHandle: null, handleId: 'tabB' };
    notify();
    expect(host.querySelector('img')).toBeNull();
    expect(host.textContent).toBe('Loading…');
    pending.resolve(ok({ url: 'blob:vaultB' }));
    await vi.waitFor(() =>
      expect(host.querySelector('img')?.getAttribute('src')).toBe('blob:vaultB')
    );
  });

  it('ignores an answer for the old tab that lands after the switch', async () => {
    const slow = deferred<ResolvedAttachment>();
    mocks.resolveAttachment.mockReturnValueOnce(slow.promise);
    current = { fileHandle: null, handleId: 'tabA' };
    mount('![[same.png]]');
    mocks.resolveAttachment.mockResolvedValue(ok({ url: 'blob:vaultB' }));
    current = { fileHandle: null, handleId: 'tabB' };
    notify();
    await vi.waitFor(() =>
      expect(host.querySelector('img')?.getAttribute('src')).toBe('blob:vaultB')
    );
    slow.resolve(ok({ url: 'blob:vaultA' }));
    await Promise.resolve();
    await Promise.resolve();
    expect(host.querySelector('img')?.getAttribute('src')).toBe('blob:vaultB');
  });
});

describe('notes', () => {
  it('draws a dotted note name as a transclusion once it resolves to a note', async () => {
    mocks.resolveAttachment.mockResolvedValue(
      ok({ path: 'Note v1.2.md', name: 'Note v1.2.md', kind: 'note', url: 'blob:n' })
    );
    mocks.readNoteText.mockResolvedValue(noteOk({ path: 'Note v1.2.md', text: 'Some body.\n' }));
    mount('![[Note v1.2]]');
    await vi.waitFor(() => expect(host.querySelector('.md-transclusion')).not.toBeNull());
    expect(host.textContent).toContain('Some body.');
    expect(host.classList.contains('md-embed-block')).toBe(true);
    expect(mocks.readNoteText).toHaveBeenCalledWith(current, 'Note v1.2', undefined);
  });

  it('shows a note-not-found placeholder', async () => {
    mocks.readNoteText.mockResolvedValue({ state: 'missing', rootLooksLikeVault: true });
    mount('![[Nope]]');
    await vi.waitFor(() => expect(host.querySelector('.md-embed-missing')).not.toBeNull());
    expect(host.textContent).toContain('Note not found: Nope');
  });

  it('shows a section-not-found placeholder', async () => {
    mocks.readNoteText.mockResolvedValue(noteOk());
    mount('![[Note#Absent]]');
    await vi.waitFor(() => expect(host.querySelector('.md-embed-missing')).not.toBeNull());
    expect(host.textContent).toContain('Section not found in Note');
  });

  it('shows only the selected section', async () => {
    mocks.readNoteText.mockResolvedValue(
      noteOk({ text: '# A\n\nalpha text\n\n# B\n\nbeta text\n' })
    );
    mount('![[Note#B]]');
    await vi.waitFor(() => expect(host.querySelector('.md-transclusion')).not.toBeNull());
    expect(host.textContent).toContain('beta text');
    expect(host.textContent).not.toContain('alpha text');
  });

  it('reads the current note for an empty target, from the live text', async () => {
    mocks.readNoteText.mockResolvedValue(
      noteOk({ path: 'Host.md', text: '# Sec\n\nlive words\n\n# Other\n\nelse\n' })
    );
    mount('![[#Sec]]');
    await vi.waitFor(() => expect(host.querySelector('.md-transclusion')).not.toBeNull());
    expect(host.textContent).toContain('live words');
    expect(host.textContent).not.toContain('else');
    expect(mocks.readNoteText).toHaveBeenCalledWith(current, '', undefined);
  });
});

describe('fan-out', () => {
  it('stops mounting notes once the live limit is reached, whatever the nesting', async () => {
    // Eight embeds per level and three levels: 8^3 + 8^2 + 8 + 1 = 585 notes without a limit.
    const many = (name: string) => Array.from({ length: 8 }, () => `![[${name}]]`).join('\n\n');
    const texts: Record<string, string> = {
      a: many('b'),
      b: many('c'),
      c: many('d'),
      d: 'leaf',
    };
    mocks.readNoteText.mockImplementation(async (_doc: DocContext, target: string) =>
      noteOk({ path: `${target}.md`, text: texts[target] ?? '' })
    );
    mount('![[a]]');
    await vi.waitFor(() => expect(host.querySelector('.md-transclusion')).not.toBeNull());
    let before = -1;
    while (before !== mocks.readNoteText.mock.calls.length) {
      before = mocks.readNoteText.mock.calls.length;
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
    expect(mocks.readNoteText.mock.calls.length).toBeLessThanOrEqual(MAX_LIVE_TRANSCLUSIONS);
    expect(host.querySelector('.md-embed-limit')?.textContent).toMatch(/too many notes/);
  }, 30000);

  it('hands the slots back when the views are destroyed', async () => {
    mocks.readNoteText.mockResolvedValue(noteOk({ text: 'Body.\n' }));
    for (let round = 0; round < 3; round++) {
      const views = Array.from({ length: MAX_LIVE_TRANSCLUSIONS }, () => {
        const el = document.createElement('span');
        document.body.append(el);
        return { el, view: mountEmbed(el, '![[Note]]', context()) };
      });
      await vi.waitFor(() =>
        expect(views.every((m) => m.el.querySelector('.md-transclusion'))).toBe(true)
      );
      for (const m of views) m.view.destroy();
    }
  }, 30000);
});
