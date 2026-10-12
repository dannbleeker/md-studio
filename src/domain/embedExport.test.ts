import { marked, type Tokens } from 'marked';
import { describe, expect, it } from 'vitest';
import {
  ATTACHMENT_SCHEME,
  type ExpandEnv,
  expandEmbeds,
  MAX_EXPANDED_CHARS,
  MAX_EXPANSIONS,
  parseSizeFragment,
} from './embedExport';
import { classifyTarget } from './embeds';

type Files = Record<string, string | null>;

/** A vault of paths; a value is the note text, null for a binary file. */
function fakeEnv(files: Files, over: Partial<ExpandEnv> = {}): ExpandEnv & { reads: string[] } {
  const reads: string[] = [];
  return {
    reads,
    unavailable: false,
    maxDepth: 3,
    async resolve(target, _from, opts) {
      const names = Object.keys(files);
      const wanted = opts.note ? [target, `${target}.md`] : [target];
      for (const want of wanted) {
        const hit = names.find((n) => n === want || n.split('/').pop() === want);
        if (hit) return { path: hit, kind: classifyTarget(hit) };
      }
      return null;
    },
    async readNote(path) {
      reads.push(path);
      return files[path] ?? null;
    },
    label: (kind, name) => `<${kind}:${name}>`,
    ...over,
  };
}

const VAULT: Files = {
  'img/a b.png': null,
  'img/c.webp': null,
  'docs/x.pdf': null,
  'x.mp3': null,
  'x.mp4': null,
  'x.zip': null,
  'Notes/Note.md': 'Body of note\n\nsecond paragraph\n',
  'Notes/Outer.md': '![[Note]]\n',
  'Notes/Sections.md': '# One\n\ntext one\n\n# Two\n\ntext two\n',
  'Notes/Block.md': 'first para\n\nthe block ^abc\n',
};

describe('parseSizeFragment', () => {
  it('splits the size off', () => {
    expect(parseSizeFragment('attachment:a.png#size=300x200')).toEqual({
      href: 'attachment:a.png',
      displayWidth: 300,
      displayHeight: 200,
    });
    expect(parseSizeFragment('attachment:a.png#size=300')).toEqual({
      href: 'attachment:a.png',
      displayWidth: 300,
    });
    expect(parseSizeFragment('a.png#x')).toEqual({ href: 'a.png#x' });
  });
});

describe('expandEmbeds: images and files', () => {
  it('turns an image embed into an attachment link with its size', async () => {
    const out = await expandEmbeds('![[a b.png|300x200]]', 'Notes/n.md', fakeEnv(VAULT));
    expect(out).toBe(`![a b.png](${ATTACHMENT_SCHEME}img/a%20b.png#size=300x200)`);
  });

  it('omits the size when null and writes the width alone when the height is auto', async () => {
    const env = fakeEnv(VAULT);
    expect(await expandEmbeds('![[a b.png]]', null, env)).toBe(
      `![a b.png](${ATTACHMENT_SCHEME}img/a%20b.png)`
    );
    expect(await expandEmbeds('![[a b.png|300]]', null, env)).toBe(
      `![a b.png](${ATTACHMENT_SCHEME}img/a%20b.png#size=300)`
    );
  });

  it('uses the alt when there is one', async () => {
    const out = await expandEmbeds('![[c.webp|a view|50]]', null, fakeEnv(VAULT));
    expect(out).toBe(`![a view](${ATTACHMENT_SCHEME}img/c.webp#size=50)`);
  });

  it('writes labelled links for pdf, audio, video and other files', async () => {
    const env = fakeEnv(VAULT);
    expect(await expandEmbeds('![[x.pdf]]', 'docs/n.md', env)).toBe('[\\<pdf:x.pdf\\>](x.pdf)');
    expect(await expandEmbeds('![[x.mp3]]', 'a/n.md', env)).toBe('[\\<audio:x.mp3\\>](../x.mp3)');
    expect(await expandEmbeds('![[x.mp4]]', null, env)).toBe('[\\<video:x.mp4\\>](x.mp4)');
    expect(await expandEmbeds('![[x.zip]]', null, env)).toBe('[\\<other:x.zip\\>](x.zip)');
  });

  it('replaces a plain wikilink with its alias or target', async () => {
    const env = fakeEnv(VAULT);
    expect(await expandEmbeds('See [[Note]] and [[Note|the note]].', null, env)).toBe(
      'See Note and the note.'
    );
  });

  it('writes a plain label for unresolved and unavailable embeds', async () => {
    expect(await expandEmbeds('![[gone.png]]', null, fakeEnv(VAULT))).toBe(
      '\\<missing:gone.png\\>'
    );
    const env = fakeEnv(VAULT, { unavailable: true });
    expect(await expandEmbeds('![[a b.png]]', null, env)).toBe('\\<unavailable:a b.png\\>');
  });

  it('rewrites a Markdown image with a size, or strips only the size when it does not resolve', async () => {
    const env = fakeEnv(VAULT);
    expect(await expandEmbeds('![pic|300](<img/a b.png>)', null, env)).toBe(
      `![pic](${ATTACHMENT_SCHEME}img/a%20b.png#size=300)`
    );
    expect(await expandEmbeds('![pic|300](nope.png)', null, env)).toBe('![pic](nope.png)');
    expect(await expandEmbeds('![pic|300](https://x.dk/a.png)', null, env)).toBe(
      '![pic](https://x.dk/a.png)'
    );
    expect(await expandEmbeds('![plain](nope.png)', null, env)).toBe('![plain](nope.png)');
  });
});

describe('expandEmbeds: what is never touched', () => {
  const env = () => fakeEnv(VAULT);

  it('skips fenced code, inline code and front matter', async () => {
    const md = '---\nimg: ![[a b.png]]\n---\n\n```\n![[a b.png]]\n```\n\n`![[a b.png]]`\n';
    expect(await expandEmbeds(md, null, env())).toBe(md);
  });

  it('skips a token inside a fence inside a quote or a list', async () => {
    const quoted = '> ```\n> ![[a b.png]]\n> ```\n';
    const listed = '- item\n\n  ```\n  ![[a b.png]]\n  ```\n';
    const tilde = '1. x\n   ~~~\n   ![[a b.png]]\n   ~~~\n';
    for (const md of [quoted, listed, tilde]) expect(await expandEmbeds(md, null, env())).toBe(md);
  });

  it('expands again after the fence closes', async () => {
    const out = await expandEmbeds('> ```\n> x\n> ```\n> ![[a b.png]]\n', null, env());
    expect(out).toContain('attachment:');
  });

  it('returns text without tokens unchanged, so a second pass changes nothing', async () => {
    const md = 'Plain text\r\nwith [a link](x) and ![img](y.png)\r\n';
    const once = await expandEmbeds(md, null, env());
    expect(once).toBe(md);
    const out = await expandEmbeds('x ![[a b.png]] [[Note]]', null, env());
    expect(await expandEmbeds(out, null, env())).toBe(out);
  });
});

describe('expandEmbeds: tables', () => {
  it('keeps a cell on one line with no raw pipe', async () => {
    const md =
      '| a | b |\n| - | - |\n| ![[a b.png\\|300]] | ![[Note]] [[Note\\|al]] ![[x.pdf]] |\n';
    const out = await expandEmbeds(md, null, fakeEnv(VAULT));
    const row = out.split('\n')[2] ?? '';
    expect(out.split('\n')).toHaveLength(4);
    expect(row).toContain(`![a b.png](${ATTACHMENT_SCHEME}img/a%20b.png#size=300)`);
    expect(row).toContain('\\<note:Note\\>');
    // Only the separators between and around the two cells are unescaped pipes.
    expect(row.replace(/\\\|/g, '').match(/\|/g)).toHaveLength(3);
    const table = marked.lexer(out)[0] as Tokens.Table;
    expect(table.rows[0]).toHaveLength(2);
  });

  it('handles a table whose rows have no leading pipe', async () => {
    const md = 'a | b\n- | -\n![[a b.png]] | x\n';
    const out = await expandEmbeds(md, null, fakeEnv(VAULT));
    expect((marked.lexer(out)[0] as Tokens.Table).rows[0]?.[0]?.text).toContain('a b.png');
  });
});

describe('expandEmbeds: notes', () => {
  it('quotes an embedded note', async () => {
    const out = await expandEmbeds('before\n\n![[Note]]\n\nafter\n', null, fakeEnv(VAULT));
    expect(out).toBe('before\n\n> Body of note\n>\n> second paragraph\n\nafter\n');
  });

  it('expands nested notes with the note own path', async () => {
    const seen: (string | null)[] = [];
    const base = fakeEnv(VAULT);
    const env = fakeEnv(VAULT, {
      async resolve(target, from, opts) {
        seen.push(from);
        return base.resolve(target, from, opts);
      },
    });
    const out = await expandEmbeds('![[Outer]]\n', 'Home.md', env);
    expect(out).toBe('> > Body of note\n> >\n> > second paragraph\n');
    expect(seen).toEqual(['Home.md', 'Notes/Outer.md']);
  });

  it('selects a heading section and a block', async () => {
    const env = fakeEnv(VAULT);
    expect(await expandEmbeds('![[Sections#Two]]', null, env)).toBe('> # Two\n>\n> text two');
    expect(await expandEmbeds('![[Block#^abc]]', null, env)).toBe('> the block');
  });

  it('labels a missing note, heading or block', async () => {
    const env = fakeEnv(VAULT);
    expect(await expandEmbeds('![[Nowhere]]', null, env)).toBe('\\<missing:Nowhere\\>');
    expect(await expandEmbeds('![[Sections#Three]]', null, env)).toBe(
      '\\<note-missing:Sections\\>'
    );
    const unreadable = fakeEnv(VAULT, { readNote: async () => null });
    expect(await expandEmbeds('![[Note]]', null, unreadable)).toBe('\\<note-missing:Note\\>');
  });

  it('uses the markdown argument for the host and never reads it from disk', async () => {
    const env = fakeEnv({ ...VAULT, 'Notes/Host.md': 'STALE DISK TEXT' });
    const out = await expandEmbeds('# H\n\n![[#H]]\n\ntail\n', 'Notes/Host.md', env);
    // The section is the host's own and holds the embed again: a cycle.
    expect(out).toContain('\\<cycle:H\\>');
    const viaName = await expandEmbeds('text\n\n![[Host#^x]]\n', 'Notes/Host.md', env);
    expect(env.reads).toEqual([]);
    expect(viaName).toContain('note-missing');
  });

  it('embeds a section of the current note with an empty target', async () => {
    const md = '# One\n\nalpha\n\n# Two\n\n![[#One]]\n';
    const out = await expandEmbeds(md, 'n.md', fakeEnv(VAULT));
    expect(out).toBe('# One\n\nalpha\n\n# Two\n\n> # One\n>\n> alpha\n');
  });

  it('stops a cycle between notes', async () => {
    const files: Files = { 'A.md': 'a says\n\n![[B]]\n', 'B.md': 'b says\n\n![[A]]\n' };
    const env = fakeEnv(files);
    const out = await expandEmbeds(files['A.md'] ?? '', 'A.md', env);
    expect(out).toContain('cycle');
  });

  it('allows A to B#S1 to A#S2, which is not a cycle', async () => {
    const files: Files = {
      'A.md': '# S2\n\nleaf\n\n# Top\n\n![[B#S1]]\n',
      'B.md': '# S1\n\nback\n\n![[A#S2]]\n',
    };
    const out = await expandEmbeds(files['A.md'] ?? '', 'A.md', fakeEnv(files));
    expect(out).not.toContain('cycle');
    expect(out).toContain('leaf');
  });

  it('stops at the depth limit', async () => {
    const files: Files = {
      'n1.md': 'one\n\n![[n2]]\n',
      'n2.md': 'two\n\n![[n3]]\n',
      'n3.md': 'three\n\n![[n4]]\n',
      'n4.md': 'four\n\n![[n5]]\n',
      'n5.md': 'five\n',
    };
    const out = await expandEmbeds('![[n1]]', 'top.md', fakeEnv(files));
    expect(out).toContain('three');
    expect(out).toContain('\\<depth:n4\\>');
    expect(out).not.toContain('four');
    const shallow = await expandEmbeds('![[n1]]', 'top.md', fakeEnv(files, { maxDepth: 1 }));
    expect(shallow).toContain('\\<depth:n2\\>');
  });

  it('collapses a mid-paragraph note embed to a label', async () => {
    const out = await expandEmbeds('Text ![[Note]] more\n', null, fakeEnv(VAULT));
    expect(out).toBe('Text \\<note:Note\\> more\n');
    const next = await expandEmbeds('![[Note]]\ncontinues here\n', null, fakeEnv(VAULT));
    expect(next).toBe('\\<note:Note\\>\ncontinues here\n');
  });

  it('keeps the order of several tokens and their offsets', async () => {
    const out = await expandEmbeds(
      'a ![[a b.png]] b [[Note]] c ![[x.pdf]] d',
      null,
      fakeEnv(VAULT)
    );
    expect(out).toBe(
      `a ![a b.png](${ATTACHMENT_SCHEME}img/a%20b.png) b Note c [\\<pdf:x.pdf\\>](docs/x.pdf) d`
    );
  });
});

describe('expandEmbeds: block boundaries', () => {
  const files: Files = { 'Note v1.2.md': 'the body\n' };
  const expanded = (md: string) => expandEmbeds(md, null, fakeEnv(files));

  it('expands an embed directly under a heading, a break, a fence or front matter', async () => {
    expect(await expanded('## Sec\n![[Note v1.2]]\n')).toBe('## Sec\n> the body\n');
    expect(await expanded('***\n![[Note v1.2]]\n')).toBe('***\n> the body\n');
    expect(await expanded('```\nx\n```\n![[Note v1.2]]\n')).toBe('```\nx\n```\n> the body\n');
    expect(await expanded('---\na: 1\n---\n![[Note v1.2]]\n')).toBe('---\na: 1\n---\n> the body\n');
  });

  it('expands an embed directly above a heading or an opening fence', async () => {
    expect(await expanded('![[Note v1.2]]\n## Sec\n')).toBe('> the body\n## Sec\n');
    expect(await expanded('![[Note v1.2]]\n```\nx\n```\n')).toBe('> the body\n```\nx\n```\n');
  });

  it('still collapses an embed that shares its paragraph with text', async () => {
    expect(await expanded('text\n![[Note v1.2]]\n')).toBe('text\n\\<note:Note v1.2\\>\n');
    expect(await expanded('![[Note v1.2]]\nWords\n---\n')).toBe(
      '\\<note:Note v1.2\\>\nWords\n---\n'
    );
  });
});

describe('expandEmbeds: budget', () => {
  it('stops expanding once the expansion cap is reached', async () => {
    const files: Files = {
      'A.md': Array.from({ length: 40 }, () => '![[B]]').join('\n\n'),
      'B.md': Array.from({ length: 40 }, () => '![[C]]').join('\n\n'),
      'C.md': 'leaf',
    };
    const env = fakeEnv(files);
    const out = await expandEmbeds('![[A]]\n\n![[A]]\n\n![[A]]\n', null, env);
    expect(env.reads.length).toBeLessThanOrEqual(MAX_EXPANSIONS);
    expect(out).toContain('\\<depth:');
  });

  it('stops expanding once the text cap is reached', async () => {
    const big = `${'x'.repeat(MAX_EXPANDED_CHARS)}\n`;
    const env = fakeEnv({ 'Big.md': big });
    const out = await expandEmbeds('![[Big]]\n\n![[Big]]\n', null, env);
    expect(out).toContain('\\<depth:Big\\>');
    expect(env.reads).toEqual(['Big.md']);
  });
});

describe('expandEmbeds: containers', () => {
  const env = () => fakeEnv(VAULT);

  it('keeps a list item', async () => {
    const out = await expandEmbeds('- one\n- ![[Note]]\n- three\n', null, env());
    expect(out).toBe('- one\n- > Body of note\n  >\n  > second paragraph\n- three\n');
    const list = marked.lexer(out)[0] as Tokens.List;
    expect(list.items).toHaveLength(3);
    expect(list.items[1]?.tokens[0]?.type).toBe('blockquote');
  });

  it('keeps an ordered item wide marker', async () => {
    const out = await expandEmbeds('10. ![[Note]]\n', null, env());
    expect(out).toBe('10. > Body of note\n    >\n    > second paragraph\n');
  });

  it('keeps a blockquote', async () => {
    const out = await expandEmbeds('> intro\n>\n> ![[Note]]\n', null, env());
    expect(out).toBe('> intro\n>\n> > Body of note\n> >\n> > second paragraph\n');
    const quote = marked.lexer(out)[0] as Tokens.Blockquote;
    expect(quote.tokens.map((t) => t.type)).toContain('blockquote');
  });

  it('keeps a quote inside a list', async () => {
    const out = await expandEmbeds('- item\n\n  > ![[Note]]\n', null, env());
    expect(out).toBe('- item\n\n  > > Body of note\n  > >\n  > > second paragraph\n');
    const list = marked.lexer(out)[0] as Tokens.List;
    const quote = list.items[0]?.tokens.find((t) => t.type === 'blockquote') as Tokens.Blockquote;
    expect(quote.tokens.map((t) => t.type)).toContain('blockquote');
  });

  it('keeps a list inside a quote', async () => {
    const out = await expandEmbeds('> - ![[Note]]\n', null, env());
    expect(out).toBe('> - > Body of note\n>   >\n>   > second paragraph\n');
  });

  it('collapses an embed that continues a paragraph in a container', async () => {
    const out = await expandEmbeds('- item\n  ![[Note]]\n', null, env());
    expect(out).toBe('- item\n  \\<note:Note\\>\n');
  });

  it('expands an image in a quote without a prefix', async () => {
    expect(await expandEmbeds('> ![[a b.png]]\n', null, env())).toBe(
      `> ![a b.png](${ATTACHMENT_SCHEME}img/a%20b.png)\n`
    );
  });
});

describe('expandEmbeds: Markdown images in a table', () => {
  it('reads the size of an alt written with a backslash-pipe', async () => {
    const md = '| a |\n| - |\n| ![pic\\|300](<img/a b.png>) |\n';
    const out = await expandEmbeds(md, null, fakeEnv(VAULT));
    expect(out).toBe(`| a |\n| - |\n| ![pic](${ATTACHMENT_SCHEME}img/a%20b.png#size=300) |\n`);
  });
});
