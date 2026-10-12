import {
  defaultValueCtx,
  Editor,
  editorViewCtx,
  prosePluginsCtx,
  remarkPluginsCtx,
  rootCtx,
  serializerCtx,
} from '@milkdown/kit/core';
import { commonmark } from '@milkdown/kit/preset/commonmark';
import { gfm } from '@milkdown/kit/preset/gfm';
import { search } from 'prosemirror-search';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { editors } from '../editor/editorRegistry';
import { embeds, remarkEmbeds } from '../editor/embedNode';
import { engineFor, type FindOptions } from './findEngine';

const options = (search: string, extra: Partial<FindOptions> = {}): FindOptions => ({
  search,
  replace: '',
  caseSensitive: false,
  regexp: false,
  wholeWord: false,
  ...extra,
});

let editor: Editor;

const open = async (md: string) => {
  const root = document.createElement('div');
  document.body.append(root);
  editor = await Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, root);
      ctx.set(defaultValueCtx, md);
      ctx.update(prosePluginsCtx, (plugins) => [...plugins, search()]);
      ctx.update(remarkPluginsCtx, (plugins) => [...plugins, remarkEmbeds]);
    })
    .use(commonmark)
    .use(gfm)
    .use(embeds)
    .create();
  editors.visual = editor.action((ctx) => ctx.get(editorViewCtx));
  const engine = engineFor('visual');
  if (!engine) throw new Error('no visual engine');
  return engine;
};

const markdown = (): string =>
  editor.action((ctx) => ctx.get(serializerCtx)(ctx.get(editorViewCtx).state.doc));

const selection = () => {
  const { from, to } = editors.visual?.state.selection ?? { from: -1, to: -1 };
  return [from, to];
};

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
afterEach(async () => {
  editors.visual = null;
  await editor.destroy();
  document.body.replaceChildren();
});

const DOC = 'hello ![[pic.png]] and [[Other note]] end\n';

describe('find in the visual pane', () => {
  it('counts a match inside an embed or a wikilink', async () => {
    const engine = await open(DOC);
    expect(engine.apply(options('pic.png')).total).toBe(1);
    expect(engine.apply(options('Other note')).total).toBe(1);
    expect(engine.apply(options('[[')).total).toBe(2);
    expect(engine.apply(options('PIC.PNG')).total).toBe(1);
    expect(engine.apply(options('PIC.PNG', { caseSensitive: true })).total).toBe(0);
    expect(engine.apply(options('hello')).total).toBe(1);
  });

  it('counts text and tokens together, in document order', async () => {
    const engine = await open('pic.png first ![[pic.png]] then pic.png\n');
    expect(engine.apply(options('pic.png')).total).toBe(3);
    engine.next();
    expect(selection()).toEqual([1, 8]);
    engine.next();
    expect(selection()).toEqual([15, 16]);
    expect(engine.info().current).toBe(2);
    engine.next();
    expect(engine.info().current).toBe(3);
    engine.prev();
    expect(selection()).toEqual([15, 16]);
  });

  it('selects the token as one chip', async () => {
    const engine = await open(DOC);
    engine.apply(options('pic.png'));
    engine.next();
    expect(selection()).toEqual([7, 8]);
    expect(engine.info()).toEqual({ total: 1, current: 1, valid: true });
  });

  it('replaces inside a token everywhere, and keeps it a token', async () => {
    const engine = await open(DOC);
    engine.apply(options('pic.png', { replace: 'new.png' }));
    engine.replaceAll();
    expect(markdown()).toBe('hello ![[new.png]] and [[Other note]] end\n');
    expect(editors.visual?.state.doc.firstChild?.child(1).type.name).toBe('embed');
  });

  it('replaces one match at a time, including a token', async () => {
    const engine = await open(DOC);
    engine.apply(options('o', { replace: '0' }));
    // The first call selects "hello"'s o, the second replaces it and moves on
    // to the wikilink, the third replaces that.
    engine.replace();
    engine.replace();
    expect(markdown()).toBe('hell0 ![[pic.png]] and [[Other note]] end\n');
    engine.replace();
    expect(markdown()).toBe('hell0 ![[pic.png]] and [[0ther n0te]] end\n');
  });

  it('rewrites a token with a regular expression group', async () => {
    const engine = await open(DOC);
    engine.apply(options('pic\\.(png)', { regexp: true, replace: 'big.$1' }));
    engine.replaceAll();
    expect(markdown()).toBe('hello ![[big.png]] and [[Other note]] end\n');
  });

  it('leaves a token alone when the replacement would break it', async () => {
    const engine = await open(DOC);
    engine.apply(options('Other note', { replace: 'a]]b' }));
    engine.replaceAll();
    expect(markdown()).toBe(DOC);
  });

  it('still replaces text next to a token', async () => {
    const engine = await open(DOC);
    engine.apply(options('hello', { replace: 'bye' }));
    engine.replaceAll();
    expect(markdown()).toBe('bye ![[pic.png]] and [[Other note]] end\n');
  });

  it('matches nothing in tokens for an empty or invalid query', async () => {
    const engine = await open(DOC);
    expect(engine.apply(options('')).total).toBe(0);
    expect(engine.apply(options('(', { regexp: true })).valid).toBe(false);
  });
});
