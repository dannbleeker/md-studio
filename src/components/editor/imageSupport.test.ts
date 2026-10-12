import { markdown } from '@codemirror/lang-markdown';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import {
  defaultValueCtx,
  Editor,
  editorViewCtx,
  remarkPluginsCtx,
  rootCtx,
  serializerCtx,
} from '@milkdown/kit/core';
import { commonmark } from '@milkdown/kit/preset/commonmark';
import { Schema } from '@milkdown/kit/prose/model';
import { EditorState as PmState, TextSelection } from '@milkdown/kit/prose/state';
import { EditorView as PmView } from '@milkdown/kit/prose/view';
import { basicSetup } from 'codemirror';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlacedAttachment } from '@/services/images';

const placeFiles = vi.fn();
const isHandledDrop = vi.fn(() => true);
vi.mock('@/services/images', () => ({
  placeFiles: (...a: unknown[]) => placeFiles(...a),
  isHandledDrop: (...a: unknown[]) => isHandledDrop(...(a as [])),
}));
const showToast = vi.fn();
vi.mock('@/store/ui', () => ({ showToast: (...a: unknown[]) => showToast(...a) }));

import { embeds, remarkEmbeds } from './embedNode';
import { textPaneImageHandlers, visualPaneImagePlugin } from './imageSupport';

const png = () => new File(['x'], 'a.png', { type: 'image/png' });
const pdf = () => new File(['x'], 'a.pdf', { type: 'application/pdf' });
const note = () => new File(['x'], 'n.md', { type: 'text/markdown' });

const clip = (files: File[], text = '') =>
  ({
    clipboardData: { files, getData: () => text },
    preventDefault: vi.fn(),
  }) as unknown as ClipboardEvent;
const dropEvent = (files: File[]) =>
  ({
    dataTransfer: { files },
    clientX: 1,
    clientY: 1,
    preventDefault: vi.fn(),
  }) as unknown as DragEvent;
const flush = () => new Promise((r) => setTimeout(r, 0));

const wiki = (raw: string): PlacedAttachment => ({ via: 'wikilink', raw, kind: 'image' });
const md = (text: string): PlacedAttachment => ({
  via: 'markdown',
  src: 'x',
  alt: '',
  kind: 'image',
  text,
});

let view: EditorView;
beforeEach(() => {
  placeFiles.mockReset();
  isHandledDrop.mockReset();
  isHandledDrop.mockReturnValue(true);
  showToast.mockReset();
  view = new EditorView({
    parent: document.body,
    state: EditorState.create({ doc: 'ab', extensions: [basicSetup, markdown()] }),
  });
  view.posAtCoords = () => 1;
});
afterEach(() => view.destroy());

describe('text pane paste', () => {
  it('handles a pasted image with origin paste', async () => {
    const files = [png()];
    expect(textPaneImageHandlers().paste(clip(files), view)).toBe(true);
    await flush();
    expect(placeFiles).toHaveBeenCalledWith(files, 'paste', expect.any(Function));
  });

  it('handles an image next to text', () => {
    expect(textPaneImageHandlers().paste(clip([png()], 'caption'), view)).toBe(true);
  });

  it('handles a pdf-only paste', () => {
    expect(textPaneImageHandlers().paste(clip([pdf()]), view)).toBe(true);
  });

  it('leaves text plus pdf to the browser', () => {
    expect(textPaneImageHandlers().paste(clip([pdf()], 'cells'), view)).toBe(false);
    expect(textPaneImageHandlers().paste(clip([]), view)).toBe(false);
  });
});

describe('text pane drop', () => {
  it('claims a markdown drop without placing it', async () => {
    expect(textPaneImageHandlers().drop(dropEvent([note()]), view)).toBe(true);
    await flush();
    expect(placeFiles).not.toHaveBeenCalled();
  });

  it('ignores a drop without files', () => {
    expect(textPaneImageHandlers().drop(dropEvent([]), view)).toBe(false);
  });

  it('places a dropped pdf at the drop point', async () => {
    const files = [pdf()];
    expect(textPaneImageHandlers().drop(dropEvent(files), view)).toBe(true);
    await flush();
    expect(view.state.selection.main.head).toBe(1);
    expect(placeFiles).toHaveBeenCalledWith(files, 'drop', expect.any(Function));
  });

  it('toasts and claims files that will not be taken', async () => {
    isHandledDrop.mockReturnValue(false);
    expect(textPaneImageHandlers().drop(dropEvent([pdf()]), view)).toBe(true);
    await flush();
    expect(showToast).toHaveBeenCalledOnce();
    expect(placeFiles).not.toHaveBeenCalled();
  });
});

describe('text pane insert', () => {
  const insertWith = async (items: PlacedAttachment[]) => {
    placeFiles.mockImplementation(async (_f, _o, insert: (p: PlacedAttachment) => void) => {
      for (const p of items) insert(p);
    });
    textPaneImageHandlers().paste(clip([png()]), view);
    await flush();
  };

  it('inserts the raw wikilink at the caret', async () => {
    view.dispatch({ selection: { anchor: 1 } });
    await insertWith([wiki('![[a.png]]')]);
    expect(view.state.doc.toString()).toBe('a![[a.png]]b');
  });

  it('inserts markdown text and separates several files by a newline', async () => {
    await insertWith([md('![x](a.png)'), wiki('![[b.pdf]]')]);
    expect(view.state.doc.toString()).toBe('![x](a.png)\n![[b.pdf]]ab');
  });

  it('is undoable', async () => {
    await insertWith([wiki('![[a.png]]')]);
    expect(view.state.doc.toString()).toBe('![[a.png]]ab');
    view.contentDOM.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'z', code: 'KeyZ', ctrlKey: true, bubbles: true })
    );
    expect(view.state.doc.toString()).toBe('ab');
  });

  it('reaches update listeners as a user edit', async () => {
    const seen: boolean[] = [];
    view.destroy();
    view = new EditorView({
      parent: document.body,
      state: EditorState.create({
        doc: 'ab',
        extensions: [EditorView.updateListener.of((u) => seen.push(u.docChanged))],
      }),
    });
    await insertWith([wiki('![[a.png]]')]);
    expect(seen).toContain(true);
  });
});

describe('visual pane plugin', () => {
  const schema = new Schema({
    nodes: {
      doc: { content: 'block+' },
      paragraph: { content: 'inline*', group: 'block', toDOM: () => ['p', 0] as never },
      code_block: {
        content: 'text*',
        group: 'block',
        code: true,
        toDOM: () => ['pre', 0] as never,
      },
      text: { group: 'inline' },
      embed: {
        group: 'inline',
        inline: true,
        atom: true,
        attrs: { raw: { default: '' } },
        toDOM: () => ['span'] as never,
      },
    },
  });
  const make = (kind: 'paragraph' | 'code_block') => {
    const doc = schema.node('doc', null, [schema.node(kind, null, [schema.text('ab')])]);
    const pm = new PmView(document.createElement('div'), {
      state: PmState.create({
        doc,
        selection: TextSelection.create(doc, 2),
      }),
    });
    pm.focus = () => {};
    const editor = {
      action: (fn: (ctx: { get: () => PmView }) => void) => fn({ get: () => pm }),
    };
    // biome-ignore lint/suspicious/noExplicitAny: minimal Editor stand-in
    return { pm, plugin: visualPaneImagePlugin(() => editor as any) };
  };
  const paste = (plugin: ReturnType<typeof make>['plugin'], pm: PmView, e: ClipboardEvent) =>
    plugin.props.handlePaste?.call(plugin, pm, e, null as never);

  it('inserts an embed node for a wikilink', async () => {
    const { pm, plugin } = make('paragraph');
    placeFiles.mockImplementation(async (_f, _o, insert: (p: PlacedAttachment) => void) =>
      insert(wiki('![[a.png]]'))
    );
    expect(paste(plugin, pm, clip([png()]))).toBe(true);
    await flush();
    const node = pm.state.doc.firstChild?.child(1);
    expect(node?.type.name).toBe('embed');
    expect(node?.attrs.raw).toBe('![[a.png]]');
  });

  it('inserts the raw text inside a code block', async () => {
    const { pm, plugin } = make('code_block');
    placeFiles.mockImplementation(async (_f, _o, insert: (p: PlacedAttachment) => void) =>
      insert(wiki('![[a.png]]'))
    );
    paste(plugin, pm, clip([png()]));
    await flush();
    expect(pm.state.doc.textContent).toBe('a![[a.png]]b');
  });

  it('leaves mixed text and pdf pastes alone', () => {
    const { pm, plugin } = make('paragraph');
    expect(paste(plugin, pm, clip([pdf()], 'x'))).toBe(false);
  });
});

describe('visual pane plugin with the real schema', () => {
  let editor: Editor;
  beforeEach(async () => {
    const root = document.createElement('div');
    document.body.append(root);
    editor = await Editor.make()
      .config((ctx) => ctx.set(rootCtx, root))
      .use(commonmark)
      .create();
  });
  afterEach(async () => {
    await editor.destroy();
    document.body.replaceChildren();
  });

  const placeAndSerialize = async (p: PlacedAttachment) => {
    const plugin = visualPaneImagePlugin(() => editor);
    placeFiles.mockImplementation(async (_f, _o, insert: (x: PlacedAttachment) => void) =>
      insert(p)
    );
    const pm = editor.action((ctx) => ctx.get(editorViewCtx));
    plugin.props.handlePaste?.call(plugin, pm, clip([png()]), null as never);
    await flush();
    return editor.action((ctx) => ctx.get(serializerCtx)(pm.state.doc)).trim();
  };
  const placed = (kind: 'image' | 'pdf' | 'audio' | 'video' | 'note' | 'other', ext: string) => {
    const src = `Attachments/data.${ext}`;
    const text = ['image', 'pdf', 'audio', 'video'].includes(kind)
      ? `![data](${src})`
      : `[data](${src})`;
    return { via: 'markdown', src, alt: 'data', kind, text } as const;
  };

  it('writes a link, not an image, for a non-media file', async () => {
    expect(await placeAndSerialize(placed('other', 'zip'))).toBe('[data](Attachments/data.zip)');
  });

  it('writes a link for a note', async () => {
    expect(await placeAndSerialize(placed('note', 'md'))).toBe('[data](Attachments/data.md)');
  });

  it.each([
    ['image', 'png'],
    ['pdf', 'pdf'],
  ] as const)('still writes an image for a %s', async (kind, ext) => {
    expect(await placeAndSerialize(placed(kind, ext))).toBe(`![data](Attachments/data.${ext})`);
  });
});

describe('visual pane plugin with embeds in marked text', () => {
  let editor: Editor;
  // jsdom has no layout; scrollIntoView measures the caret through a Range.
  const range = Range.prototype as unknown as Record<string, unknown>;
  beforeAll(() => {
    range.getClientRects = () => [];
    range.getBoundingClientRect = () => new DOMRect();
  });
  afterAll(() => {
    range.getClientRects = undefined;
    range.getBoundingClientRect = undefined;
  });
  const open = async (md: string) => {
    const root = document.createElement('div');
    document.body.append(root);
    editor = await Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, root);
        ctx.set(defaultValueCtx, md);
        ctx.update(remarkPluginsCtx, (plugins) => [...plugins, remarkEmbeds]);
      })
      .use(commonmark)
      .use(embeds)
      .create();
    return editor.action((ctx) => ctx.get(editorViewCtx));
  };
  afterEach(async () => {
    await editor.destroy();
    document.body.replaceChildren();
  });

  /** Pastes a file with the caret at `pos` and returns the document as Markdown. */
  const pasteAt = async (md: string, pos: number): Promise<string> => {
    const pm = await open(md);
    pm.dispatch(pm.state.tr.setSelection(TextSelection.create(pm.state.doc, pos)));
    placeFiles.mockImplementation(async (_f, _o, insert: (x: PlacedAttachment) => void) =>
      insert(wiki('![[pic.png]]'))
    );
    const plugin = visualPaneImagePlugin(() => editor);
    plugin.props.handlePaste?.call(plugin, pm, clip([png()]), null as never);
    await flush();
    return editor.action((ctx) => ctx.get(serializerCtx)(pm.state.doc));
  };

  it('writes the token as text inside an inline code span, not as empty backticks', async () => {
    expect(await pasteAt('a `code` b\n', 5)).toBe('a `co![[pic.png]]de` b\n');
  });

  it('puts the token beside a link, not in its label', async () => {
    const out = await pasteAt('[link text](http://e.com)\n', 4);
    expect(out).toContain('![[pic.png]]');
    expect(out).not.toMatch(/\[[^\]]*!\[\[pic/);
  });

  it('keeps the bold of the text around the caret', async () => {
    expect(await pasteAt('a **bold** b\n', 5)).toBe('a **bo![[pic.png]]ld** b\n');
  });
});
