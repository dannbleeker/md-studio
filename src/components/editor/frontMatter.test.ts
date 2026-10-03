import {
  type CmdKey,
  Editor,
  editorViewCtx,
  parserCtx,
  remarkPluginsCtx,
  rootCtx,
  serializerCtx,
} from '@milkdown/kit/core';
import { history } from '@milkdown/kit/plugin/history';
import {
  commonmark,
  createCodeBlockCommand,
  insertHrCommand,
  wrapInBlockquoteCommand,
  wrapInBulletListCommand,
  wrapInHeadingCommand,
} from '@milkdown/kit/preset/commonmark';
import { gfm, insertTableCommand } from '@milkdown/kit/preset/gfm';
import { redo, undo } from '@milkdown/kit/prose/history';
import type { Node } from '@milkdown/kit/prose/model';
import { AllSelection, NodeSelection, TextSelection } from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';
import { callCommand } from '@milkdown/kit/utils';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { frontMatter, remarkFrontMatter } from './frontMatter';

let editor: Editor;

beforeEach(async () => {
  const root = document.createElement('div');
  document.body.append(root);
  // The same remark and preset order as the visual pane.
  editor = await Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, root);
      ctx.update(remarkPluginsCtx, (plugins) => [...plugins, remarkFrontMatter]);
    })
    .use(commonmark)
    .use(gfm)
    .use(frontMatter)
    .use(history)
    .create();
});

afterEach(async () => {
  await editor.destroy();
  document.body.replaceChildren();
});

const parse = (md: string): Node => editor.action((ctx) => ctx.get(parserCtx)(md));
const serialize = (doc: Node): string => editor.action((ctx) => ctx.get(serializerCtx)(doc));
const types = (doc: Node) => {
  const out: string[] = [];
  doc.forEach((node) => {
    out.push(node.type.name);
  });
  return out;
};

describe('front matter parse (Pandoc rules, as frontMatterEnd)', () => {
  it('closes at a `...` line and keeps the body after it', () => {
    const md = '---\ntitle: Report\n...\n\n# Introduction\n\nKey findings.\n\n---\n\n# Appendix\n';
    const doc = parse(md);
    expect(types(doc)).toEqual(['front_matter', 'heading', 'paragraph', 'hr', 'heading']);
    expect(doc.child(0).textContent).toBe('title: Report');
    // Written back with its own closing fence (the rule in the serializer's style).
    expect(serialize(doc)).toBe(md.replace('\n---\n\n# A', '\n***\n\n# A'));
  });

  it('reads `...` front matter without any later `---`', () => {
    const doc = parse('---\ntitle: R\n...\n\nBody\n');
    expect(types(doc)).toEqual(['front_matter', 'paragraph']);
    expect(serialize(doc)).toBe('---\ntitle: R\n...\n\nBody\n');
  });

  it('treats an opening fence followed by a blank line as a rule', () => {
    const doc = parse('---\n\nIntro paragraph.\n\n---\n\n# Title\n');
    expect(types(doc)).toEqual(['hr', 'paragraph', 'hr', 'heading']);
    expect(doc.child(1).textContent).toBe('Intro paragraph.');
  });

  it('leaves ordinary front matter alone', () => {
    const md = '---\ntitle: Post\n---\n\n# Title\n';
    const doc = parse(md);
    expect(types(doc)).toEqual(['front_matter', 'heading']);
    expect(serialize(doc)).toBe(md);
  });
});

/** The view, showing `md`. */
function load(md: string): EditorView {
  return editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    const doc = ctx.get(parserCtx)(md);
    // As the panes' sync loads it: outside the undo history.
    const tr = view.state.tr.replaceWith(0, view.state.doc.content.size, doc.content);
    view.dispatch(tr.setMeta('addToHistory', false));
    return view;
  });
}

const markdown = (view: EditorView) => serialize(view.state.doc);
const select = (view: EditorView, from: number, to = from) =>
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, from, to)));
/** As typed text reaches ProseMirror: the handlers first, then the default. */
const type = (view: EditorView, text: string) => {
  const { from, to } = view.state.selection;
  const handled = view.someProp('handleTextInput', (f) =>
    f(view, from, to, text, () => view.state.tr.insertText(text, from, to))
  );
  if (!handled) view.dispatch(view.state.tr.insertText(text, from, to));
};
const press = (view: EditorView, key: string) =>
  view.someProp('handleKeyDown', (f) => f(view, new KeyboardEvent('keydown', { key })));
const run = (key: CmdKey<unknown>, payload?: unknown) => editor.action(callCommand(key, payload));

const POST = '---\ntitle: Post\ndate: 2024\n---\n\nHello world\n';
// In POST's view: the block's text starts at 1, "date" at 13, and the
// paragraph's text at 25 (the block is 22 characters plus its two tokens).
const DATE = 13;
const BODY = 25;

describe('front matter editing', () => {
  it('becomes a YAML code block once a fence line is typed into it', () => {
    for (const fence of ['---', '...']) {
      const view = load(POST);
      view.dispatch(view.state.tr.insertText(`${fence}\n`, DATE));
      expect(types(view.state.doc)).toEqual(['code_block', 'paragraph']);
      expect(view.state.doc.child(0).attrs.language).toBe('yaml');
      expect(view.state.doc.child(0).textContent).toBe(`title: Post\n${fence}\ndate: 2024`);
    }
  });

  it('undoes and redoes that conversion', () => {
    const view = load(POST);
    view.dispatch(view.state.tr.insertText('---\n', DATE));
    undo(view.state, view.dispatch);
    expect(markdown(view)).toBe(POST);
    redo(view.state, view.dispatch);
    expect(types(view.state.doc)).toEqual(['code_block', 'paragraph']);
  });

  it('is not wrapped, split or retyped by block commands', () => {
    const commands: [CmdKey<unknown>, unknown?][] = [
      [wrapInBlockquoteCommand.key],
      [insertHrCommand.key],
      [insertTableCommand.key as CmdKey<unknown>, { row: 2, col: 2 }],
      [createCodeBlockCommand.key],
      [wrapInHeadingCommand.key as CmdKey<unknown>, 1],
      [wrapInBulletListCommand.key],
    ];
    for (const [key, payload] of commands) {
      const view = load(POST);
      select(view, DATE);
      run(key, payload);
      expect(markdown(view)).toMatch(/^---\ntitle: Post\ndate: 2024\n---\n/);
      expect(types(view.state.doc).filter((t) => t === 'front_matter')).toEqual(['front_matter']);
      expect(view.state.doc.child(0).textContent).toBe('title: Post\ndate: 2024');
    }
  });

  it('keeps body text out when a selection from it into the body is replaced', () => {
    const view = load(POST);
    expect(view.state.doc.textBetween(BODY, BODY + 5)).toBe('Hello');
    select(view, 6, BODY + 5);
    type(view, 'Z');
    expect(types(view.state.doc)).toEqual(['front_matter', 'paragraph']);
    expect(view.state.doc.child(0).textContent).toBe('titleZ');
    expect(view.state.doc.child(1).textContent).toBe(' world');

    const again = load(POST);
    select(again, 6, BODY + 5);
    press(again, 'Backspace');
    expect(again.state.doc.child(0).textContent).toBe('title');
    expect(again.state.doc.child(1).textContent).toBe(' world');
  });

  it('splits a paste over such a selection the same way, pasting as plain text', () => {
    const view = load(POST);
    select(view, 6, BODY + 5);
    view.pasteText('Z: 1\ny: 2', new Event('paste') as ClipboardEvent);
    expect(types(view.state.doc)).toEqual(['front_matter', 'paragraph']);
    expect(view.state.doc.child(0).textContent).toBe('titleZ: 1\ny: 2');
    expect(view.state.doc.child(1).textContent).toBe(' world');
  });

  it('lets an IME compose over such a selection, starting inside the block', () => {
    const view = load(POST);
    select(view, 6, BODY + 5);
    view.dom.dispatchEvent(new CompositionEvent('compositionstart'));
    expect(view.state.doc.child(0).textContent).toBe('title');
    expect(view.state.doc.child(1).textContent).toBe(' world');
    expect(view.state.selection.empty).toBe(true);
    expect(view.state.selection.from).toBe(6);
  });

  it('never takes the first paragraph in on Backspace or Delete', () => {
    const view = load(POST);
    select(view, BODY);
    press(view, 'Backspace');
    expect(view.state.selection).not.toBeInstanceOf(NodeSelection);
    press(view, 'Backspace');
    expect(markdown(view)).toBe(POST);

    select(view, BODY - 2);
    press(view, 'Delete');
    expect(markdown(view)).toBe(POST);
  });

  it('still lets select-all replace everything', () => {
    const view = load(POST);
    view.dispatch(view.state.tr.setSelection(new AllSelection(view.state.doc)));
    type(view, 'X');
    expect(markdown(view)).toBe('X\n');
  });
});
