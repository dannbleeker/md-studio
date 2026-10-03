import { Editor, parserCtx, remarkPluginsCtx, rootCtx, serializerCtx } from '@milkdown/kit/core';
import { commonmark } from '@milkdown/kit/preset/commonmark';
import { gfm } from '@milkdown/kit/preset/gfm';
import type { Node } from '@milkdown/kit/prose/model';
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
