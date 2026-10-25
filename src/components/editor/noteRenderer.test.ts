import {
  defaultValueCtx,
  Editor,
  editorViewCtx,
  nodeViewCtx,
  remarkPluginsCtx,
  rootCtx,
} from '@milkdown/kit/core';
import { commonmark } from '@milkdown/kit/preset/commonmark';
import { gfm } from '@milkdown/kit/preset/gfm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { findHeadings } from '@/domain/headings';
import { startChain } from '@/domain/transclusion';
import type { DocContext, NoteRead, ResolvedAttachment } from '@/services/attachments';
import { resetStoreForTest, useStore } from '@/store';
import { stubObjectUrls } from '../../../test/fakeFs';
import { visualHeadings } from './editorRegistry';
import { embeds, remarkEmbeds } from './embedNode';
import { type EmbedRenderContext, mountEmbed } from './embedRender';
import { embedNodeView } from './embedView';
import { frontMatter, remarkFrontMatter } from './frontMatter';
import { imageTitleFix } from './imageTitleFix';
import { peekNoteBlock, renderNote, renderNoteBlock } from './noteRenderer';

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

// Mermaid itself is far too large to load here; a drawing is not what these tests are about.
vi.mock('@/services/mermaid', () => ({
  MAX_DIAGRAM_CHARS: 20_000,
  peekDiagram: () => null,
  drawDiagram: () => new Promise(() => {}),
}));

const doc: DocContext = { fileHandle: null, handleId: 'h1' };
let host: HTMLElement;
let signal: { cancelled: boolean };

const context = (over: Partial<EmbedRenderContext> = {}): EmbedRenderContext => ({
  doc: () => doc,
  chain: startChain(null),
  fromNotePath: undefined,
  signal,
  ...over,
});

/** Notes by target name, for readNoteText. */
function notes(files: Record<string, string>) {
  mocks.readNoteText.mockImplementation(
    async (_doc: DocContext, target: string): Promise<NoteRead> => {
      const text = files[target];
      if (text === undefined) return { state: 'missing', rootLooksLikeVault: true };
      return { state: 'ok', path: `${target}.md`, text, lastModified: 1, size: text.length };
    }
  );
}

const dom = (html: string): HTMLElement => {
  const box = document.createElement('div');
  box.innerHTML = html;
  return box;
};

beforeEach(() => {
  resetStoreForTest();
  stubObjectUrls();
  for (const fn of Object.values(mocks)) fn.mockReset();
  mocks.peekAttachment.mockReturnValue(undefined);
  mocks.peekNoteRead.mockReturnValue(undefined);
  mocks.noteRelativePath.mockResolvedValue('Host.md');
  signal = { cancelled: false };
  listeners.clear();
  host = document.createElement('span');
  document.body.append(host);
});

afterEach(() => {
  document.body.replaceChildren();
});

describe('renderNote', () => {
  it('demotes every heading to a div with role and level', async () => {
    const html = await renderNote('# One\n\n## Two\n\n###### Six\n\ntext\n');
    const box = dom(html);
    expect(box.querySelector('h1, h2, h3, h4, h5, h6')).toBeNull();
    const headings = [...box.querySelectorAll('.md-transcluded-heading')];
    expect(headings.map((h) => h.getAttribute('aria-level'))).toEqual(['1', '2', '6']);
    expect(headings.every((h) => h.getAttribute('role') === 'heading')).toBe(true);
    expect(headings[0]?.tagName).toBe('DIV');
  });

  it('keeps formatting, lists, code and tables', async () => {
    const box = dom(
      await renderNote(
        '**bold** *em* ~~del~~ `code`\n\n- a\n- b\n\n```js\nlet x\n```\n\n| a | b |\n| - | - |\n| 1 | 2 |\n'
      )
    );
    for (const tag of ['strong', 'em', 'del', 'code', 'ul', 'li', 'pre', 'table', 'td'])
      expect(box.querySelector(tag), tag).not.toBeNull();
  });

  it('turns raw HTML into inert text: no script, no event handlers, no elements', async () => {
    const box = dom(
      await renderNote(
        'Hi <script>alert(1)</script> there\n\n<img src=x onerror=alert(1)>\n\n<div onclick="x()">block</div>\n\ntext <b onmouseover="y()">b</b>\n'
      )
    );
    expect(box.querySelector('script')).toBeNull();
    expect(box.querySelector('img')).toBeNull();
    expect(box.querySelector('b')).toBeNull();
    for (const el of box.querySelectorAll('*'))
      for (const attr of el.getAttributeNames()) expect(attr.startsWith('on')).toBe(false);
    // The markup survives as visible text.
    expect(box.textContent).toContain('<script>alert(1)</script>');
  });

  it('keeps the text of a paragraph whose link holds inline HTML', async () => {
    const link = dom(await renderNote('before [<kbd>Ctrl</kbd> docs](http://x) after\n'));
    expect(link.textContent).toBe('before <kbd>Ctrl</kbd> docs after');
    expect(link.querySelector('a')?.textContent).toBe('<kbd>Ctrl</kbd> docs');
    const badge = dom(
      await renderNote('see [x](http://x) and [<img src="b.png">](http://y) end\n')
    );
    expect(badge.textContent).toContain('see x and ');
    expect(badge.textContent).toContain('end');
    expect(badge.querySelector('img')).toBeNull();
    const cell = dom(await renderNote('| a |\n| - |\n| [x <i>](u) |\n'));
    expect(cell.querySelector('td')?.textContent).toContain('x <i>');
    const br = dom(await renderNote('[a<br>b](http://x)\n'));
    expect(br.textContent).toBe('a<br>b');
  });

  it('still wraps a block-level html node in a paragraph inside a quote and a list', async () => {
    const box = dom(await renderNote('> <div>q</div>\n\n- <div>i</div>\n'));
    expect(box.querySelector('blockquote')?.textContent).toContain('<div>q</div>');
    expect(box.querySelector('li')?.textContent).toContain('<div>i</div>');
  });

  it('shows a plain-text placeholder instead of parsing a far too deep note', {
    tags: ['stress'],
  }, async () => {
    for (const hostile of [`${'>'.repeat(20000)} x`, `${'['.repeat(20000)}x${']'.repeat(20000)}`]) {
      const started = Date.now();
      const box = dom(await renderNote(hostile));
      expect(Date.now() - started).toBeLessThan(2000);
      expect(box.querySelector('pre')).not.toBeNull();
      expect(box.querySelector('blockquote')).toBeNull();
    }
  });

  it('shows a plain-text placeholder for notes the parser takes quadratic time on', {
    tags: ['stress'],
  }, async () => {
    const nested = Array.from({ length: 300 }, (_, i) => `${'  '.repeat(i)}- a`).join('\n');
    const wide = `|${' a |'.repeat(3300)}\n|${' - |'.repeat(3300)}`;
    for (const hostile of ['*a'.repeat(10_000), '_a'.repeat(10_000), nested, wide]) {
      const started = Date.now();
      const box = dom(await renderNote(hostile));
      expect(Date.now() - started).toBeLessThan(1000);
      expect(box.querySelector('pre')).not.toBeNull();
    }
  });

  it('cuts a very long note short instead of parsing all of it', { tags: ['stress'] }, async () => {
    // 200 KB of plain paragraphs: the parser used to take seconds on it.
    const long = 'word *a* b\n\n'.repeat(20_000);
    const started = Date.now();
    const rendered = await renderNote(long);
    expect(Date.now() - started).toBeLessThan(3000);
    expect(dom(rendered).querySelectorAll('p').length).toBeLessThan(5000);
  });

  it('drops style attributes and unknown attributes it did not generate', async () => {
    const box = dom(await renderNote('<span style="color:red" data-x="1">x</span>\n'));
    for (const el of box.querySelectorAll('*')) {
      expect(el.hasAttribute('style')).toBe(false);
      expect(el.hasAttribute('data-x')).toBe(false);
    }
  });

  it('keeps only http, https and mailto links, in a new tab, and strips the rest to text', async () => {
    const box = dom(
      await renderNote(
        '[web](https://example.com/p?q=1) [mail](mailto:a@b.co) [rel](other.md) [js](javascript:alert(1)) [hash](#sec) [data](data:text/html,x)\n'
      )
    );
    const links = [...box.querySelectorAll('a')];
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      'https://example.com/p?q=1',
      'mailto:a@b.co',
    ]);
    for (const a of links) {
      expect(a.getAttribute('target')).toBe('_blank');
      expect(a.getAttribute('rel')).toBe('noopener noreferrer');
    }
    // The text of the stripped links stays.
    expect(box.textContent).toContain('rel');
    expect(box.textContent).toContain('js');
  });

  it('allows data and blob images, blocks web images by default, hands vault paths to the resolver', async () => {
    const box = dom(
      await renderNote(
        [
          '![d](data:image/png;base64,AAAA)',
          '![b](blob:http://localhost/abc)',
          '![w](https://example.com/a.png)',
          '![p](//example.com/a.png)',
          '![r](rel/pic.png)',
          '![j](javascript:alert(1))',
          '![h](data:text/html;base64,AAAA)',
        ].join('\n\n')
      )
    );
    const byAlt = (alt: string) => box.querySelector<HTMLImageElement>(`img[alt="${alt}"]`);
    expect(byAlt('d')?.getAttribute('src')).toMatch(/^data:image\/png/);
    expect(byAlt('b')?.getAttribute('src')).toBe('blob:http://localhost/abc');
    expect(byAlt('w')?.hasAttribute('src')).toBe(false);
    expect(byAlt('w')?.classList.contains('image-blocked')).toBe(true);
    expect(byAlt('p')?.hasAttribute('src')).toBe(false);
    expect(byAlt('r')?.hasAttribute('src')).toBe(false);
    expect(byAlt('r')?.getAttribute('data-raw')).toBe('rel/pic.png');
    expect(byAlt('j')?.hasAttribute('src')).toBe(false);
    expect(byAlt('j')?.hasAttribute('data-raw')).toBe(false);
    expect(byAlt('h')?.hasAttribute('src')).toBe(false);
    expect(byAlt('h')?.hasAttribute('data-raw')).toBe(false);
  });

  it('treats a target a browser reads as another server as a web image, not a vault path', async () => {
    const box = dom(
      await renderNote(
        [
          '![t](ht&#9;tps://evil.example/a.png)',
          '![n](ht&#10;tps://evil.example/a.png)',
          '![u](\\\\\\\\evil.example/a.png)',
        ].join('\n\n')
      )
    );
    const imgs = Array.from(box.querySelectorAll('img'));
    expect(imgs.length).toBe(3);
    for (const img of imgs) {
      expect(img.hasAttribute('src'), img.outerHTML).toBe(false);
      expect(img.hasAttribute('data-raw'), img.outerHTML).toBe(false);
    }
  });

  it('shows web images once the setting allows them, and keys the cache on it', async () => {
    const md = '![w](https://example.com/a.png)\n';
    expect(
      dom(await renderNote(md))
        .querySelector('img')
        ?.hasAttribute('src')
    ).toBe(false);
    useStore.getState().updateSettings({ webImages: true });
    expect(
      dom(await renderNote(md))
        .querySelector('img')
        ?.getAttribute('src')
    ).toBe('https://example.com/a.png');
  });

  it('carries wiki tokens as embed spans with their raw text', async () => {
    const box = dom(await renderNote('See ![[pic.png|200]] and [[Plain|x]].\n'));
    const spans = [...box.querySelectorAll('span[data-md-embed]')];
    expect(spans.map((s) => s.getAttribute('data-raw'))).toEqual([
      '![[pic.png|200]]',
      '[[Plain|x]]',
    ]);
  });
});

describe('renderNote: privacy', () => {
  it('never puts a live img with a src into the page document while it builds', async () => {
    // A live <img src> starts its request at once, before the sanitiser can block it.
    const live: string[] = [];
    const original = Element.prototype.setAttribute;
    const spy = vi.spyOn(Element.prototype, 'setAttribute').mockImplementation(function (
      this: Element,
      name: string,
      value: string
    ) {
      if (this.ownerDocument === document && this.localName === 'img' && name === 'src')
        live.push(value);
      return original.call(this, name, value);
    });
    try {
      await renderNote(
        '![w](http://web.test/a.png)\n\n![r](images/x.png)\n\n![d](data:image/png;base64,AAAA)\n'
      );
    } finally {
      spy.mockRestore();
    }
    expect(live).toEqual([]);
  });

  it('builds the note in a document of its own, so cached HTML loads nothing either', async () => {
    const block = await renderNoteBlock({
      markdown: '![w](https://web.test/a.png)\n',
      cacheKey: 'privacy-key',
      notePath: 'Note.md',
      title: 'Note',
      ctx: context(),
      chain: startChain(null),
      mountEmbed,
      mountImage: () => ({ destroy() {} }),
    });
    const img = block.el.querySelector('img');
    expect(img?.hasAttribute('src')).toBe(false);
    expect(img?.classList.contains('image-blocked')).toBe(true);
  });
});

describe('renderNote: content the allow-list used to lose', () => {
  it('keeps the start of an ordered list', async () => {
    const box = dom(await renderNote('3. three\n4. four\n'));
    expect(box.querySelector('ol')?.getAttribute('start')).toBe('3');
  });

  it('keeps task state for the existing checkbox styling', async () => {
    const box = dom(await renderNote('- [ ] open\n- [x] done\n- plain\n'));
    const items = [...box.querySelectorAll('li')];
    expect(items.map((li) => li.getAttribute('data-item-type'))).toEqual(['task', 'task', null]);
    expect(items.map((li) => li.getAttribute('data-checked'))).toEqual(['false', 'true', null]);
    expect(box.querySelector('input')).toBeNull();
  });

  it('renders a footnote as a superscript label and a labelled note, not stray text', async () => {
    const box = dom(await renderNote('Footnote[^1] here\n\n[^1]: the note\n'));
    expect(box.querySelector('dl, dt, dd')).toBeNull();
    expect(box.querySelector('p sup')?.textContent).toBe('1');
    const def = box.querySelector('.md-transcluded-footnote');
    expect(def?.querySelector('sup')?.textContent).toBe('1');
    expect(def?.textContent).toContain('the note');
  });

  it('keeps column alignment of a table, and only that style', async () => {
    const box = dom(await renderNote('| a | b | c |\n|:--|:-:|--:|\n| 1 | 2 | 3 |\n'));
    const aligns = [...box.querySelectorAll('th, td')].map((cell) => cell.getAttribute('style'));
    expect(aligns).toEqual([
      'text-align: left;',
      'text-align: center;',
      'text-align: right;',
      'text-align: left;',
      'text-align: center;',
      'text-align: right;',
    ]);
    for (const el of box.querySelectorAll('*'))
      if (el.localName !== 'th' && el.localName !== 'td')
        expect(el.hasAttribute('style')).toBe(false);
  });

  it('applies a size written in the alt text and shows the alt without it', async () => {
    const box = dom(
      await renderNote('![alt|50](rel/pic.png)\n\n![wide|200x100](data:image/png;base64,AAAA)\n')
    );
    const [first, second] = [...box.querySelectorAll('img')];
    expect(first?.getAttribute('alt')).toBe('alt');
    expect(first?.getAttribute('width')).toBe('50');
    expect(first?.hasAttribute('height')).toBe(false);
    expect(first?.getAttribute('data-raw')).toBe('rel/pic.png');
    expect(second?.getAttribute('alt')).toBe('wide');
    expect(second?.getAttribute('width')).toBe('200');
    expect(second?.getAttribute('height')).toBe('100');
  });

  it('turns a Markdown image link to a PDF, audio or video into an embed span', async () => {
    const box = dom(
      await renderNote(
        '![doc](docs/a.pdf)\n\n![clip](v.mp4)\n\n![snd](s.mp3)\n\n![ico](icon.ico)\n\n![pic](p.png)\n'
      )
    );
    const spans = [...box.querySelectorAll('span[data-md-embed]')];
    expect(spans.map((s) => s.getAttribute('data-raw'))).toEqual([
      '![[docs/a.pdf]]',
      '![[v.mp4]]',
      '![[s.mp3]]',
    ]);
    expect(spans.every((s) => s.hasAttribute('data-md-markdown'))).toBe(true);
    // Other extensions stay images, as in the host pane.
    expect([...box.querySelectorAll('img')].map((i) => i.getAttribute('data-raw'))).toEqual([
      'icon.ico',
      'p.png',
    ]);
  });
});

describe('transclusion in a host', () => {
  const embedIn = async (raw: string, over: Partial<EmbedRenderContext> = {}) => {
    mountEmbed(host, raw, context(over));
    await vi.waitFor(() => expect(host.querySelector('.md-transclusion')).not.toBeNull());
  };

  it('wraps the note in a read-only bordered block with a header', async () => {
    notes({ Note: '# T\n\nBody\n' });
    await embedIn('![[Note#T]]');
    const block = host.querySelector<HTMLElement>('.md-transclusion');
    expect(block?.contentEditable).toBe('false');
    expect(block?.querySelector('.md-transclusion-header')?.textContent).toBe('Note > T');
  });

  it('shows a placeholder for a note that embeds itself', async () => {
    notes({ A: 'Alpha ![[A]]\n' });
    await embedIn('![[A]]');
    await vi.waitFor(() => expect(host.querySelector('.md-embed-cycle')).not.toBeNull());
    expect(host.querySelector('.md-embed-cycle')?.textContent).toContain(
      'A is already shown above'
    );
    expect(host.querySelector('.md-embed-cycle code')?.textContent).toBe('![[A]]');
  });

  it('detects a cycle through the host note itself', async () => {
    mocks.noteRelativePath.mockResolvedValue('Host.md');
    mocks.readNoteText.mockImplementation(async (_d: DocContext, target: string) => ({
      state: 'ok',
      path: target === 'Host' ? 'Host.md' : `${target}.md`,
      text: target === 'B' ? 'back ![[Host]]\n' : 'x',
      lastModified: 1,
      size: 1,
    }));
    await embedIn('![[B]]');
    await vi.waitFor(() => expect(host.querySelector('.md-embed-cycle')).not.toBeNull());
  });

  it('stops at the depth limit with a placeholder', async () => {
    notes({
      N1: 'one ![[N2]]\n',
      N2: 'two ![[N3]]\n',
      N3: 'three ![[N4]]\n',
      N4: 'four\n',
    });
    await embedIn('![[N1]]');
    await vi.waitFor(() => expect(host.querySelector('.md-embed-depth')).not.toBeNull());
    expect(host.textContent).toContain('three');
    expect(host.textContent).not.toContain('four');
    expect(host.querySelector('.md-embed-depth')?.textContent).toContain('nested too deeply');
  });

  it('renders A to B#S1 to A#S2: the same note in another section is not a cycle', async () => {
    notes({
      A: '# S1\n\nfirst ![[B#S1]]\n\n# S2\n\nfinal words\n',
      B: '# S1\n\nfrom b ![[A#S2]]\n',
    });
    await embedIn('![[A#S1]]');
    await vi.waitFor(() => expect(host.textContent).toContain('final words'));
    expect(host.querySelector('.md-embed-cycle')).toBeNull();
    expect(host.textContent).toContain('from b');
  });

  it('reads an empty target inside a transcluded note from that note, not the host', async () => {
    mocks.readNoteText.mockImplementation(
      async (_d: DocContext, target: string, opts?: { fromNotePath?: string | null }) => {
        if (target === 'A')
          return {
            state: 'ok',
            path: 'A.md',
            text: '# Sec\n\ninner words\n\n![[#Sec]]\n',
            lastModified: 1,
            size: 9,
          };
        if (target === '' && opts?.fromNotePath === 'A.md')
          return {
            state: 'ok',
            path: 'A.md',
            text: '# Sec\n\ninner words\n\n![[#Sec]]\n',
            lastModified: 1,
            size: 9,
          };
        return { state: 'missing', rootLooksLikeVault: true };
      }
    );
    await embedIn('![[A]]');
    await vi.waitFor(() =>
      expect(mocks.readNoteText).toHaveBeenCalledWith(doc, '', { fromNotePath: 'A.md' })
    );
    // A.md#Sec was not on the stack, so it renders once, and its own copy is the cycle.
    await vi.waitFor(() => expect(host.querySelector('.md-embed-cycle')).not.toBeNull());
  });

  it('mounts nested embeds, resolving them from the transcluded note', async () => {
    notes({ Note: 'Look ![[pic.png|120]] here\n' });
    mocks.resolveAttachment.mockResolvedValue({
      state: 'ok',
      path: 'Sub/pic.png',
      name: 'pic.png',
      kind: 'image',
      url: 'blob:pic',
      ambiguous: false,
    } satisfies ResolvedAttachment);
    await embedIn('![[Note]]');
    await vi.waitFor(() =>
      expect(host.querySelector('.md-transclusion img')?.getAttribute('src')).toBe('blob:pic')
    );
    expect(mocks.resolveAttachment).toHaveBeenCalledWith(doc, 'pic.png', {
      fromNotePath: 'Note.md',
    });
    expect(host.querySelector('.md-transclusion img')?.getAttribute('width')).toBe('120');
  });

  it('resolves a Markdown image of the note relative to that note', async () => {
    notes({ Note: '![alt|50](rel/pic.png)\n' });
    mocks.resolveAttachment.mockResolvedValue({
      state: 'ok',
      path: 'rel/pic.png',
      name: 'pic.png',
      kind: 'image',
      url: 'blob:md',
      ambiguous: false,
    } satisfies ResolvedAttachment);
    await embedIn('![[Note]]');
    await vi.waitFor(() =>
      expect(host.querySelector('.md-transclusion img')?.getAttribute('src')).toBe('blob:md')
    );
    expect(mocks.resolveAttachment).toHaveBeenCalledWith(doc, 'rel/pic.png', {
      markdown: true,
      fromNotePath: 'Note.md',
    });
  });

  it('shows only the first 50 KB of a huge note, with a marker', async () => {
    const para = 'word '.repeat(40);
    const big = Array.from({ length: 2000 }, (_, i) => `${i} ${para}`).join('\n\n');
    notes({ Big: big });
    await embedIn('![[Big]]');
    expect(host.querySelector('.md-transclusion-more')).not.toBeNull();
    expect(host.textContent?.length ?? 0).toBeLessThan(55_000);
  });

  it('mounts synchronously from the cache when the view is rebuilt', async () => {
    notes({ Note: 'cached body\n' });
    mocks.peekNoteRead.mockReturnValue({
      state: 'ok',
      path: 'Note.md',
      text: 'cached body\n',
      lastModified: 1,
      size: 12,
    });
    await embedIn('![[Note]]');
    const again = document.createElement('span');
    document.body.append(again);
    mountEmbed(again, '![[Note]]', context());
    // No await: the second view already shows the note.
    expect(again.querySelector('.md-transclusion')?.textContent).toContain('cached body');
  });

  it('keeps the drawn block when a notification finds the file unchanged', async () => {
    notes({ Note: 'same\n' });
    await embedIn('![[Note]]');
    const block = host.querySelector('.md-transclusion');
    const reads = mocks.readNoteText.mock.calls.length;
    for (const listener of [...listeners]) listener();
    await vi.waitFor(() => expect(mocks.readNoteText.mock.calls.length).toBeGreaterThan(reads));
    await Promise.resolve();
    expect(host.querySelector('.md-transclusion')).toBe(block);
  });

  it('draws the note again when the file changed', async () => {
    notes({ Note: 'before\n' });
    await embedIn('![[Note]]');
    mocks.readNoteText.mockResolvedValue({
      state: 'ok',
      path: 'Note.md',
      text: 'after\n',
      lastModified: 2,
      size: 6,
    });
    for (const listener of [...listeners]) listener();
    await vi.waitFor(() => expect(host.textContent).toContain('after'));
    expect(host.textContent).not.toContain('before');
  });
});

describe('transclusion block', () => {
  const args = (over = {}) => ({
    markdown: 'text with a [bad](other.md) link\n',
    cacheKey: 'k1',
    notePath: 'Note.md',
    title: 'Note',
    ctx: context(),
    chain: startChain(null),
    mountEmbed,
    mountImage: () => ({ destroy() {} }),
    ...over,
  });

  it('peeks nothing before the first render, then builds from the cache', async () => {
    const a = args({ cacheKey: 'fresh-key' });
    expect(peekNoteBlock(a)).toBeNull();
    const first = await renderNoteBlock(a);
    first.destroy();
    const hit = peekNoteBlock(a);
    expect(hit?.el.textContent).toContain('text with a bad link');
    expect(hit?.el).not.toBe(first.el);
  });

  it('prevents navigation for a link that is not allowed and leaves safe links alone', async () => {
    const block = await renderNoteBlock(
      args({ markdown: '[ok](https://example.com) [bad](other.md)\n', cacheKey: 'click-key' })
    );
    document.body.append(block.el);
    const ok = block.el.querySelector('a');
    const click = (target: Element) => {
      const event = new MouseEvent('click', { bubbles: true, cancelable: true });
      target.dispatchEvent(event);
      return event.defaultPrevented;
    };
    expect(click(ok as Element)).toBe(false);
    // A relative or script link never reaches the DOM as an anchor, but a
    // hand-added one must still be stopped.
    const stray = document.createElement('a');
    stray.setAttribute('href', 'javascript:alert(1)');
    block.el.append(stray);
    expect(click(stray)).toBe(true);
    const relative = document.createElement('a');
    relative.setAttribute('href', 'other.md');
    block.el.append(relative);
    expect(click(relative)).toBe(true);
  });

  it('removes its listener and nested views on destroy', async () => {
    const destroyed = vi.fn();
    const block = await renderNoteBlock(
      args({
        markdown: '![[pic.png]]\n',
        cacheKey: 'destroy-key',
        mountEmbed: () => ({ update() {}, destroy: destroyed }),
      })
    );
    block.destroy();
    expect(destroyed).toHaveBeenCalledTimes(1);
  });
});

describe('inside the visual editor', () => {
  let editor: Editor;

  afterEach(async () => {
    await editor.destroy();
  });

  it("never adds transcluded headings to the pane's heading list", async () => {
    notes({ Note: '# Inner heading\n\ntext\n\n## Another\n\nmore\n' });
    const md = '# First\n\nintro\n\n![[Note]]\n\n## Second\n\nend ![[Note#Another]]\n';
    const root = document.createElement('div');
    document.body.append(root);
    editor = await Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, root);
        ctx.set(defaultValueCtx, md);
        ctx.update(remarkPluginsCtx, (plugins) => [
          ...plugins,
          remarkFrontMatter,
          imageTitleFix,
          remarkEmbeds,
        ]);
        ctx.update(nodeViewCtx, (views) => {
          const embed: (typeof views)[number] = ['embed', embedNodeView];
          return [...views, embed];
        });
      })
      .use(commonmark)
      .use(gfm)
      .use(frontMatter)
      .use(embeds)
      .create();
    const pm = root.querySelector('.ProseMirror') as Element;
    await vi.waitFor(() => expect(pm.querySelectorAll('.md-transclusion').length).toBe(2));
    expect(visualHeadings(pm).length).toBe(findHeadings(md).length);
    expect(pm.querySelectorAll('.md-transclusion h1, .md-transclusion h2').length).toBe(0);
    expect(pm.querySelectorAll('.md-transcluded-heading').length).toBeGreaterThan(0);
    // The document itself holds only the tokens.
    const view = editor.action((ctx) => ctx.get(editorViewCtx));
    expect(view.state.doc.textContent).not.toContain('Inner heading');
  });
});

describe('transclusion in a host: links, settings and identity', () => {
  const embedIn = async (raw: string, over: Partial<EmbedRenderContext> = {}) => {
    mountEmbed(host, raw, context(over));
    await vi.waitFor(() => expect(host.querySelector('.md-transclusion')).not.toBeNull());
  };

  it("leaves the app's own Open links alone and still stops the note's own", async () => {
    notes({ Note: '![[a.pdf]]\n\ntext ![[b.zip]]\n\n[rel](other.md)\n' });
    mocks.resolveAttachment.mockImplementation(
      async (_doc: DocContext, target: string): Promise<ResolvedAttachment> => ({
        state: 'ok',
        path: target,
        name: target,
        kind: target.endsWith('.pdf') ? 'pdf' : 'other',
        url: `blob:http://localhost/${target}`,
        ambiguous: false,
      })
    );
    await embedIn('![[Note]]');
    await vi.waitFor(() => expect(host.querySelectorAll('a.md-embed-open').length).toBe(2));
    for (const open of host.querySelectorAll('a.md-embed-open')) {
      const event = new MouseEvent('click', { bubbles: true, cancelable: true });
      open.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
    }
    const stray = document.createElement('a');
    stray.setAttribute('href', 'other.md');
    host.querySelector('.md-transclusion-body')?.append(stray);
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    stray.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it('says in a tooltip which note was read when two share the name', async () => {
    mocks.readNoteText.mockResolvedValue({
      state: 'ok',
      path: 'Notes/Daily/dup.md',
      text: 'near\n',
      lastModified: 1,
      size: 5,
      ambiguous: true,
    } satisfies NoteRead);
    await embedIn('![[dup]]');
    expect(host.querySelector<HTMLElement>('.md-transclusion')?.title).toBe(
      'Several files share this name. Showing Notes/Daily/dup.md.'
    );
  });

  it('draws a Markdown image link to a PDF in a transcluded note as an embed', async () => {
    notes({ Note: '![doc](docs/a.pdf)\n' });
    mocks.resolveAttachment.mockResolvedValue({
      state: 'ok',
      path: 'docs/a.pdf',
      name: 'a.pdf',
      kind: 'pdf',
      url: 'blob:pdf',
      ambiguous: false,
    } satisfies ResolvedAttachment);
    await embedIn('![[Note]]');
    await vi.waitFor(() => expect(host.querySelector('.md-transclusion iframe')).not.toBeNull());
    expect(host.querySelector('.md-transclusion img')).toBeNull();
    // A Markdown link is tried next to the note first.
    expect(mocks.resolveAttachment).toHaveBeenCalledWith(doc, 'docs/a.pdf', {
      markdown: true,
      fromNotePath: 'Note.md',
    });
  });

  it('shows web images inside an already drawn note when Load web images is turned on', async () => {
    notes({ Sub: '![sub](https://web.test/sub.png)\n' });
    await embedIn('![[Sub]]');
    expect(host.querySelector('.md-transclusion img')?.classList.contains('image-blocked')).toBe(
      true
    );
    useStore.getState().updateSettings({ webImages: true });
    await vi.waitFor(() =>
      expect(host.querySelector('.md-transclusion img')?.getAttribute('src')).toBe(
        'https://web.test/sub.png'
      )
    );
    expect(host.querySelector('.md-transclusion img')?.classList.contains('image-blocked')).toBe(
      false
    );
    useStore.getState().updateSettings({ webImages: false });
    await vi.waitFor(() =>
      expect(host.querySelector('.md-transclusion img')?.hasAttribute('src')).toBe(false)
    );
  });

  it('does not reuse a drawn note for another vault whose file looks the same', async () => {
    let handleId = 'A';
    mocks.readNoteText.mockImplementation(
      async (d: DocContext): Promise<NoteRead> => ({
        state: 'ok',
        path: 'Other.md',
        text: d.handleId === 'A' ? 'ALPHA text\n' : 'BRAVO text\n',
        lastModified: 1000,
        size: 11,
      })
    );
    mountEmbed(host, '![[Other]]', context({ doc: () => ({ fileHandle: null, handleId }) }));
    await vi.waitFor(() => expect(host.textContent).toContain('ALPHA text'));
    handleId = 'B';
    for (const listener of [...listeners]) listener();
    await vi.waitFor(() => expect(host.textContent).toContain('BRAVO text'));
    expect(host.textContent).not.toContain('ALPHA');
  });

  it('finds a cycle through the host once the folder is chosen, after an unanswered path', async () => {
    notes({ Second: 'second body\n\n![[n]]\n', n: 'N text\n' });
    mocks.noteRelativePath.mockResolvedValue(null);
    await embedIn('![[Second]]');
    // No folder yet: nothing says the host is n.md, so n is shown in full.
    await vi.waitFor(() => expect(host.textContent).toContain('N text'));
    mocks.noteRelativePath.mockResolvedValue('n.md');
    for (const listener of [...listeners]) listener();
    await vi.waitFor(() => expect(host.textContent).toContain('is already shown above'));
    expect(host.textContent).not.toContain('N text');
  });
});

describe('transcluded notes: math, callouts and diagrams', () => {
  const noteArgs = (markdown: string, cacheKey: string) => ({
    markdown,
    cacheKey,
    notePath: 'Note.md',
    title: 'Note',
    ctx: context(),
    chain: startChain(null),
    mountEmbed,
    mountImage: () => ({ destroy() {} }),
  });

  it('typesets formulas and leaves a price as text', async () => {
    const block = await renderNoteBlock(
      noteArgs('Inline $x^2$ costs $5 today.\n\n$$\nE = mc^2\n$$\n', 'math-key')
    );
    document.body.append(block.el);
    const formulas = block.el.querySelectorAll('.md-math');
    expect(Array.from(formulas).map((f) => f.getAttribute('data-raw'))).toEqual([
      '$x^2$',
      '$$\nE = mc^2\n$$',
    ]);
    expect(formulas[1]?.classList.contains('md-math-display')).toBe(true);
    await vi.waitFor(() => expect(block.el.querySelectorAll('math').length).toBe(2));
    expect(block.el.textContent).toContain('costs $5 today.');
    block.destroy();
    block.el.remove();
  });

  it('frames a callout with its title and type', async () => {
    const block = await renderNoteBlock(
      noteArgs('> [!warning] Careful\n> Mind the gap.\n\n> [!tip]\n> Bare.\n', 'callout-key')
    );
    const quotes = block.el.querySelectorAll('blockquote.callout');
    expect(quotes[0]?.className).toContain('callout-warning');
    expect(quotes[0]?.querySelector('.callout-title')?.textContent).toBe('Careful');
    expect(quotes[1]?.getAttribute('data-callout-label')).toBe('Tip');
    expect(block.el.textContent).not.toContain('[!');
    block.destroy();
  });

  it('puts a diagram above a mermaid fence and no other fence', async () => {
    const block = await renderNoteBlock(
      noteArgs('```mermaid\ngraph TD\n A-->B\n```\n\n```js\nlet a;\n```\n', 'diagram-key')
    );
    expect(block.el.querySelectorAll('.read-diagram').length).toBe(1);
    expect(block.el.querySelector('.read-diagram + pre')?.textContent).toContain('A-->B');
    block.destroy();
  });

  it('keeps a fence language a note cannot use to carry other attributes', async () => {
    const html = await renderNote('```" onmouseover="x\ncode\n```\n');
    expect(html).not.toContain('onmouseover');
  });
});
