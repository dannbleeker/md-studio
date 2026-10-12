import {
  Editor,
  editorViewCtx,
  parserCtx,
  remarkPluginsCtx,
  rootCtx,
  schemaCtx,
  serializerCtx,
} from '@milkdown/kit/core';
import { commonmark } from '@milkdown/kit/preset/commonmark';
import { gfm } from '@milkdown/kit/preset/gfm';
import { type Node, DOMParser as ProseDOMParser } from '@milkdown/kit/prose/model';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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
