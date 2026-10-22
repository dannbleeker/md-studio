import { Editor, parserCtx, remarkPluginsCtx, rootCtx, serializerCtx } from '@milkdown/kit/core';
import { history } from '@milkdown/kit/plugin/history';
import { commonmark } from '@milkdown/kit/preset/commonmark';
import { gfm } from '@milkdown/kit/preset/gfm';
import type { Node } from '@milkdown/kit/prose/model';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { configureEmbedStringify, embeds, remarkEmbeds } from './embedNode';
import { frontMatter, remarkFrontMatter } from './frontMatter';
import { imageTitleFix } from './imageTitleFix';
import { keepSourceStyle } from './keepSourceStyle';
import { parseWithMath, remarkMath } from './mathNode';

let editor: Editor;

beforeEach(async () => {
  const root = document.createElement('div');
  document.body.append(root);
  // The same plugin order as the visual pane.
  editor = await Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, root);
      ctx.update(remarkPluginsCtx, (plugins) => [
        ...plugins,
        remarkFrontMatter,
        imageTitleFix,
        remarkEmbeds,
        remarkMath,
      ]);
      configureEmbedStringify(ctx);
    })
    .use(commonmark)
    .use(gfm)
    .use(frontMatter)
    .use(embeds)
    .use(history)
    .create();
});

afterEach(async () => {
  await editor.destroy();
  document.body.replaceChildren();
});

const parse = (md: string): Node =>
  editor.action((ctx) => parseWithMath(ctx.get(parserCtx))(md) as Node);
const plainParse = (md: string): Node => editor.action((ctx) => ctx.get(parserCtx)(md));
const serialize = (doc: Node): string => editor.action((ctx) => ctx.get(serializerCtx)(doc));
const roundTrip = (md: string): string => serialize(parse(md)).trim();

const raws = (doc: Node): string[] => {
  const out: string[] = [];
  doc.descendants((node) => {
    if (node.type.name === 'embed') out.push(String(node.attrs.raw));
  });
  return out;
};

describe('math in the visual pane', () => {
  it('makes one atom per formula, holding its source exactly', () => {
    const md = [
      'Inline $a*b*c$ and $x_1 + y_2$ and $\\{a\\}$ and $a \\\\ b$.',
      '',
      '$$',
      '\\int_0^1 f(x)\\,dx',
      '',
      '= 1',
      '$$',
    ].join('\n');
    expect(raws(parse(md))).toEqual([
      '$a*b*c$',
      '$x_1 + y_2$',
      '$\\{a\\}$',
      '$a \\\\ b$',
      '$$\n\\int_0^1 f(x)\\,dx\n\n= 1\n$$',
    ]);
  });

  it('writes every formula back byte for byte', () => {
    for (const md of [
      'Let $a*b*c$ hold.',
      'Both $x_1$ and $y_2$, then **bold $z^2$** and _emphasis $w$_.',
      '* item with $\\alpha$\n* another',
      '> quote with $q$',
      '# Heading with $h$',
      '$$\n\\sum_{i=1}^n i\n$$',
      'Display inline $$a \\\\ b$$ here.',
    ]) {
      expect(roundTrip(md), md).toBe(md);
    }
  });

  it('keeps math out of code, links and prices', () => {
    expect(raws(parse('`$a$` and\n\n```\n$b$\n```'))).toEqual([]);
    expect(raws(parse('It costs $5 and $10.'))).toEqual([]);
    expect(roundTrip('It costs $5 and $10.')).toBe('It costs $5 and $10.');
    // In link text a formula stays text, and still round-trips.
    expect(raws(parse('[see $a$ here](https://example.com)'))).toEqual([]);
    expect(roundTrip('[see $a$ here](https://example.com)')).toBe(
      '[see $a$ here](https://example.com)'
    );
  });

  it('works in a table cell', () => {
    const md = '| a | b |\n| - | - |\n| $x_1$ | y |';
    expect(raws(parse(md))).toEqual(['$x_1$']);
  });

  it('is a no-op for a document without math: the same nodes as the plain parser', () => {
    const md = '# Title\n\nSome *text* with `code`, a [link](a.md) and $5.\n\n- one\n- two\n';
    expect(parse(md).toJSON()).toEqual(plainParse(md).toJSON());
    expect(raws(parse(md))).toEqual([]);
  });

  it('keeps the source style of untouched blocks around math', () => {
    const old = 'Intro   text\n\n$$\nx_1\n$$\n\nLast  one';
    const edited = serialize(parse(old)).trim();
    const kept = editor.action((ctx) => keepSourceStyle(ctx, old, edited));
    expect(kept).toBe(old);
  });
});
