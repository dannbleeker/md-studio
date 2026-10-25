import {
  Editor,
  parserCtx,
  remarkPluginsCtx,
  rootCtx,
  schemaCtx,
  serializerCtx,
} from '@milkdown/kit/core';
import { commonmark } from '@milkdown/kit/preset/commonmark';
import { gfm } from '@milkdown/kit/preset/gfm';
import type { Node } from '@milkdown/kit/prose/model';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { configureEmbedStringify, embeds, remarkEmbeds } from './embedNode';
import { frontMatter, remarkFrontMatter } from './frontMatter';
import { imageTitleFix } from './imageTitleFix';

// Milkdown's SerializerState rebuilt a paragraph's child list with `concat` per child, which
// is quadratic. patches/@milkdown__transformer.patch appends into one array instead, and the
// text handler of `configureEmbedStringify` finds a node's position with a map instead of a
// search per text node. These tests fail if either goes (for example by a Milkdown upgrade that
// leaves the patch unapplied). They compare the time at n and 2n and never an absolute figure:
// a linear serializer takes about twice as long for twice the input, a quadratic one about four
// times. The documents are built from the schema, not parsed, so only the serializer is timed.

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
      ]);
      configureEmbedStringify(ctx);
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

const parse = (md: string): Node => editor.action((ctx) => ctx.get(parserCtx)(md));
const serialize = (doc: Node): string => editor.action((ctx) => ctx.get(serializerCtx)(doc));

type Kind = 'chip' | 'emphasis';

/** One paragraph of `n` units: `[[x]] ` chips, or `a *b* ` with a marked word. */
const paragraphOf = (kind: Kind, n: number): Node =>
  editor.action((ctx) => {
    const schema = ctx.get(schemaCtx);
    const children: Node[] = [];
    for (let i = 0; i < n; i++) {
      if (kind === 'chip') {
        children.push(schema.node('embed', { raw: '[[x]]' }), schema.text(' '));
      } else {
        children.push(
          schema.text('a '),
          schema.text('b', [schema.mark('emphasis')]),
          schema.text(' ')
        );
      }
    }
    return schema.node('doc', null, schema.node('paragraph', null, children));
  });

/**
 * CPU time of this process, not the wall clock: on a busy machine (CI runs the test files in
 * parallel) waiting for a processor inflates one run and not another, and the ratio with it.
 */
const timeOf = (fn: () => void): number => {
  const before = process.cpuUsage();
  fn();
  const used = process.cpuUsage(before);
  return (used.user + used.system) / 1000;
};

// Large enough that a quadratic merge dominates the fixed per-node cost: without the patch
// twice the input took about 5 (chips) and 4 (marks) times as long, with it about 2.
const N = 6000;
// Linear is about 2 and quadratic about 4; 3 leaves room for noise on either side.
const LIMIT = 3;
// Without the patch the large input takes seconds per run, which must fail the ratio, not time out.
const TIMEOUT = 60_000;
const RUNS = 5;
// A ratio of timings is a time ceiling: under coverage instrumentation and parallel test files
// it crossed 3 on CI (3.3) with the patch applied, so it runs with the stress tests, one file
// at a time.
const SCALING = { tags: ['stress'], timeout: TIMEOUT };

/** Serializing time for 2N units over the time for N units. */
const growth = (kind: Kind): number => {
  const small = paragraphOf(kind, N);
  const large = paragraphOf(kind, 2 * N);
  // Warm up, so the first run's compilation is not counted against the small input.
  serialize(small);
  // The runs alternate, so a slow stretch lands on both sizes; each takes its best run.
  let smallest = Number.POSITIVE_INFINITY;
  let largest = Number.POSITIVE_INFINITY;
  for (let i = 0; i < RUNS; i++) {
    const forSmall = timeOf(() => serialize(small));
    const forLarge = timeOf(() => serialize(large));
    smallest = Math.min(smallest, forSmall);
    largest = Math.min(largest, forLarge);
  }
  return largest / smallest;
};

describe('serializing a long paragraph stays linear', () => {
  it('takes about twice as long for twice as many wikilink chips', SCALING, () => {
    expect(growth('chip')).toBeLessThan(LIMIT);
  });

  it('takes about twice as long for twice as many emphasis marks', SCALING, () => {
    expect(growth('emphasis')).toBeLessThan(LIMIT);
  });

  it('writes a long paragraph of either kind back unchanged', () => {
    for (const unit of ['[[x]] ', 'a *b* ']) {
      const md = `${unit.repeat(300).trimEnd()}\n`;
      expect(serialize(parse(md))).toBe(md);
    }
  });
});
