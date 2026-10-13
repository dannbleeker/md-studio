import {
  Editor,
  editorViewCtx,
  parserCtx,
  remarkPluginsCtx,
  rootCtx,
  serializerCtx,
} from '@milkdown/kit/core';
import { commonmark } from '@milkdown/kit/preset/commonmark';
import { gfm } from '@milkdown/kit/preset/gfm';
import type { Node } from '@milkdown/kit/prose/model';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyFull, applyIncremental } from './applyMarkdown';
import { embeds, remarkEmbeds } from './embedNode';
import { frontMatter, remarkFrontMatter } from './frontMatter';
import { imageTitleFix } from './imageTitleFix';
import { keepSourceStyle } from './keepSourceStyle';

let editor: Editor;

beforeEach(async () => {
  const root = document.createElement('div');
  document.body.append(root);
  editor = await Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, root);
      ctx.update(remarkPluginsCtx, (plugins) => [
        ...plugins,
        remarkFrontMatter,
        imageTitleFix,
        remarkEmbeds,
      ]);
    })
    .use(commonmark)
    .use(gfm)
    .use(frontMatter)
    .use(embeds)
    .create();
});

afterEach(async () => {
  await editor.destroy();
  document.body.replaceChildren();
});

const view = () => editor.action((ctx) => ctx.get(editorViewCtx));
const embedNodes = (): Node[] => {
  const out: Node[] = [];
  view().state.doc.descendants((node) => {
    if (node.type.name === 'embed') out.push(node);
  });
  return out;
};

const DOC = [
  '# Notes',
  '',
  'First ![[a b.png|300]] paragraph.',
  '',
  'Second paragraph.',
  '',
  'A table:',
  '',
  '| n | pic |',
  '| - | --- |',
  '| 1 | ![[one.png\\|200]] |',
  '',
  'Last ![[x.pdf#page=2]] and [[Plain|alias]].',
  '',
].join('\n');

describe('applying Markdown with embeds', () => {
  it('a second identical full apply dispatches nothing', () => {
    applyFull(editor, DOC);
    expect(embedNodes().map((n) => n.attrs.raw)).toEqual([
      '![[a b.png|300]]',
      '![[one.png\\|200]]',
      '![[x.pdf#page=2]]',
      '[[Plain|alias]]',
    ]);
    const spy = vi.spyOn(view(), 'dispatch');
    applyFull(editor, DOC);
    expect(spy).not.toHaveBeenCalled();
  });

  it('a full apply after an edit leaves the other embed nodes untouched', () => {
    applyFull(editor, DOC);
    const before = embedNodes();
    applyFull(editor, DOC.replace('Second paragraph.', 'Second paragraph, edited.'));
    const after = embedNodes();
    expect(after).toHaveLength(before.length);
    after.forEach((node, i) => {
      expect(node).toBe(before[i]);
    });
  });

  it('an incremental apply next to an embed block keeps every embed node', () => {
    applyFull(editor, DOC);
    const before = embedNodes();
    const next = DOC.replace('Second paragraph.', 'Second paragraph, edited by typing.');
    expect(applyIncremental(editor, DOC, next)).toBe(true);
    expect(view().state.doc.textContent).toContain('edited by typing');
    const after = embedNodes();
    after.forEach((node, i) => {
      expect(node).toBe(before[i]);
    });
  });

  it('an incremental edit of the embed paragraph itself replaces just that paragraph', () => {
    applyFull(editor, DOC);
    const before = embedNodes();
    const next = DOC.replace(
      'First ![[a b.png|300]] paragraph.',
      'First ![[a b.png|400]] paragraph.'
    );
    expect(applyIncremental(editor, DOC, next)).toBe(true);
    const after = embedNodes();
    expect(after[0]?.attrs.raw).toBe('![[a b.png|400]]');
    // The embeds elsewhere are the same objects.
    expect(after[1]).toBe(before[1]);
    expect(after[2]).toBe(before[2]);
    expect(after[3]).toBe(before[3]);
  });

  it('a second identical incremental apply changes nothing', () => {
    applyFull(editor, DOC);
    const next = DOC.replace('Second paragraph.', 'Second again.');
    applyIncremental(editor, DOC, next);
    const spy = vi.spyOn(view(), 'dispatch');
    expect(applyIncremental(editor, next, next)).toBe(true);
    applyFull(editor, next);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('keepSourceStyle with embeds', () => {
  const OLD = [
    '* item one',
    '',
    'Photo ![[a b.png|300]] here',
    '',
    '_emphasis_ para ![[x.pdf#page=2]]',
    '',
    '| n | pic |',
    '| - | --- |',
    '| 1 | ![[one.png\\|200]] |',
    '',
  ].join('\n');

  const parse = (md: string): Node => editor.action((ctx) => ctx.get(parserCtx)(md));
  const serialize = (doc: Node): string => editor.action((ctx) => ctx.get(serializerCtx)(doc));

  it('keeps the old text of unchanged blocks and accepts the merge for an edited embed paragraph', () => {
    applyFull(editor, OLD);
    const v = view();
    // The user types in the paragraph with the first embed: "Photo" -> "Pics".
    let pos = -1;
    v.state.doc.descendants((node, at) => {
      if (pos < 0 && node.isText && node.text?.startsWith('Photo')) pos = at;
    });
    expect(pos).toBeGreaterThan(0);
    v.dispatch(v.state.tr.replaceWith(pos, pos + 5, v.state.schema.text('Pics')));
    const serialized = serialize(v.state.doc);
    // The serializer rewrites the other blocks in its own style.
    expect(serialized).toContain('| n | pic               |');
    expect(serialized).toContain('![[one.png\\|200]]');
    const merged = editor.action((ctx) => keepSourceStyle(ctx, OLD, serialized));
    expect(merged).toBe(OLD.replace('Photo', 'Pics'));
  });

  it('returns an unedited document exactly as it was', () => {
    const doc = parse(OLD);
    const merged = editor.action((ctx) => keepSourceStyle(ctx, OLD, serialize(doc)));
    expect(merged).toBe(OLD);
  });
});
