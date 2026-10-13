import {
  type CmdKey,
  commandsCtx,
  Editor,
  editorViewCtx,
  parserCtx,
  remarkPluginsCtx,
  rootCtx,
  schemaCtx,
  serializerCtx,
} from '@milkdown/kit/core';
import { history } from '@milkdown/kit/plugin/history';
import {
  commonmark,
  createCodeBlockCommand,
  toggleEmphasisCommand,
  toggleInlineCodeCommand,
  toggleLinkCommand,
  toggleStrongCommand,
  turnIntoTextCommand,
} from '@milkdown/kit/preset/commonmark';
import { gfm } from '@milkdown/kit/preset/gfm';
import { joinBackward, joinForward } from '@milkdown/kit/prose/commands';
import { undo } from '@milkdown/kit/prose/history';
import { type Node, DOMParser as ProseDOMParser } from '@milkdown/kit/prose/model';
import { NodeSelection, TextSelection } from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { findWikiRefs } from '@/domain/embeds';
import { OBSIDIAN_SAMPLE } from '../../../test/fixtures/obsidianNote';
import { configureEmbedStringify, embeds, remarkEmbeds } from './embedNode';
import { frontMatter, remarkFrontMatter } from './frontMatter';
import { imageTitleFix } from './imageTitleFix';
import { keepSourceStyle } from './keepSourceStyle';

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
    .use(history)
    .create();
});

afterEach(async () => {
  await editor.destroy();
  document.body.replaceChildren();
});

const parse = (md: string): Node => editor.action((ctx) => ctx.get(parserCtx)(md));
const serialize = (doc: Node): string => editor.action((ctx) => ctx.get(serializerCtx)(doc));

/** Every embed node's raw attribute, in document order. */
const raws = (doc: Node): string[] => {
  const out: string[] = [];
  doc.descendants((node) => {
    if (node.type.name === 'embed') out.push(String(node.attrs.raw));
  });
  return out;
};

/** All text node content, to prove container syntax never enters the document. */
const texts = (doc: Node): string[] => {
  const out: string[] = [];
  doc.descendants((node) => {
    if (node.isText) out.push(node.text ?? '');
  });
  return out;
};

describe('embed parse', () => {
  it('reads every token of the sample as an embed node', () => {
    expect(raws(parse(OBSIDIAN_SAMPLE))).toEqual([
      '![[a b.png|300]]',
      '![[x.pdf#page=2&height=300]]',
      '![[Note#^blk]]',
      '![[one.png\\|200]]',
      '![[two.png\\|alt\\|100x50]]',
      '[[Plain|alias]]',
      '![[quoted.png]]',
      '![[Note v1.2]]',
    ]);
  });

  it('keeps tokens in fences, code spans and front matter as plain text', () => {
    const doc = parse(OBSIDIAN_SAMPLE);
    const all = texts(doc).join('\n');
    expect(all).toContain('![[fenced.png]]');
    expect(all).toContain('![[not.png]]');
    expect(all).toContain('![[in-front-matter.png]]');
    expect(raws(doc)).not.toContain('![[fenced.png]]');
    expect(raws(doc)).not.toContain('![[not.png]]');
  });

  it('is a leaf atom that carries the raw text and nothing else', () => {
    const doc = parse('a ![[x.png]] b');
    const embed = doc.child(0).child(1);
    expect(embed.type.name).toBe('embed');
    expect(embed.isAtom).toBe(true);
    expect(embed.attrs).toEqual({ raw: '![[x.png]]' });
    expect(embed.childCount).toBe(0);
  });

  it('does not convert escaped tokens, empty tokens or a token in a link label', () => {
    expect(raws(parse('\\![[a.png]] and \\[[b]]'))).toEqual([]);
    expect(raws(parse('empty ![[]] token'))).toEqual([]);
    expect(raws(parse('[see ![[a.png]]](https://example.com)'))).toEqual([]);
  });

  it('leaves a text node with both an escaped and a real token untouched', () => {
    const md = '\\[[escaped]] and [[real]]\n';
    const doc = parse(md);
    expect(raws(doc)).toEqual([]);
    // Unedited, the source is kept by the block-preserving merge; the
    // text is the only thing that could have been lost, and it is not.
    expect(texts(doc).join('')).toBe('[[escaped]] and [[real]]');
  });

  it('converts a token inside emphasis, strong and strikethrough', () => {
    expect(raws(parse('*a ![[x.png]]* **[[b]]** ~~![[c.png]]~~'))).toEqual([
      '![[x.png]]',
      '[[b]]',
      '![[c.png]]',
    ]);
  });
});

describe('embed round trip', () => {
  it('writes every token of the sample back unchanged', () => {
    const out = serialize(parse(OBSIDIAN_SAMPLE));
    for (const token of raws(parse(OBSIDIAN_SAMPLE))) expect(out).toContain(token);
  });

  it('serializes a paragraph with an embed without escaping it', () => {
    const out = serialize(parse('Photo: ![[a b.png|300]] and [[Plain|alias]].\n'));
    expect(out).toBe('Photo: ![[a b.png|300]] and [[Plain|alias]].\n');
  });

  it('keeps the token unescaped when a word beside it is edited', () => {
    const view = editor.action((ctx) => ctx.get(editorViewCtx));
    const doc = parse('Photo: ![[a b.png|300]] here.\n');
    view.dispatch(view.state.tr.replaceWith(0, view.state.doc.content.size, doc.content));
    // "Photo" -> "Pics": replace inside the first text node.
    view.dispatch(view.state.tr.replaceWith(1, 6, view.state.schema.text('Pics')));
    expect(serialize(view.state.doc)).toBe('Pics: ![[a b.png|300]] here.\n');
  });

  it('round-trips a table cell embed written with an escaped pipe', () => {
    const md = '| Name | Picture |\n| --- | --- |\n| one | ![[one.png\\|200]] |\n';
    const out = serialize(parse(md));
    expect(out).toContain('![[one.png\\|200]]');
    // The table still has exactly two cells in the row.
    const row = out.split('\n').find((l) => l.includes('one.png')) ?? '';
    expect(row.replace(/\\\|/g, '').split('|').length).toBe(4);
  });

  it('keeps [[Plain|alias]] as written', () => {
    expect(serialize(parse('See [[Plain|alias]] and [[Note#H]].\n'))).toBe(
      'See [[Plain|alias]] and [[Note#H]].\n'
    );
  });

  it('serializes an edited embed paragraph in the merged source style', () => {
    const old = 'Intro\n\nPhoto: ![[a b.png|300]] here.\n\nEnd\n';
    const next = 'Intro changed\n\nPhoto: ![[a b.png|300]] here.\n\nEnd\n';
    const merged = editor.action((ctx) => keepSourceStyle(ctx, old, next));
    expect(merged).toBe(next);
  });
});

describe('container prefixes stay out of the text', () => {
  it('keeps blockquote markers and the continuation line out of text nodes', () => {
    const md = '> A quote that goes on\n> with a continuation ![[quoted.png]] line\n';
    const doc = parse(md);
    expect(raws(doc)).toEqual(['![[quoted.png]]']);
    for (const text of texts(doc)) expect(text).not.toContain('>');
    expect(texts(doc).join('')).toBe('A quote that goes onwith a continuation  line');
    expect(serialize(doc)).toContain('![[quoted.png]]');
  });

  it('keeps list indentation out of text nodes for a continuation line', () => {
    const md = '- item one\n  continues ![[inner.png]] here\n- two\n';
    const doc = parse(md);
    expect(raws(doc)).toEqual(['![[inner.png]]']);
    for (const text of texts(doc)) expect(text).not.toMatch(/^ {2}/m);
    expect(texts(doc).join('')).toContain('continues ');
  });

  it('handles an embed on the second line of a nested quote in a list', () => {
    const md = '- item\n\n  > deep ![[a.png]]\n  > more\n';
    const doc = parse(md);
    expect(raws(doc)).toEqual(['![[a.png]]']);
    for (const text of texts(doc)) expect(text).not.toContain('>');
  });

  it('reads CRLF documents without carriage returns in the text', () => {
    const md = 'First line ![[a.png]]\r\nsecond line [[b]]\r\n\r\nNext\r\n';
    const doc = parse(md);
    expect(raws(doc)).toEqual(['![[a.png]]', '[[b]]']);
    for (const text of texts(doc)) expect(text).not.toContain('\r');
  });
});

describe('front matter positions', () => {
  it('finds an embed in the body after front matter closed by three dots', () => {
    const md = '---\ntitle: R\n...\n\nBody ![[a.png]] text\n\n> quoted ![[b.png]]\n';
    const doc = parse(md);
    expect(doc.child(0).type.name).toBe('front_matter');
    expect(raws(doc)).toEqual(['![[a.png]]', '![[b.png]]']);
    expect(texts(doc).join('|')).toBe('title: R|Body | text|quoted ');
    expect(serialize(doc)).toBe(
      '---\ntitle: R\n...\n\nBody ![[a.png]] text\n\n> quoted ![[b.png]]\n'
    );
  });

  it('finds an embed after front matter that remark itself reads correctly', () => {
    const md = '---\ntitle: R\n---\n\nBody ![[a.png]]\n';
    expect(raws(parse(md))).toEqual(['![[a.png]]']);
  });

  it('reads a body that only looks like front matter to remark-frontmatter', () => {
    const md = '---\n\nIntro ![[a.png]]\n\n---\n\n# Title ![[b.png]]\n';
    const doc = parse(md);
    expect(raws(doc)).toEqual(['![[a.png]]', '![[b.png]]']);
    expect(texts(doc)).toEqual(['Intro ', 'Title ']);
  });
});

describe('markdown images are left to the image node', () => {
  it('round-trips ![alt|300](p.png), angle brackets and percent escapes', () => {
    const md = '![alt|300](p.png)\n\n![](<my file.png>)\n\n![](my%20file.png)\n';
    const doc = parse(md);
    const srcs: string[] = [];
    const alts: string[] = [];
    doc.descendants((node) => {
      if (node.type.name === 'image') {
        srcs.push(String(node.attrs.src));
        alts.push(String(node.attrs.alt));
      }
    });
    expect(alts).toEqual(['alt|300', '', '']);
    expect(srcs).toEqual(['p.png', 'my file.png', 'my%20file.png']);
    expect(raws(doc)).toEqual([]);
    // The unedited document keeps its own text through the merge.
    expect(editor.action((ctx) => keepSourceStyle(ctx, md, serialize(doc)))).toBe(md);
  });
});

describe('line breaks around an embed', () => {
  it('keeps a hard break (two spaces) before a token at the start of a line', () => {
    const out = serialize(parse('Intro text  \n![[photo.png]]\n'));
    expect(out).toBe('Intro text\\\n![[photo.png]]\n');
    expect(raws(parse(out))).toEqual(['![[photo.png]]']);
  });

  it('keeps a backslash hard break before an embed or a wikilink', () => {
    expect(serialize(parse('Intro text\\\n![[photo.png]]\n'))).toBe(
      'Intro text\\\n![[photo.png]]\n'
    );
    expect(serialize(parse('Intro text  \n[[Note]]\n'))).toBe('Intro text\\\n[[Note]]\n');
  });

  it('keeps soft breaks between lines that start with a token', () => {
    expect(serialize(parse('Intro text\n![[photo.png]]\nCaption here\n'))).toBe(
      'Intro text\n![[photo.png]]\nCaption here\n'
    );
    expect(serialize(parse('![[a.png]]\n![[b.png]]\n![[c.png]]\n'))).toBe(
      '![[a.png]]\n![[b.png]]\n![[c.png]]\n'
    );
    expect(serialize(parse('[[A]]\n[[B]]\n[[C]]\n'))).toBe('[[A]]\n[[B]]\n[[C]]\n');
    expect(serialize(parse('> q\n> [[N]]\n'))).toBe('> q\n> [[N]]\n');
  });

  it('keeps the breaks when a word next to them is edited', () => {
    const old = 'Intro text  \n![[photo.png]]\n';
    const next = 'IXntro text\\\n![[photo.png]]\n';
    expect(editor.action((ctx) => keepSourceStyle(ctx, old, next))).toBe(next);
  });
});

describe('escaping before an embed', () => {
  it('keeps a block marker at the start of a paragraph escaped', () => {
    for (const md of [
      '2023\\. Annual report ![[chart.png]]\n',
      '\\# 5 items ![[a.png]]\n',
      '\\- not a list ![[a.png]]\n',
      '\\> not quote ![[a.png]]\n',
      '2023\\. Annual ![[a.png]] end\n',
      'first  \n2023\\. Annual ![[a.png]]\n',
    ]) {
      const out = serialize(parse(md));
      const again = parse(out);
      expect(again.childCount, md).toBe(1);
      expect(again.child(0).type.name, md).toBe('paragraph');
    }
  });

  it('writes a typed trailing space as a space, not an entity', () => {
    const view = editor.action((ctx) => ctx.get(editorViewCtx));
    const doc = parse('Typing ![[a.png]]\n');
    view.dispatch(view.state.tr.replaceWith(0, view.state.doc.content.size, doc.content));
    view.dispatch(view.state.tr.insertText(' ', view.state.doc.content.size - 1));
    expect(serialize(view.state.doc)).toBe('Typing ![[a.png]] \n');
  });
});

describe('escapes next to an embed', () => {
  /** Edits the first word of the first paragraph or cell text, then merges with the old source. */
  const editFirstWord = (md: string): string => {
    const edited = parse(md.replace('Zed', 'Zedx'));
    return editor.action((ctx) => keepSourceStyle(ctx, md, serialize(edited)));
  };

  it('keeps an escaped pipe in a table cell that ends before an embed', () => {
    const md = '| h | h2 |\n| --- | --- |\n| a \\| b ![[x.png]] | c |\n';
    const out = serialize(parse(md));
    expect(out).toContain('a \\| b ![[x.png]]');
    const row = out.split('\n').find((l) => l.includes('x.png')) ?? '';
    expect(row.replace(/\\\|/g, '').split('|').length).toBe(4);
  });

  it('keeps escaped brackets, angle brackets and backticks literal before an embed', () => {
    for (const md of [
      '![[a.png]] foo \\[bar\\](x) ![[b.png]]\n',
      'a \\<b> ![[x.png]]\n',
      'a ![[a.png]] b \\`code\\` c ![[b.png]] and \\`\n',
    ]) {
      const again = parse(serialize(parse(md)));
      // The serializer may pick another but equivalent escape; the text must not change meaning.
      expect(texts(again).join(''), md).toBe(texts(parse(md)).join(''));
      expect(raws(again), md).toEqual(raws(parse(md)));
      again.descendants((node) => {
        expect(
          node.marks.map((m) => m.type.name),
          md
        ).toEqual([]);
      });
    }
  });

  it('keeps the text literal when another word in the block is edited', () => {
    const md = 'Zed \\[bar\\](x) ![[b.png]] end\n';
    const out = editFirstWord(md);
    expect(out).toContain('![[b.png]]');
    const again = parse(out);
    expect(texts(again).join('')).toBe('Zedx [bar](x)  end');
    again.descendants((node) => {
      expect(node.marks.map((m) => m.type.name)).toEqual([]);
    });
  });

  it('escapes a paren typed right after a chip, even when the text ends in a space', () => {
    // Text ending in whitespace skips Milkdown's own escaping, so `](CEO)` would become a link.
    for (const [md, typed] of [
      ['x [[Alice]] and **b**\n', '(CEO) '],
      ['x ![[a.png]] and **b**\n', '(x) '],
    ] as const) {
      const view = load(md);
      view.dispatch(view.state.tr.insertText(typed, 4));
      const out = mdOf(view);
      const again = parse(out);
      expect(raws(again), out).toEqual(raws(view.state.doc));
      expect(texts(again).join(''), out).toBe(texts(view.state.doc).join(''));
      again.descendants((node) => {
        expect(node.type.name, out).not.toBe('link');
        expect(node.type.name, out).not.toBe('image');
      });
    }
  });
});

describe('pasted html', () => {
  const pasted = (html: string): string => {
    const box = document.createElement('div');
    box.innerHTML = html;
    const schema = editor.action((ctx) => ctx.get(schemaCtx));
    return serialize(ProseDOMParser.fromSchema(schema).parse(box));
  };

  it('accepts an embed span that holds one well-formed token', () => {
    expect(pasted('<p>hi <span data-md-embed data-raw="![[a.png|50]]">t</span></p>')).toBe(
      'hi ![[a.png|50]]\n'
    );
  });

  it('drops an embed span whose data-raw is anything else', () => {
    for (const raw of [
      'x\n\n# pwned\n\n<img src=https://t/x.png>',
      '![[a.png]]\n\n# pwned\n\n[[b]]',
      '<img src=https://t/x.png>',
      'plain',
      '',
    ]) {
      const box = document.createElement('div');
      const p = document.createElement('p');
      const span = document.createElement('span');
      span.setAttribute('data-md-embed', '');
      span.setAttribute('data-raw', raw);
      span.textContent = 'shown';
      p.append('hi ', span);
      box.append(p);
      const schema = editor.action((ctx) => ctx.get(schemaCtx));
      const out = serialize(ProseDOMParser.fromSchema(schema).parse(box));
      expect(out, raw).not.toContain('pwned');
      expect(out, raw).not.toContain('<img');
      expect(raws(ProseDOMParser.fromSchema(schema).parse(box)), raw).toEqual([]);
    }
  });
});

const viewOf = (): EditorView => editor.action((ctx) => ctx.get(editorViewCtx));

/** Replaces the document without touching undo history, so Ctrl+Z only sees the test's own edits. */
const load = (md: string): EditorView => {
  const view = viewOf();
  view.dispatch(
    view.state.tr
      .replaceWith(0, view.state.doc.content.size, parse(md).content)
      .setMeta('addToHistory', false)
  );
  return view;
};

/** Start of the content of the top-level block at `index`. */
const blockStart = (view: EditorView, index: number): number => {
  let pos = 0;
  for (let i = 0; i < index; i++) pos += view.state.doc.child(i).nodeSize;
  return pos + 1;
};

const selectContent = (view: EditorView, index: number): void => {
  const from = blockStart(view, index);
  const size = view.state.doc.child(index).content.size;
  view.dispatch(
    view.state.tr.setSelection(TextSelection.create(view.state.doc, from, from + size))
  );
};

const caretAt = (view: EditorView, pos: number): void => {
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos)));
};

const mdOf = (view: EditorView): string => serialize(view.state.doc);

/** Marks the embed nodes carry, and whether any sits in a code block. */
const embedProblems = (doc: Node): string[] => {
  const out: string[] = [];
  doc.descendants((node, _pos, parent) => {
    if (node.type.name !== 'embed') return;
    if (parent?.type.spec.code) out.push(`${node.attrs.raw} in code block`);
    for (const m of node.marks)
      if (!['emphasis', 'strong', 'strike_through'].includes(m.type.name))
        out.push(`${node.attrs.raw} carries ${m.type.name}`);
  });
  return out;
};

const run = <T>(key: CmdKey<T>, payload?: T): void => {
  editor.action((ctx) => {
    ctx.get(commandsCtx).call(key, payload);
  });
};

describe('embeds never leave the source when a block becomes code', () => {
  const para = 'See [[Project Note]] and ![[diagram.png]] end\n\nOther\n';

  it('keeps both tokens when the paragraph becomes a code block (toolbar button)', () => {
    const view = load(para);
    selectContent(view, 0);
    run(createCodeBlockCommand.key);
    expect(mdOf(view)).toBe('```\nSee [[Project Note]] and ![[diagram.png]] end\n```\n\nOther\n');
    expect(embedProblems(view.state.doc)).toEqual([]);
  });

  it('restores the embeds with one undo', () => {
    const view = load(para);
    selectContent(view, 0);
    run(createCodeBlockCommand.key);
    undo(view.state, view.dispatch);
    expect(raws(view.state.doc)).toEqual(['[[Project Note]]', '![[diagram.png]]']);
    expect(mdOf(view)).toBe(para);
  });

  it('keeps the token when a paragraph is joined into a code block by Delete', () => {
    const view = load('```\ncode\n```\n\npara [[N]] x\n');
    caretAt(view, 5);
    expect(joinForward(view.state, view.dispatch, view)).toBe(true);
    expect(mdOf(view)).toBe('```\ncodepara [[N]] x\n```\n');
    expect(embedProblems(view.state.doc)).toEqual([]);
  });

  it('keeps the token when Backspace joins a paragraph into the code block above', () => {
    const view = load('```\ncode\n```\n\npara [[N]] x\n');
    caretAt(view, blockStart(view, 1));
    expect(joinBackward(view.state, view.dispatch, view)).toBe(true);
    expect(mdOf(view)).toBe('```\ncodepara [[N]] x\n```\n');
  });

  it('keeps the tokens when the "``` " shortcut is typed at the start of a paragraph', () => {
    const view = load('x [[Note]] y\n');
    view.dispatch(view.state.tr.insertText('```', 1));
    const typed = view.someProp('handleTextInput', (f) => f(view, 4, 4, ' ', () => view.state.tr));
    expect(typed).toBe(true);
    expect(view.state.doc.child(0).type.name).toBe('code_block');
    expect(mdOf(view)).toBe('```\nx [[Note]] y\n```\n');
  });
});

describe('embeds never carry the code mark', () => {
  it('keeps both tokens when inline code is applied over the whole paragraph', () => {
    const view = load('Hello [[Note]] and ![[pic.png]] world\n');
    selectContent(view, 0);
    run(toggleInlineCodeCommand.key);
    expect(mdOf(view)).toBe('`Hello [[Note]] and ![[pic.png]] world`\n');
    expect(embedProblems(view.state.doc)).toEqual([]);
  });

  it('keeps the token when inline code is applied to a selected embed (Ctrl+E on a chip)', () => {
    const view = load('x [[Note]] y\n');
    view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, 3)));
    run(toggleInlineCodeCommand.key);
    expect(mdOf(view)).toBe('x `[[Note]]` y\n');
    expect(embedProblems(view.state.doc)).toEqual([]);
  });

  it('keeps the token when backticks are typed on both sides of it', () => {
    const view = load('[[Note]]\n');
    view.dispatch(view.state.tr.insertText('`', 1));
    // Caret after the chip: backtick, chip.
    caretAt(view, 3);
    const typed = view.someProp('handleTextInput', (f) => f(view, 3, 3, '`', () => view.state.tr));
    expect(typed).toBe(true);
    expect(mdOf(view)).toBe('`[[Note]]`\n');
    expect(embedProblems(view.state.doc)).toEqual([]);
  });

  it('undoes the conversion in one step', () => {
    const view = load('x [[Note]] y\n');
    selectContent(view, 0);
    run(toggleInlineCodeCommand.key);
    undo(view.state, view.dispatch);
    expect(mdOf(view)).toBe('x [[Note]] y\n');
    expect(raws(view.state.doc)).toEqual(['[[Note]]']);
  });

  it('removes a link mark from an embed and leaves the token outside the link', () => {
    const view = load('a [[N]] b\n');
    selectContent(view, 0);
    run(toggleLinkCommand.key, { href: 'http://e.com' });
    expect(embedProblems(view.state.doc)).toEqual([]);
    expect(mdOf(view)).toContain('[[N]]');
    expect(mdOf(view)).not.toMatch(/\[[^\]]*\[\[N\]\]/);
  });

  it('still lets an embed be bold, italic or struck through', () => {
    const view = load('a ![[x.png]] b\n');
    selectContent(view, 0);
    run(toggleStrongCommand.key);
    expect(mdOf(view)).toBe('**a ![[x.png]] b**\n');
    expect(raws(view.state.doc)).toEqual(['![[x.png]]']);
  });
});

describe('no formatting or joining action drops a token (random sequences)', () => {
  const docs = [
    'See [[Project Note]] and ![[diagram.png]] end\n\nOther\n',
    '```\ncode\n```\n\npara [[N]] x\n\n> q ![[a.png]]\n\n- item [[L]]\n',
    '# H [[T]]\n\ntext `c` ![[b.png]]\n\n| a | b |\n| - | - |\n| ![[x.png]] | [[y]] |\n',
    '---\ntitle: T\n---\n\npara [[N]] x\n\nmore ![[a.png]]\n',
  ];

  const lcg = (seed: number) => {
    let s = seed;
    return (n: number): number => {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s % n;
    };
  };

  const countOf = (text: string, raw: string): number => text.split(raw).length - 1;

  it('keeps every token of the source in the serialized document', () => {
    const tokensOf = (md: string) => raws(parse(md));
    for (let seed = 1; seed <= 150; seed++) {
      const rand = lcg(seed);
      const md = docs[seed % docs.length] ?? '';
      const tokens = tokensOf(md);
      const view = load(md);
      const log: string[] = [];
      for (let step = 0; step < 10; step++) {
        const op = rand(9);
        const textblocks: number[] = [];
        view.state.doc.forEach((node, offset) => {
          if (node.isTextblock) textblocks.push(offset);
        });
        const target = textblocks[rand(Math.max(1, textblocks.length))];
        if (target !== undefined) {
          const node = view.state.doc.nodeAt(target);
          const from = target + 1;
          const to = from + (node?.content.size ?? 0);
          const atEnd = rand(2) === 0;
          const sel = rand(3);
          view.dispatch(
            view.state.tr.setSelection(
              TextSelection.create(
                view.state.doc,
                sel === 0 ? from : atEnd ? to : from,
                sel === 1 ? from : to
              )
            )
          );
        }
        log.push(String(op));
        if (op === 0) run(createCodeBlockCommand.key);
        else if (op === 1) run(toggleInlineCodeCommand.key);
        else if (op === 2) run(toggleStrongCommand.key);
        else if (op === 3) run(toggleEmphasisCommand.key);
        else if (op === 4) run(toggleLinkCommand.key, { href: 'http://e.com' });
        else if (op === 5) joinForward(view.state, view.dispatch, view);
        else if (op === 6) joinBackward(view.state, view.dispatch, view);
        else if (op === 7) undo(view.state, view.dispatch);
        else {
          // Node-select the first chip, then toggle inline code on it.
          let chip = -1;
          view.state.doc.descendants((n, pos) => {
            if (chip < 0 && n.type.name === 'embed') chip = pos;
          });
          if (chip >= 0) {
            view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, chip)));
            run(toggleInlineCodeCommand.key);
          }
        }
        const out = mdOf(view);
        for (const token of new Set(tokens))
          expect(
            countOf(out, token),
            `seed ${seed} ops ${log.join(',')} token ${token}\n${out}`
          ).toBe(tokens.filter((t) => t === token).length);
        expect(embedProblems(view.state.doc), `seed ${seed} ops ${log.join(',')}`).toEqual([]);
      }
    }
  }, 30000);
});

describe('a literal backslash or an entity before or inside a token', () => {
  it('reads the token after an even number of backslashes', () => {
    for (const token of ['![[x.png]]', '[[Note]]']) {
      for (const n of [2, 4, 6]) {
        const md = `a ${'\\'.repeat(n)}${token} b\n`;
        expect(raws(parse(md)), md).toEqual([token]);
        expect(serialize(parse(md)), md).toBe(md);
      }
    }
  });

  it('agrees with the text pane after an odd number of backslashes', () => {
    for (const n of [1, 3]) {
      const md = `a ${'\\'.repeat(n)}![[x.png]] b\n`;
      const scanned = findWikiRefs(md, { code: 'ignore', frontMatter: 'ignore' }).map((r) => r.raw);
      expect(raws(parse(md)), md).toEqual(scanned);
    }
  });

  it('keeps the source of the paragraph when a word in it is edited', () => {
    const old = 'a \\\\![[x.png]] b\n';
    const view = load(old);
    view.dispatch(view.state.tr.insertText('Q', 1));
    const merged = editor.action((ctx) => keepSourceStyle(ctx, old, mdOf(view)));
    expect(merged).toBe('Qa \\\\![[x.png]] b\n');
  });

  it('reads a token written with an entity the unescaper does not know', () => {
    const md = 'x ![[a&apos;b.png]] y\n';
    expect(raws(parse(md))).toEqual(['![[a&apos;b.png]]']);
    expect(serialize(parse(md))).toBe(md);
  });

  it('does not take an escaped token for the real one with the same name', () => {
    const md = '\\[[a]] and [[a]]\n';
    expect(raws(parse(md))).toEqual([]);
    expect(texts(parse(md)).join('')).toBe('[[a]] and [[a]]');
  });
});

describe('documents without tokens serialize as they did without this plugin', () => {
  let plain: Editor;
  beforeEach(async () => {
    const root = document.createElement('div');
    document.body.append(root);
    plain = await Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, root);
        ctx.update(remarkPluginsCtx, (plugins) => [...plugins, remarkFrontMatter, imageTitleFix]);
      })
      .use(commonmark)
      .use(gfm)
      .use(frontMatter)
      .create();
  });
  afterEach(async () => {
    await plain.destroy();
  });

  const reference = (md: string): string =>
    plain.action((ctx) => ctx.get(serializerCtx)(ctx.get(parserCtx)(md)));

  const punctuation = ['~', '`', '[', ']', '&', '<', '(', '!', '|', '#', '*', '_', '\\', '>'];
  const inlines = ['**b**', '`c`', '[d](e)', '*i*', '![i](p.png)', '~~s~~', '[x]'];

  it('writes the repro paragraphs unchanged', () => {
    for (const md of [
      '[TODO] **c** endZ\n',
      'AT&T rocks **b**\n',
      'a ~ b ~~ c **b**\n',
      'a ` b **b**\n',
      'a [b] c [d](e) **b**\n',
      '> [!tip] **x**\n',
      'text ~260 ms. `p.json`QQ\n',
    ])
      expect(serialize(parse(md)), md).toBe(reference(md));
    expect(serialize(parse('[TODO] **c** end\n'))).toBe('[TODO] **c** end\n');
  });

  it('writes every punctuation and inline combination like the reference', () => {
    for (const p of punctuation) {
      for (const inline of inlines) {
        for (const md of [
          `x ${p} ${inline} y\n`,
          `${p} ${inline}\n`,
          `t${p} ${inline} end ${p} \n`,
          `| h |\n| - |\n| a ${p} b ${inline} |\n`,
        ])
          expect(serialize(parse(md)), md).toBe(reference(md));
      }
    }
  });
});

describe('an escaped pipe in a table cell next to a mark', () => {
  const cells = (md: string): number[] => {
    const counts: number[] = [];
    parse(md).descendants((node) => {
      if (node.type.name === 'table_row') counts.push(node.childCount);
    });
    return counts;
  };

  it('keeps the row at two cells', () => {
    for (const mark of ['**z**', '~~z~~', '[z](u)', '*z*']) {
      const md = `| a | b |\n| - | - |\n| x \\| y ${mark} | q |\n`;
      const out = serialize(parse(md));
      expect(cells(out), mark).toEqual([2]);
      expect(out, mark).toContain(`x \\| y ${mark} | q |`);
    }
  });

  it('leaves a pipe that is already escaped, and text outside cells, as it was', () => {
    expect(serialize(parse('| a |\n| - |\n| x \\| y |\n'))).toContain('| x \\| y |');
    // An escaped backslash and then a pipe: the pipe still has to be escaped once.
    expect(serialize(parse('| a |\n| - |\n| x \\\\\\| y **z** |\n'))).toContain(
      'x \\\\\\| y **z**'
    );
    expect(serialize(parse('x | y **z**\n'))).toBe('x | y **z**\n');
  });
});

describe('plain text copies', () => {
  it('carry the token of an embed in a partial selection', () => {
    const view = load('hello ![[pic.png]] and [[Other]] end\n\nsecond\n');
    const text = (from: number, to: number) => {
      const slice = view.state.doc.slice(from, to);
      return slice.content.textBetween(0, slice.content.size, '\n\n');
    };
    expect(text(3, 16)).toBe('llo ![[pic.png]] and [[Other]] e');
    expect(text(7, 8)).toBe('![[pic.png]]');
    expect(text(7, 12)).toBe('![[pic.png]] and');
  });
});

describe('a literal bang that comes from an escape or an entity', () => {
  it('stays as text before the plain link', () => {
    for (const md of [
      '\\![[a.png]]\n',
      'x \\![[a.png]] y\n',
      '&#33;[[a.png]]\n',
      '&excl;[[a.png]]\n',
      'x \\\\\\![[a.png]] y\n',
    ]) {
      const doc = parse(md);
      expect(raws(doc), md).toEqual(['[[a.png]]']);
      const para = doc.child(0);
      let seen = '';
      para.forEach((child) => {
        seen += child.isText ? child.text : '#';
      });
      expect(seen, md).toMatch(/!#/);
    }
  });

  it('is still there after an edit and a merge with the old source', () => {
    for (const old of ['x \\![[a.png]] y\n', '&#33;[[a.png]]\n']) {
      const view = load(old);
      view.dispatch(view.state.tr.insertText('Q', 1));
      const merged = editor.action((ctx) => keepSourceStyle(ctx, old, mdOf(view)));
      // The token sits behind a literal bang, whichever way it was written.
      expect(merged, old).toMatch(/^Q.*(\\!|&#33;)\[\[a\.png\]\]/);
      expect(raws(parse(merged)), old).toEqual(['[[a.png]]']);
      expect(texts(parse(merged)).join(''), old).toContain('!');
    }
  });

  it('survives a bang typed before a wikilink chip and a reload', () => {
    const view = load('wow [[Note]] and ![[a.png]]\n');
    caretAt(view, 5);
    view.dispatch(view.state.tr.insertText('!'));
    const md = mdOf(view);
    expect(md).toContain('\\![[Note]]');
    const again = parse(md);
    expect(raws(again)).toEqual(['[[Note]]', '![[a.png]]']);
    expect(serialize(again)).toBe(md);
    expect(texts(again).join('')).toContain('!');
  });
});

describe('a chip with a pipe moved into a table cell', () => {
  const doc = 'a ![[plan.png|300]] and [[Note|alias]] b\n\n| h1 | h2 |\n| --- | --- |\n| x | y |\n';

  /** Copies the first paragraph's content into the start of the `x` cell, as copy and paste does. */
  const pasteIntoCell = (view: EditorView): void => {
    const slice = view.state.doc.slice(1, 1 + view.state.doc.child(0).content.size);
    let cell = -1;
    view.state.doc.descendants((node, pos) => {
      if (cell < 0 && node.type.name === 'table_cell') cell = pos + 2;
      return cell < 0;
    });
    view.dispatch(view.state.tr.replaceRange(cell, cell, slice));
  };

  /** Number of cells in each table row of the parsed Markdown. */
  const cellCounts = (md: string): number[] => {
    const counts: number[] = [];
    parse(md).descendants((node) => {
      if (node.type.name === 'table_row' || node.type.name === 'table_header_row')
        counts.push(node.childCount);
    });
    return counts;
  };

  it('writes the pipes escaped, so the row keeps its cells and both chips', () => {
    const view = load(doc);
    pasteIntoCell(view);
    const md = mdOf(view);
    expect(md).toContain('![[plan.png\\|300]]');
    expect(md).toContain('[[Note\\|alias]]');
    expect(cellCounts(md)).toEqual([2, 2]);
    expect(raws(parse(md)).length).toBe(4);
  });

  it('keeps the escape when the merged source style is used', () => {
    const view = load(doc);
    pasteIntoCell(view);
    const merged = editor.action((ctx) => keepSourceStyle(ctx, doc, mdOf(view)));
    expect(cellCounts(merged)).toEqual([2, 2]);
  });

  it('also holds when Find and Replace rewrites a chip in a cell to contain a pipe', () => {
    // The engine replaces the raw attribute; it never sees where the node sits.
    const view = load('| h |\n| - |\n| ![[a.png]] |\n');
    let chip = -1;
    view.state.doc.descendants((node, pos) => {
      if (node.type.name === 'embed') chip = pos;
    });
    view.dispatch(view.state.tr.setNodeMarkup(chip, undefined, { raw: '![[a.png|300]]' }));
    const md = mdOf(view);
    expect(md).toContain('![[a.png\\|300]]');
    expect(cellCounts(md)).toEqual([1, 1]);
  });

  it('does not double an escape that is already there', () => {
    const md = '| h |\n| - |\n| ![[a.png\\|200]] \\\\\\| [[N\\|m]] |\n';
    expect(serialize(parse(md))).toContain('![[a.png\\|200]] \\\\\\| [[N\\|m]]');
  });
});

describe('a token beside text that the autolink transform rebuilt', () => {
  it('is still an embed when an escaped address or URL sits next to it', () => {
    for (const md of [
      'Contact [[Anna]] at anna\\@x.com today\n',
      'x [[Note]] ya\\@b.co\n',
      'a\\@b.co [[Note]]\n',
      'x [[Note]] http\\://e.com\n',
      'x [[Note]] www\\.e.com\n',
    ]) {
      expect(raws(parse(md)), md).toHaveLength(1);
    }
  });

  it('pairs every token on both sides of the rebuilt run, and keeps the text around them', () => {
    const doc = parse('x [[Note]] y http\\://e.com [[B]] z\\@w.io ![[c.png]] end\n');
    expect(raws(doc)).toEqual(['[[Note]]', '[[B]]', '![[c.png]]']);
    expect(texts(doc).join('')).toBe('x  y http://e.com  z@w.io  end');
  });

  it('leaves a token inside the address itself as text', () => {
    expect(raws(parse('x http\\://e.com/[[a]] y\n'))).toEqual([]);
  });

  it('keeps the token through an edit of the paragraph', () => {
    const old = 'Contact [[Anna]] at anna\\@x.com today\n';
    const view = load(old);
    view.dispatch(view.state.tr.insertText('Q', 1));
    const merged = editor.action((ctx) => keepSourceStyle(ctx, old, mdOf(view)));
    expect(merged).toContain('[[Anna]]');
    expect(merged).not.toContain('\\[');
  });
});

describe('code conversions of a chip can be undone by the opposite action', () => {
  const para = 'a ![[plan.png]] b [[Note]]\n\nsecond\n';

  it('turns the code block back into a paragraph with its chips', () => {
    const view = load(para);
    selectContent(view, 0);
    run(createCodeBlockCommand.key);
    expect(mdOf(view)).toBe('```\na ![[plan.png]] b [[Note]]\n```\n\nsecond\n');
    run(turnIntoTextCommand.key);
    expect(mdOf(view)).toBe(para);
    expect(raws(view.state.doc)).toEqual(['![[plan.png]]', '[[Note]]']);
  });

  it('turns text back into chips when inline code is toggled on and off', () => {
    const view = load(para);
    selectContent(view, 0);
    run(toggleInlineCodeCommand.key);
    expect(mdOf(view)).toBe('`a ![[plan.png]] b [[Note]]`\n\nsecond\n');
    run(toggleInlineCodeCommand.key);
    expect(mdOf(view)).toBe(para);
    expect(raws(view.state.doc)).toEqual(['![[plan.png]]', '[[Note]]']);
  });

  it('does not turn text that was never code into a chip', () => {
    // Typed or escaped brackets are literal text; only code that stops being code is read as a token.
    const view = load('\\[[escaped]] and plain\n');
    selectContent(view, 0);
    run(toggleStrongCommand.key);
    expect(raws(view.state.doc)).toEqual([]);
  });

  it('reads a token as a chip when it was code text of a code span in the source', () => {
    const view = load('see `![[a.png]]` here\n');
    let from = -1;
    let to = -1;
    view.state.doc.descendants((node, pos) => {
      if (node.isText && node.marks.some((m) => m.type.spec.code)) {
        from = pos;
        to = pos + node.nodeSize;
      }
    });
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, from, to)));
    run(toggleInlineCodeCommand.key);
    expect(raws(view.state.doc)).toEqual(['![[a.png]]']);
    expect(mdOf(view)).toBe('see ![[a.png]] here\n');
  });
});

describe('converting a block with thousands of chips', () => {
  it('stays quick in both directions', () => {
    const view = load(`${'![[a.png]] '.repeat(8000)}\n`);
    expect(raws(view.state.doc)).toHaveLength(8000);
    selectContent(view, 0);
    const started = performance.now();
    run(createCodeBlockCommand.key);
    const toCode = performance.now() - started;
    expect(embedProblems(view.state.doc)).toEqual([]);
    expect(view.state.doc.child(0).type.name).toBe('code_block');
    const back = performance.now();
    run(turnIntoTextCommand.key);
    expect(performance.now() - back).toBeLessThan(500);
    expect(toCode).toBeLessThan(500);
    expect(raws(view.state.doc)).toHaveLength(8000);
  });

  it('keeps the caret in the same text when chips around it change', () => {
    const view = load('a [[N]] bcd [[M]] e\n');
    const upTo = () =>
      view.state.doc.textBetween(1, view.state.selection.head, '', (leaf) =>
        String(leaf.attrs.raw ?? '')
      );
    caretAt(view, 6);
    expect(upTo()).toBe('a [[N]] b');
    run(createCodeBlockCommand.key);
    expect(upTo()).toBe('a [[N]] b');
    run(turnIntoTextCommand.key);
    expect(upTo()).toBe('a [[N]] b');
    expect(raws(view.state.doc)).toEqual(['[[N]]', '[[M]]']);
  });
});
