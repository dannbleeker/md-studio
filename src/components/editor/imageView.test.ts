import {
  defaultValueCtx,
  Editor,
  editorViewCtx,
  nodeViewCtx,
  parserCtx,
  remarkPluginsCtx,
  rootCtx,
  serializerCtx,
} from '@milkdown/kit/core';
import { commonmark } from '@milkdown/kit/preset/commonmark';
import { gfm } from '@milkdown/kit/preset/gfm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DocContext, ResolvedAttachment } from '@/services/attachments';
import { resetStoreForTest, useStore } from '@/store';
import { stubObjectUrls } from '../../../test/fakeFs';
import { embeds, remarkEmbeds } from './embedNode';
import { embedNodeView, ownsEvent } from './embedView';
import { imageTitleFix } from './imageTitleFix';
import { imageNodeView } from './imageView';

const mocks = vi.hoisted(() => ({
  resolveAttachment: vi.fn(),
  peekAttachment: vi.fn(),
  readNoteText: vi.fn(),
  peekNoteRead: vi.fn(),
  noteRelativePath: vi.fn(),
}));

const listeners = new Set<() => void>();
vi.mock('@/services/attachments', () => ({
  ...mocks,
  subscribeAttachments: (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
}));

const notify = () => {
  for (const listener of [...listeners]) listener();
};

const found = (over: Partial<Extract<ResolvedAttachment, { state: 'ok' }>> = {}) =>
  ({
    state: 'ok',
    path: 'p.png',
    name: 'p.png',
    kind: 'image',
    url: 'blob:p',
    ambiguous: false,
    ...over,
  }) satisfies ResolvedAttachment;

let editor: Editor;
let root: HTMLElement;

async function open(md: string): Promise<Element> {
  root = document.createElement('div');
  document.body.append(root);
  editor = await Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, root);
      ctx.set(defaultValueCtx, md);
      ctx.update(remarkPluginsCtx, (plugins) => [...plugins, imageTitleFix, remarkEmbeds]);
      ctx.update(nodeViewCtx, (views) => {
        const image: (typeof views)[number] = ['image', imageNodeView];
        const embed: (typeof views)[number] = ['embed', embedNodeView];
        return [...views, image, embed];
      });
    })
    .use(commonmark)
    .use(gfm)
    .use(embeds)
    .create();
  return root.querySelector('.ProseMirror') as Element;
}

beforeEach(() => {
  resetStoreForTest();
  stubObjectUrls();
  listeners.clear();
  for (const fn of Object.values(mocks)) fn.mockReset();
  mocks.peekAttachment.mockReturnValue(undefined);
  mocks.peekNoteRead.mockReturnValue(undefined);
  mocks.noteRelativePath.mockResolvedValue('Host.md');
  useStore.setState({ handleId: 'tabA', fileHandle: null });
});

afterEach(async () => {
  await editor.destroy();
  document.body.replaceChildren();
});

const img = (pm: Element) => pm.querySelector('img:not(.ProseMirror-separator)');

describe('Markdown images', () => {
  it('takes the width from the alt text and hides the size from the shown alt', async () => {
    mocks.resolveAttachment.mockResolvedValue(found());
    const pm = await open('![alt text|300](p.png)\n');
    const el = img(pm);
    expect(el?.getAttribute('alt')).toBe('alt text');
    expect(el?.getAttribute('width')).toBe('300');
    expect(el?.hasAttribute('height')).toBe(false);
    await vi.waitFor(() => expect(el?.getAttribute('src')).toBe('blob:p'));
  });

  it('takes both dimensions, and an empty alt with a size', async () => {
    mocks.resolveAttachment.mockResolvedValue(found());
    const pm = await open('![|300x200](a.png)\n\n![alt|50](b.png)\n');
    const [first, second] = [...pm.querySelectorAll('img:not(.ProseMirror-separator)')];
    expect(first?.getAttribute('alt')).toBe('');
    expect(first?.getAttribute('width')).toBe('300');
    expect(first?.getAttribute('height')).toBe('200');
    expect(second?.getAttribute('alt')).toBe('alt');
    expect(second?.getAttribute('width')).toBe('50');
  });

  it('never changes the node attributes: the Markdown round trips unchanged', async () => {
    mocks.resolveAttachment.mockResolvedValue(found());
    const md = '![alt|300](p.png)\n\n![](<my file.png>)\n\n![](my%20file.png)\n';
    const pm = await open(md);
    await vi.waitFor(() => expect(img(pm)?.getAttribute('src')).toBe('blob:p'));
    const out = editor.action((ctx) => ctx.get(serializerCtx)(ctx.get(parserCtx)(md)));
    expect(out).toContain('![alt|300](p.png)');
    expect(out).toContain('my%20file.png');
    const srcs: string[] = [];
    const alts: string[] = [];
    editor.action((ctx) => {
      ctx.get(editorViewCtx).state.doc.descendants((node) => {
        if (node.type.name === 'image') {
          srcs.push(String(node.attrs.src));
          alts.push(String(node.attrs.alt));
        }
      });
    });
    expect(srcs).toEqual(['p.png', 'my file.png', 'my%20file.png']);
    expect(alts).toEqual(['alt|300', '', '']);
  });

  it('resolves the decoded path as a Markdown link and offers the literal one as a retry', async () => {
    mocks.resolveAttachment.mockResolvedValue(found({ url: 'blob:enc' }));
    const pm = await open('![](my%20file.png)\n');
    await vi.waitFor(() => expect(img(pm)?.getAttribute('src')).toBe('blob:enc'));
    expect(mocks.resolveAttachment).toHaveBeenCalledWith(
      expect.objectContaining({ handleId: 'tabA' }),
      'my file.png',
      { markdown: true, alternates: ['my%20file.png'] }
    );
  });

  it('resolves an angle-bracket destination without alternates', async () => {
    mocks.resolveAttachment.mockResolvedValue(found());
    await open('![](<my file.png>)\n');
    await vi.waitFor(() => expect(mocks.resolveAttachment).toHaveBeenCalled());
    expect(mocks.resolveAttachment.mock.calls[0]?.[1]).toBe('my file.png');
    expect(mocks.resolveAttachment.mock.calls[0]?.[2]).toEqual({ markdown: true });
  });

  it('falls back to the written src when nothing resolves', async () => {
    mocks.resolveAttachment.mockResolvedValue({ state: 'missing', rootLooksLikeVault: true });
    const pm = await open('![gone](images/gone.png)\n');
    await vi.waitFor(() => expect(mocks.resolveAttachment).toHaveBeenCalled());
    await Promise.resolve();
    expect(img(pm)?.getAttribute('src')).toBe('images/gone.png');
  });

  it('does not resolve data URLs or web images', async () => {
    const pm = await open('![d](data:image/png;base64,AAAA)\n');
    expect(img(pm)?.getAttribute('src')).toMatch(/^data:image\/png/);
    expect(mocks.resolveAttachment).not.toHaveBeenCalled();
  });

  it('blocks a web image until the setting allows it', async () => {
    const pm = await open('![logo](https://example.com/a.png)\n');
    expect(img(pm)?.hasAttribute('src')).toBe(false);
    expect(img(pm)?.classList.contains('image-blocked')).toBe(true);
    useStore.getState().updateSettings({ webImages: true });
    expect(img(pm)?.getAttribute('src')).toBe('https://example.com/a.png');
    useStore.getState().updateSettings({ webImages: false });
    expect(img(pm)?.hasAttribute('src')).toBe(false);
    expect(mocks.resolveAttachment).not.toHaveBeenCalled();
  });

  it('blocks a target a browser reads as another server, and never resolves it as a vault path', async () => {
    for (const md of [
      '![x](ht&#9;tps://evil.example/a.png)\n',
      '![x](\\\\\\\\evil.example/a.png)\n',
      '![x](http:/evil.example/a.png)\n',
      '![x](HTTP:evil.example/a.png)\n',
    ]) {
      await editor?.destroy();
      document.body.replaceChildren();
      const pm = await open(md);
      expect(img(pm)?.hasAttribute('src'), md).toBe(false);
      expect(img(pm)?.classList.contains('image-blocked'), md).toBe(true);
    }
    expect(mocks.resolveAttachment).not.toHaveBeenCalled();
  });

  it('shows each vault its own file for the same link after a tab switch', async () => {
    mocks.resolveAttachment.mockImplementation(async (doc: DocContext) =>
      found({ url: doc.handleId === 'tabA' ? 'blob:vaultA' : 'blob:vaultB' })
    );
    const pm = await open('![](shared/p.png)\n');
    await vi.waitFor(() => expect(img(pm)?.getAttribute('src')).toBe('blob:vaultA'));
    useStore.setState({ handleId: 'tabB' });
    notify();
    await vi.waitFor(() => expect(img(pm)?.getAttribute('src')).toBe('blob:vaultB'));
  });

  it('stops listening when the view is destroyed', async () => {
    mocks.resolveAttachment.mockResolvedValue(found());
    await open('![](p.png)\n');
    await vi.waitFor(() => expect(listeners.size).toBe(1));
    await editor.destroy();
    expect(listeners.size).toBe(0);
    editor = await Editor.make().use(commonmark).create();
  });
});

describe('Markdown links to other files', () => {
  it('draws a PDF like the wiki embed of the same path', async () => {
    mocks.resolveAttachment.mockResolvedValue(
      found({ path: 'docs/x.pdf', name: 'x.pdf', kind: 'pdf', url: 'blob:pdf' })
    );
    const pm = await open('![](docs/x.pdf)\n');
    await vi.waitFor(() => expect(pm.querySelector('iframe')).not.toBeNull());
    expect(pm.querySelector('iframe')?.getAttribute('src')).toBe('blob:pdf');
    expect(mocks.resolveAttachment.mock.calls[0]?.[1]).toBe('docs/x.pdf');
  });

  it('resolves the link as Markdown, so the note folder wins over the vault root', async () => {
    mocks.resolveAttachment.mockResolvedValue(
      found({ path: 'docs/x.pdf', name: 'x.pdf', kind: 'pdf', url: 'blob:pdf' })
    );
    mocks.peekAttachment.mockReturnValue(undefined);
    const pm = await open('![](docs/x.pdf)\n\n![[docs/y.pdf]]\n');
    await vi.waitFor(() => expect(mocks.resolveAttachment).toHaveBeenCalledTimes(2));
    expect(pm.querySelectorAll('.md-embed-host').length).toBe(2);
    const optionsOf = (target: string) =>
      mocks.resolveAttachment.mock.calls.find((call) => call[1] === target)?.[2];
    expect(optionsOf('docs/x.pdf')).toEqual({ markdown: true });
    expect(optionsOf('docs/y.pdf')).toEqual({});
    expect(mocks.peekAttachment.mock.calls.find((call) => call[1] === 'docs/x.pdf')?.[2]).toEqual({
      markdown: true,
    });
  });

  it('keeps an <img> for image formats the embeds table does not list', async () => {
    mocks.resolveAttachment.mockResolvedValue(found());
    const pm = await open(
      '![](icons/logo.ico)\n\n![](a/photo.jfif)\n\n![](a/anim.apng)\n\n![](a/scan.tiff)\n'
    );
    await vi.waitFor(() => expect(mocks.resolveAttachment).toHaveBeenCalledTimes(4));
    expect(pm.querySelectorAll('img:not(.ProseMirror-separator)').length).toBe(4);
    expect(pm.querySelector('.md-embed-host')).toBeNull();
  });

  it('draws audio and video targets with their players', async () => {
    mocks.resolveAttachment.mockImplementation(async (_doc: DocContext, target: string) =>
      target.endsWith('.mp3')
        ? found({ path: target, name: 's.mp3', kind: 'audio', url: 'blob:snd' })
        : found({ path: target, name: 'v.mp4', kind: 'video', url: 'blob:vid' })
    );
    const pm = await open('![](a/s.mp3)\n\n![](a/v.mp4)\n');
    await vi.waitFor(() => expect(pm.querySelector('audio')).not.toBeNull());
    await vi.waitFor(() => expect(pm.querySelector('video')).not.toBeNull());
  });

  it('keeps the img for a target that cannot be written as a token', async () => {
    mocks.resolveAttachment.mockResolvedValue(found());
    const pm = await open('![](<a|b.pdf>)\n\n![](C%23.pdf)\n\n![](Report%20%5Bfinal%5D.mp4)\n');
    await vi.waitFor(() => expect(mocks.resolveAttachment).toHaveBeenCalledTimes(3));
    expect(pm.querySelectorAll('img:not(.ProseMirror-separator)').length).toBe(3);
    expect(pm.querySelector('.md-embed-host')).toBeNull();
    expect(pm.querySelector('.md-embed-loading')).toBeNull();
    expect(pm.querySelector('iframe')).toBeNull();
  });

  it('rebuilds the view as an img when the link changes to a target without a token', async () => {
    mocks.resolveAttachment.mockResolvedValue(
      found({ path: 'x.pdf', name: 'x.pdf', kind: 'pdf', url: 'blob:pdf' })
    );
    const pm = await open('![](x.pdf)\n');
    await vi.waitFor(() => expect(pm.querySelector('iframe')).not.toBeNull());
    const view = editor.ctx.get(editorViewCtx);
    const { tr, doc } = view.state;
    doc.descendants((node, pos) => {
      if (node.type.name === 'image')
        tr.setNodeMarkup(pos, undefined, { ...node.attrs, src: 'a|b.pdf' });
    });
    view.dispatch(tr);
    expect(pm.querySelector('.md-embed-host')).toBeNull();
    expect(img(pm)).not.toBeNull();
  });
});

describe('wiki embeds in the editor', () => {
  it('replaces the loading chip with the resolved image, token intact in the document', async () => {
    mocks.resolveAttachment.mockResolvedValue(found({ url: 'blob:wiki' }));
    const pm = await open('Photo ![[p.png|120]] end\n');
    expect(pm.querySelector('.md-embed-host')).not.toBeNull();
    await vi.waitFor(() => expect(img(pm)?.getAttribute('src')).toBe('blob:wiki'));
    expect(img(pm)?.getAttribute('width')).toBe('120');
    const raws: string[] = [];
    editor.action((ctx) => {
      ctx.get(editorViewCtx).state.doc.descendants((node) => {
        if (node.type.name === 'embed') raws.push(String(node.attrs.raw));
      });
    });
    expect(raws).toEqual(['![[p.png|120]]']);
  });

  it("shows the other tab's file after a switch with an identical token", async () => {
    mocks.resolveAttachment.mockImplementation(async (doc: DocContext) =>
      found({ url: doc.handleId === 'tabA' ? 'blob:vaultA' : 'blob:vaultB' })
    );
    const pm = await open('![[p.png]]\n');
    await vi.waitFor(() => expect(img(pm)?.getAttribute('src')).toBe('blob:vaultA'));
    useStore.setState({ handleId: 'tabB' });
    notify();
    await vi.waitFor(() => expect(img(pm)?.getAttribute('src')).toBe('blob:vaultB'));
  });

  it('claims events inside controls so the editor leaves them alone', async () => {
    mocks.resolveAttachment.mockResolvedValue(
      found({ path: 's.mp3', name: 's.mp3', kind: 'audio', url: 'blob:snd' })
    );
    const pm = await open('![[s.mp3]]\n');
    await vi.waitFor(() => expect(pm.querySelector('audio')).not.toBeNull());
    const fire = (target: Element) => {
      let seen: Event | null = null;
      pm.addEventListener('probe', (e) => (seen = e), { once: true });
      target.dispatchEvent(new Event('probe', { bubbles: true }));
      return seen as unknown as Event;
    };
    expect(ownsEvent(fire(pm.querySelector('audio') as Element))).toBe(true);
    expect(ownsEvent(fire(pm.querySelector('.md-embed-host') as Element))).toBe(false);
  });
});
