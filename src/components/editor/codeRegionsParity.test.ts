import { markdown } from '@codemirror/lang-markdown';
import { Editor, remarkCtx, remarkPluginsCtx, rootCtx } from '@milkdown/kit/core';
import { commonmark } from '@milkdown/kit/preset/commonmark';
import { gfm } from '@milkdown/kit/preset/gfm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { codeRanges, inCode } from '@/domain/codeRegions';
import { findMarkdownImages } from '@/domain/embedLinks';
import { findWikiRefs } from '@/domain/embeds';
import { remarkFrontMatter } from './frontMatter';

/*
 * Differential check: every generated document is parsed by the remark pipeline
 * of the visual pane, and the scanner must call each marker code exactly when
 * the parser puts it inside a `code` or `inlineCode` node. The wrappers are the
 * block shapes where code sits in a container, behind a heading, wrapped over
 * a line break, or opened on a bullet line, plus tabs and lazy lines.
 */
const MARK = '@';
const WRAPPERS: string[] = [
  '@',
  'text @ more',
  '*@*',
  '# @',
  '## @ ##',
  '@\n===',
  '@\n---',
  '***',
  '---',
  '```\n@\n```',
  '````\n@\n```\nx\n````',
  '~~~\n@\n~~~',
  '```js\n@\n```',
  '```\n@',
  '~~~\n@',
  '```@',
  '  ```\n  @\n  ```',
  ' ```\n@\n ```',
  '```\na\n```\n@',
  '```\n@\n``` x\n```',
  '```npm i```\n@',
  '> ```\n> @\n> ```',
  '> ```\n> @',
  '> ```\n> a\n> ```\n> @',
  '    @',
  '\t@',
  'para\n    @',
  'para\n\n    @',
  'para\n\t@',
  '# H\n    @',
  '***\n    @',
  '`@`',
  '``@``',
  '`` a ` @ ``',
  '`a\n@`',
  '``\n@\n``',
  'para `a\n@` tail',
  '`a\n\n@`',
  '`a\n# @`',
  '\\`@`',
  '\\``@``',
  '`a\\` @',
  '`a` `@`',
  '`` `a` ``\n@',
  '```` ``` ````@',
  '    ```\n@\n    ```',
  'para\n    ```\n@\n    ```',
  '> @',
  '> a\n> @',
  '>     @',
  '> a\n@',
  '>> @',
  '> `a\n> @`',
  '> a\n\n@',
  '- @',
  '1. @',
  '- a\n  - b\n    @',
  '- ```\n  a\n  ```',
  '- ```\n  a\n  ```\n  @',
  '- ```\n  a\n  ```\n@',
  '1. ```\n   a\n   ```\n@',
  '- ```\n  @\n  ```',
  '- ```\n  @',
  '- a\n    ```\n    @\n    ```',
  '1. a\n\n    ```\n    @\n    ```',
  '1. a\n   ```\n   a\n   ```\n   @',
  '- a\n\n      @',
  '-     @',
  '-\n  @',
  '-\n\n  @',
  '- a\n\n  ```\n  @\n  ```',
  '- a\n\n  para `x\n  @`',
  '- a\n  ```\n  @\n  ```\n- b',
  '- a\n- b\n\n    @',
  '* a\n+ b\n- ```\n  @',
  '10. a\n    ```\n    @\n    ```',
  '2. @',
  'para\n2. @',
  'para\n1. @',
  'para\n-\n@',
  'para\n- @',
  'para\n- ```\n  @\n  ```',
  '- > ```\n  > @\n  > ```',
  '> - ```\n>   @\n>   ```',
  '> - a\n>   ```\n>   @\n>   ```',
  '- a\n  > ```\n  > @',
  '- a\n\n  > b\n\n  ```\n  @\n  ```',
  '| a |\n| - |\n| @ |',
  '| a | b |\n| - | - |\n| `x | @` |',
  '| a | b |\n| - | - |\n| `x \\| @` | z |',
  '| a |\n| - |\n| `x |\n| y` @',
  '| a |\n| - |\n| b |\n    @',
  '| a |\n| - |\n| b |\n```\n@\n```',
  '| a |\n| - |\n| b |\n> @',
  'p\n| a |\n| - |\n| `x@`',
  '<div>\n@\n</div>',
  '<div>\n```\n@\n```',
  '<div>\n</div>\n```\n@\n```',
  '<div>\n</div>\n\n```\n@\n```',
  '<!--\n```\n@\n-->',
  '<pre>\n```\n@\n</pre>',
  '<span>@</span>',
  '<span>\n```\n@\n```',
  'para\n<span>\n@',
  '<a href="`">@`',
  '<http://a`b> @`',
  '<!-- ` --> `@`',
  '[^a]: x\n    @',
  '[^a]: x\n\n    ```\n    @\n    ```',
  '[^a]:\n    ```\n    @\n    ```',
  '[^a]: x\n    ```\n    @',
  '[^a]: x\n\n    para `y\n    @`',
  '[a](u) `@`',
  '[a `x](y) @',
  '![a `x`](y.png) @',
  '-\t@',
  '-\t```\n\t@\n\t```',
  '- a\n\t```\n\t@\n\t```',
  '>\t@',
  '>\t\t@',
  '> ```\n>\t@',
  '\t- a\n\t\t@',
  '  - a\n\n      @',
  '   - a\n\n       @',
  '    - a\n    @',
  '    - a\n\n        @',
  '---\n@',
  '- a\n---\n    @',
  '- a\n\n---\n@',
  'a  \n`b\n@`',
];

const SEPARATORS = ['\n', '\n\n'];

interface Node {
  type: string;
  children?: Node[];
  position?: { start: { offset: number }; end: { offset: number } };
}

let editor: Editor;
let root: HTMLElement;

beforeAll(async () => {
  root = document.createElement('div');
  document.body.append(root);
  editor = await Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, root);
      ctx.update(remarkPluginsCtx, (plugins) => [...plugins, remarkFrontMatter]);
    })
    .use(commonmark)
    .use(gfm)
    .create();
});

afterAll(async () => {
  await editor.destroy();
  document.body.replaceChildren();
});

function parserCode(text: string): [number, number][] {
  const tree = editor.action((ctx) => ctx.get(remarkCtx).parse(text)) as Node;
  const found: [number, number][] = [];
  const walk = (node: Node) => {
    if ((node.type === 'code' || node.type === 'inlineCode') && node.position) {
      found.push([node.position.start.offset, node.position.end.offset]);
    }
    node.children?.forEach(walk);
  };
  walk(tree);
  return found;
}

const cmParser = markdown().language.parser;
const CODE_NODES = new Set(['FencedCode', 'CodeBlock', 'InlineCode']);

function editorCode(text: string): [number, number][] {
  const found: [number, number][] = [];
  cmParser.parse(text).iterate({
    enter: (node) => {
      if (CODE_NODES.has(node.name)) found.push([node.from, node.to]);
    },
  });
  return found;
}

const within = (spans: [number, number][], pos: number) =>
  spans.some(([from, to]) => pos >= from && pos < to);

function tokenSite(text: string, n: number): number {
  return text.indexOf(`![[t${n}.png]]`);
}

interface Case {
  text: string;
  tokens: number;
  /** From the random line mix, where the CodeMirror parser is not compared. */
  mixed?: boolean;
  /** Where the visual pane parse has code. */
  truth: [number, number][];
}

type Wrap = (block: string) => string;

/** Prefixes the first line and then every further line, blank lines included as they are. */
const prefixed =
  (first: string, rest: string): Wrap =>
  (block) =>
    block
      .split('\n')
      .map((line, i) =>
        line === '' ? (i === 0 ? first.trimEnd() : '') : (i === 0 ? first : rest) + line
      )
      .join('\n');

const quoted: Wrap = (block) =>
  block
    .split('\n')
    .map((line) => (line === '' ? '>' : `> ${line}`))
    .join('\n');

const NESTINGS: Wrap[] = [
  (block) => block,
  quoted,
  prefixed('> ', ''),
  prefixed('- ', '  '),
  prefixed('1. ', '   '),
  prefixed('-   ', '    '),
  prefixed('* ', '  '),
  prefixed('-\t', '\t'),
  prefixed('  ', '  '),
  prefixed('   ', '   '),
  prefixed('[^a]: ', '    '),
  (block) => quoted(prefixed('- ', '  ')(block)),
  (block) => prefixed('- ', '  ')(quoted(block)),
  (block) => quoted(quoted(block)),
  (block) => prefixed('- ', '  ')(prefixed('1. ', '   ')(block)),
  (block) => `intro\n\n${prefixed('- ', '  ')(block)}`,
  (block) => `# head\n${prefixed('1. ', '   ')(block)}`,
  (block) => `- a\n${prefixed('  - ', '    ')(block)}`,
];

/** A small deterministic generator, so a failing document can be rebuilt. */
function lcg(seed: number): () => number {
  let state = seed;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

const one = (a: string) => a.replaceAll(MARK, '![[t1.png]]');
const two = (b: string) => b.replaceAll(MARK, '![[t2.png]]');

/** Documents of one or two wrappers, the first marker `t1` and the second `t2`. */
function corpus(): Omit<Case, 'truth'>[] {
  const docs: Omit<Case, 'truth'>[] = [];
  for (const a of WRAPPERS) {
    docs.push({ text: one(a), tokens: 1 });
    for (const b of WRAPPERS) {
      for (const sep of SEPARATORS) docs.push({ text: `${one(a)}${sep}${two(b)}`, tokens: 2 });
    }
  }
  // The same shapes inside one level or two of containers, with and without a second block.
  const pick = lcg(7);
  const at = <T>(list: readonly T[]): T => list[Math.floor(pick() * list.length)] as T;
  for (const a of WRAPPERS) {
    for (const nest of NESTINGS) docs.push({ text: nest(one(a)), tokens: 1 });
  }
  for (let i = 0; i < 2500; i++) {
    const first = at(NESTINGS)(one(at(WRAPPERS)));
    const second = at(NESTINGS)(two(at(WRAPPERS)));
    docs.push({ text: `${first}${at(SEPARATORS)}${second}`, tokens: 2 });
  }
  docs.push(...mixedCorpus(4000, 11, '\n'), ...mixedCorpus(1200, 12, '\r\n'));
  // A leading `---` line opens front matter, which the scanner skips by offset
  // (and which stops the parser reading blocks at all when it never closes).
  return docs.filter((d) => !/^---[ \t]*(?:\r?\n|$)/.test(d.text));
}

/**
 * Lines drawn at random: fence markers, list and quote markers at several
 * indents, tabs, text with stray backticks, headings, tables, HTML, footnotes
 * and lines carrying a marker `T`. Empty list items and numbers other than 1 are
 * left to the shaped wrappers: micromark refuses them as an interruption after
 * any paragraph or indented code, even across a blank line or a quote marker,
 * where CommonMark takes them, and the scanner follows the spec there.
 */
const LINE_POOL = [
  '',
  '',
  '',
  '```',
  '~~~',
  '````',
  '```js',
  '``` x`',
  '  ```',
  '    ```',
  '\t```',
  '- ```',
  '1. ```',
  '> ```',
  '>',
  '>> ',
  '- > ',
  '> - a',
  '1. a',
  '- a',
  '* a',
  '+ a',
  '1. - a',
  '-\ta',
  '  a',
  '    a',
  '\ta',
  '      a',
  '> a',
  '>     a',
  '>\ta',
  '  - a',
  '   - a',
  '    - a',
  'a',
  'text `a',
  'b` text',
  '`',
  '``',
  '\\`',
  '`x`',
  '``x`y``',
  '# h',
  '## h `',
  '    # h',
  '---',
  '***',
  '___',
  '===',
  '--',
  '- - -',
  '<div>',
  '</div>',
  '<!--',
  '-->',
  '<pre>',
  '</pre>',
  '<span>',
  '<a href="`">',
  '<http://a`b>',
  '| a | b |',
  '| - | - |',
  '|-|-|',
  '| `x | y` |',
  '| x \\| `y |',
  'a | b',
  '-|-',
  '[^a]: x',
  '[^a]:',
  '    [^b]: y',
  '[a]: /u',
  '![[T.png]]',
  'x ![[T.png]]',
  '> ![[T.png]]',
  '- ![[T.png]]',
  '    ![[T.png]]',
  '  ![[T.png]]',
  '`![[T.png]]`',
  '| ![[T.png]] |',
  '1. ![[T.png]]',
  '# ![[T.png]]',
  '\t![[T.png]]',
  '> - ![[T.png]]',
  '   ![[T.png]]',
];

function mixedCorpus(count: number, seed: number, eol: string): Omit<Case, 'truth'>[] {
  const pick = lcg(seed);
  const docs: Omit<Case, 'truth'>[] = [];
  while (docs.length < count) {
    const lines: string[] = [];
    const size = 2 + Math.floor(pick() * 7);
    for (let i = 0; i < size; i++)
      lines.push(LINE_POOL[Math.floor(pick() * LINE_POOL.length)] ?? '');
    let tokens = 0;
    const text = lines.map((l) => l.replace('T', () => `t${++tokens}`)).join(eol);
    if (/^---[ \t]*(?:\r?\n|$)/.test(text) || tokens === 0) continue;
    docs.push({ text, tokens, mixed: true });
  }
  return docs;
}

describe('code regions against the parsers', () => {
  let cases: Case[] = [];
  beforeAll(() => {
    cases = corpus().map((d) => ({ ...d, truth: parserCode(d.text) }));
  }, 300_000);

  it('covers the wrapper shapes', () => {
    expect(WRAPPERS.length).toBeGreaterThanOrEqual(35);
    expect(cases.length).toBeGreaterThan(40_000);
  });

  it('agrees with the visual pane parse on every marker', () => {
    const wrong: string[] = [];
    let inside = 0;
    let outside = 0;
    for (const { text, tokens, truth } of cases) {
      const ranges = codeRanges(text);
      const found = new Set(findWikiRefs(text).map((r) => r.raw));
      for (let n = 1; n <= tokens; n++) {
        const site = tokenSite(text, n);
        if (site < 0) continue;
        const expected = within(truth, site);
        if (expected) inside++;
        else outside++;
        if (inCode(ranges, site) !== expected) wrong.push(`range ${n} ${JSON.stringify(text)}`);
        if (found.has(`![[t${n}.png]]`) === expected)
          wrong.push(`scan ${n} ${JSON.stringify(text)}`);
      }
    }
    expect(wrong.slice(0, 20)).toEqual([]);
    // Both outcomes are common, so agreement is not a matter of everything being one kind.
    expect(Math.min(inside, outside)).toBeGreaterThan(10_000);
  });

  it('makes the same decision for Markdown images', () => {
    // `![](tN.png)` is as long as `![[tN.png]]`, so the parse offsets carry over.
    const wrong: string[] = [];
    for (const { text, tokens, truth } of cases) {
      const image = text.replaceAll(/!\[\[t(\d).png\]\]/g, '![](t$1.png)');
      const found = new Set(findMarkdownImages(image).map((r) => r.dest));
      for (let n = 1; n <= tokens; n++) {
        const site = image.indexOf(`![](t${n}.png)`);
        if (site < 0) continue;
        if (found.has(`t${n}.png`) === within(truth, site))
          wrong.push(`${n} ${JSON.stringify(image)}`);
      }
    }
    expect(wrong.slice(0, 20)).toEqual([]);
  });

  it('agrees with the CodeMirror syntax tree outside what that parser lacks', () => {
    // markdown() here is plain CommonMark: it has no tables or footnotes, and it
    // differs from the spec (and from the visual pane parse) on three more shapes.
    const gaps = [
      /\| a|\[\^a\]/, // GFM tables and footnote definitions
      /\\``/, // an escaped first backtick of a longer run
      /(?:^|\n) *[-*+]\n\n/, // an empty list item followed by a blank line
      />\t/, // a tab straight after a quote marker
      /(?:[>*+-]|\d\.) +<(?:div|!--|pre)/, // an HTML block that starts inside a container
    ];
    const wrong: string[] = [];
    let compared = 0;
    for (const { text, tokens, truth, mixed } of cases) {
      if (mixed || gaps.some((gap) => gap.test(text))) continue;
      const cm = editorCode(text);
      const ranges = codeRanges(text);
      for (let n = 1; n <= tokens; n++) {
        const site = tokenSite(text, n);
        if (site < 0) continue;
        compared++;
        if (within(cm, site) !== inCode(ranges, site)) wrong.push(JSON.stringify(text));
        expect(within(truth, site)).toBe(inCode(ranges, site));
      }
    }
    expect(compared).toBeGreaterThan(25_000);
    expect(wrong.slice(0, 20)).toEqual([]);
  });
});
