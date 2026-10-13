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

  it('expands an embed after the container of an unclosed fence has ended', async () => {
    // A fence left open inside a quote or list item ends with it (CommonMark), so
    // the embed after the blank line and the unindented line is a real one.
    const docs = [
      '> ```js\n> code\n\n![[a b.png]]\n',
      '- ```js\n  code\n\n![[a b.png]]\n',
      '1. step\n   ```\n   code\n\n![[a b.png]]\n',
    ];
    for (const md of docs) expect(await expandEmbeds(md, null, env())).toContain('attachment:');
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
    expect(await expandEmbeds('![[Nowhere]]', null, env)).toBe('\\<note-missing:Nowhere\\>');
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
    expect(out).toContain('\\<limit:');
  });

  it('stops expanding once the text cap is reached', async () => {
    const big = `${'x'.repeat(MAX_EXPANDED_CHARS)}\n`;
    const env = fakeEnv({ 'Big.md': big });
    const out = await expandEmbeds('![[Big]]\n\n![[Big]]\n', null, env);
    expect(out).toContain('\\<limit:Big\\>');
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

describe('expandEmbeds: Markdown links that carry a [[x]] label', () => {
  const env = () => fakeEnv(VAULT);

  it('leaves a citation label alone', async () => {
    for (const md of [
      'Fact [[1]](https://example.com/a) and [[2]](https://b.example).',
      'Ref [[1]][r1]\n\n[r1]: http://a',
      '**[[1]](http://a)**',
      '| [[1]](http://a) | b |\n| - | - |',
      '![[1]](http://x/a.png)',
      '[see [[1]]](http://a)',
    ]) {
      expect(await expandEmbeds(md, null, env())).toBe(md);
    }
  });

  it('still replaces a wikilink next to, but not inside, a link', async () => {
    expect(await expandEmbeds('[[Note]] and [a](http://b)', null, env())).toBe(
      'Note and [a](http://b)'
    );
  });
});

describe('expandEmbeds: embedded notes keep their own folder', () => {
  const files: Files = {
    'pic.png': null,
    'Sub/pic.png': null,
    'assets/only.png': null,
    'Sub/Other.md': '![](pic.png)\n\n![](../assets/only.png)\n\n![web](https://x.test/a.png)\n',
  };
  const env = () =>
    fakeEnv(files, {
      async resolve(target, from, opts) {
        const dir = from?.includes('/') ? from.slice(0, from.lastIndexOf('/') + 1) : '';
        const cands = opts.note
          ? [target, `${target}.md`, `Sub/${target}.md`]
          : [`${dir}${target}`.replace(/[^/]+\/\.\.\//, ''), target];
        const hit = cands.find((c) => c in files);
        return hit ? { path: hit, kind: classifyTarget(hit) } : null;
      },
    });

  it('resolves a plain image against the embedded note, not the host', async () => {
    const out = await expandEmbeds('![[Other]]', 'n.md', env());
    expect(out).toBe(
      `> ![pic.png](${ATTACHMENT_SCHEME}Sub/pic.png)\n>\n> ![only.png](${ATTACHMENT_SCHEME}assets/only.png)\n>\n> ![web](https://x.test/a.png)`
    );
  });

  it('leaves the images of the host note as written', async () => {
    const md = '![](pic.png)';
    expect(await expandEmbeds(md, 'n.md', env())).toBe(md);
  });
});

describe('expandEmbeds: a sized image in a table cell that stays unresolved', () => {
  it('drops the backslash that escaped the pipe', async () => {
    const env = fakeEnv(VAULT);
    expect(
      await expandEmbeds('| a |\n|---|\n| ![alt\\|100](https://x.test/a.png) |\n', null, env)
    ).toBe('| a |\n|---|\n| ![alt](https://x.test/a.png) |\n');
    expect(await expandEmbeds('| a |\n|---|\n| ![alt\\|100](nope.png) |\n', null, env)).toBe(
      '| a |\n|---|\n| ![alt](nope.png) |\n'
    );
  });
});

describe('expandEmbeds: code stays literal in every container', () => {
  const env = () => fakeEnv(VAULT);

  it('leaves indented code in a quote, after a heading or break, and in an item', async () => {
    for (const md of [
      '> para\n>\n>     ![[a b.png]]\n>     ![[Note]]\n',
      '# H\n    ![[a b.png]]\n',
      '***\n    ![[a b.png]]\n',
      '-     ![[Note]]\n',
      '>     ![x|100](img/a b.png)\n',
    ]) {
      expect(await expandEmbeds(md, null, env())).toBe(md);
    }
  });
});

describe('expandEmbeds: speed', () => {
  it('handles a long table with an embed per row', { tags: ['stress'] }, async () => {
    const rows = Array.from({ length: 6000 }, (_, i) => `| ${i} | ![[a b.png|20]] |`).join('\n');
    const start = performance.now();
    const out = await expandEmbeds(`| n | img |\n|---|---|\n${rows}\n`, null, fakeEnv(VAULT));
    expect(out).toContain('#size=20');
    expect(performance.now() - start).toBeLessThan(1500);
  });

  it('handles a long run of pipe lines that is no table', { tags: ['stress'] }, async () => {
    const rows = Array.from({ length: 6000 }, (_, i) => `a | ![[a b.png]] ${i}`).join('\n');
    const start = performance.now();
    await expandEmbeds(rows, null, fakeEnv(VAULT));
    expect(performance.now() - start).toBeLessThan(1500);
  });

  it('handles a very wide delimiter-shaped line next to an embed', {
    tags: ['stress'],
  }, async () => {
    // Trailing text after the dashes makes a backtracking delimiter match quadratic in the padding.
    const wide = `|${' '.repeat(40000)}-${' '.repeat(40000)}x`;
    const start = performance.now();
    // The wide line is a candidate delimiter row for the header above it.
    const out = await expandEmbeds(`| ![[a b.png]] |\n${wide}\n`, null, fakeEnv(VAULT));
    expect(out).toContain('a%20b.png');
    expect(performance.now() - start).toBeLessThan(500);
  });
});

describe('expandEmbeds: long neighbour lines', () => {
  const files: Files = { 'a.png': null };

  it('reads each neighbour line once, however many tokens sit between them', {
    tags: ['stress'],
  }, async () => {
    const quotes = '>'.repeat(20_000);
    const md = `${quotes}x\n${'![[a.png]]'.repeat(2000)}\n${quotes}x`;
    const start = performance.now();
    const out = await expandEmbeds(md, 'h.md', fakeEnv(files));
    expect(performance.now() - start).toBeLessThan(400);
    expect(out).toContain('![a.png](attachment:a.png)');
  });

  it('is quick next to a long run of blanks or list markers', { tags: ['stress'] }, async () => {
    for (const lead of [' '.repeat(40_000), '- '.repeat(20_000)]) {
      const start = performance.now();
      await expandEmbeds(`${lead}x\n${'![[a.png]]'.repeat(4000)}\n`, 'h.md', fakeEnv(files));
      expect(performance.now() - start).toBeLessThan(400);
    }
  });

  it('keeps a long run of blanks around an unchanged table-cell image linear', {
    tags: ['stress'],
  }, async () => {
    const blanks = ' '.repeat(64_000);
    for (const row of [
      `| ![a|5](${blanks}http://x/y.png) |`,
      `| ![a|5](http://x/y.png${blanks}) |`,
    ]) {
      const start = performance.now();
      const out = await expandEmbeds(`| h |\n| - |\n${row}\n`, 'h.md', fakeEnv(files));
      expect(performance.now() - start).toBeLessThan(400);
      expect(out).toContain('http://x/y.png');
    }
  });

  it('still joins the lines of a table-cell replacement into one', async () => {
    const out = await expandEmbeds(
      '| h |\n| - |\n| ![[Multi]] |\n',
      'h.md',
      fakeEnv({ 'Multi.md': 'one  \n two' })
    );
    expect(out.split('\n')).toHaveLength(4);
  });
});

describe('expandEmbeds: crafted container prefixes', () => {
  const vault = (note: string): Files => ({ 'N.md': note, 'a.png': null });

  it('stays quick on a very long quote prefix with many tokens', { tags: ['stress'] }, async () => {
    const md = `${'> '.repeat(20_000)}${'![[a.png]] '.repeat(2000)}`;
    const start = performance.now();
    await expandEmbeds(md, 'h.md', fakeEnv({}));
    expect(performance.now() - start).toBeLessThan(1000);
  });

  it('stays quick on a very long list prefix with many tokens', { tags: ['stress'] }, async () => {
    const md = `${'- '.repeat(20_000)}${'![[a.png]] '.repeat(2000)}`;
    const start = performance.now();
    await expandEmbeds(md, 'h.md', fakeEnv({}));
    expect(performance.now() - start).toBeLessThan(1000);
  });

  it('does not copy a huge prefix onto every line of an embedded note', async () => {
    const host = `${'> '.repeat(10_000)}![[N]]\n`;
    const out = await expandEmbeds(host, 'h.md', fakeEnv(vault('line\n'.repeat(1000))));
    expect(out.length).toBeLessThan(MAX_EXPANDED_CHARS);
    // Too deep to quote line by line: the labelled form stands in for the note.
    expect(out).toContain('\\<note:N\\>');
  });

  it('counts the quoted prefix against the expansion cap', async () => {
    // 30 quote levels are allowed, but 20,000 short lines then cost 1.2 million characters.
    const note = 'x\n'.repeat(20_000);
    const host = `${'> '.repeat(30)}![[N]]\n\n![[N]]\n`;
    const out = await expandEmbeds(host, 'h.md', fakeEnv(vault(note)));
    expect(out).toContain('\\<limit:N\\>');
  });
});

describe('expandEmbeds: plain wikilink text', () => {
  it('does not let an alias change the structure of the page', async () => {
    const env = fakeEnv(VAULT);
    const render = async (md: string) => marked.parse(await expandEmbeds(md, null, env)) as string;
    expect(await render('[[x|# Big heading]]')).not.toContain('<h1');
    expect(await render('[[x|- bullet]]')).not.toContain('<ul');
    expect(await render('[[x|1. numbered]]')).not.toContain('<ol');
    expect(await render('Para\n[[x|===]]')).not.toContain('<h1');
    expect(await render('Para\n[[x|---]]')).not.toContain('<h2');
    expect(await render('[[x|+ plus]]')).not.toContain('<ul');
    const out = await render('[[x|~~del~~ &amp; end]]');
    expect(out).not.toContain('<del');
    expect(out).toContain('&amp;amp;');
  });
});

describe('expandEmbeds: footnotes and definitions of an embedded note', () => {
  const files: Files = {
    'Fn.md': 'Note[^1] ref.\n\n[^1]: Note def.\n',
    'Ref.md': 'See [the site][r] and [r].\n\n[r]: https://note.example/ "T"\n',
  };

  it('keeps the note footnote separate from a host footnote of the same label', async () => {
    const out = await expandEmbeds('Host[^1].\n\n[^1]: Host def\n\n![[Fn]]', null, fakeEnv(files));
    const { inlineFootnotes } = await import('./footnotes');
    const text = inlineFootnotes(out);
    expect(text).toContain('Note def.');
    expect(text).toContain('Host def');
    expect(text).not.toContain('[^');
    expect(text).not.toMatch(/\\\[1\\\]: Note def/);
  });

  it('inlines the reference links of the note so the host cannot capture them', async () => {
    const out = await expandEmbeds(
      'See [h][r].\n\n[r]: https://host.example/\n\n![[Ref]]',
      null,
      fakeEnv(files)
    );
    expect(out).toContain(
      '> See [the site](https://note.example/ "T") and [r](https://note.example/ "T").'
    );
    expect(out).not.toContain('> [r]:');
    expect(out).toContain('[r]: https://host.example/');
  });
});

describe('expandEmbeds: limits', () => {
  it('stops a small fan-out well before it fills megabytes', async () => {
    const files: Files = {
      'A.md': '![[B]]\n'.repeat(25),
      'B.md': '![[C]]\n'.repeat(25),
      'C.md': `${'word '.repeat(4000)}\n`,
    };
    // Blank lines so each embed stands alone.
    files['A.md'] = '![[B]]\n\n'.repeat(25);
    files['B.md'] = '![[C]]\n\n'.repeat(25);
    const out = await expandEmbeds('![[A]]\n\n'.repeat(25), null, fakeEnv(files));
    expect(out.length).toBeLessThan(2_000_000);
    expect(out).toContain('<limit:');
  });
});

describe('expandEmbeds: missing notes and web embeds', () => {
  it('labels a note that is not there as a missing note', async () => {
    const env = fakeEnv(VAULT);
    expect(await expandEmbeds('![[Meeting notes]]', null, env)).toBe(
      '\\<note-missing:Meeting notes\\>'
    );
    expect(await expandEmbeds('![[Meeting notes#Decisions]]', null, env)).toBe(
      '\\<note-missing:Meeting notes\\>'
    );
    expect(await expandEmbeds('![[gone.png]]', null, env)).toBe('\\<missing:gone.png\\>');
  });

  it('turns a web-address embed into a Markdown image', async () => {
    const env = fakeEnv(VAULT);
    expect(await expandEmbeds('![[https://example.com/a.png]]', null, env)).toBe(
      '![a.png](<https://example.com/a.png>)'
    );
    expect(await expandEmbeds('![[//example.com/a.png|my alt|300]]', null, env)).toBe(
      '![my alt](<//example.com/a.png>)'
    );
  });
});

describe('expandEmbeds: a colon in the first path segment', () => {
  it('writes a relative link, not a URL scheme', async () => {
    const env = fakeEnv({ 'a:b.pdf': null, 'report: q1.pdf': null, 'javascript:x.pdf': null });
    expect(await expandEmbeds('![[a:b.pdf]]', 'Host.md', env)).toBe(
      '[\\<pdf:a:b.pdf\\>](./a:b.pdf)'
    );
    expect(await expandEmbeds('![[report: q1.pdf]]', 'Host.md', env)).toBe(
      '[\\<pdf:report: q1.pdf\\>](./report:%20q1.pdf)'
    );
    expect(await expandEmbeds('![[javascript:x.pdf]]', 'Host.md', env)).toContain(
      '(./javascript:x.pdf)'
    );
  });
});
