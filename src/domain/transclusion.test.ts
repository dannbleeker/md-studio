import { describe, expect, it } from 'vitest';
import {
  descend,
  MAX_TRANSCLUSION_DEPTH,
  selectNoteContent,
  startChain,
  stripFrontMatterText,
  type TranscludeChain,
} from './transclusion';

/** The embedded text for a fragment, or null when the target is missing. */
const select = (md: string, fragment: string | null): string | null =>
  selectNoteContent(md, fragment)?.markdown ?? null;

/** Follows one embed and fails the test if the guard refuses it. */
const enter = (chain: TranscludeChain, notePath: string, fragment: string | null) => {
  const result = descend(chain, notePath, fragment);
  if (!result.ok) throw new Error(`refused: ${result.reason}`);
  return result.chain;
};

describe('stripFrontMatterText', () => {
  it('removes front matter and the blank lines after it', () => {
    expect(stripFrontMatterText('---\ntitle: x\n---\n\n# Body\n')).toBe('# Body\n');
  });

  it('returns the input when there is no front matter', () => {
    expect(stripFrontMatterText('# Body\n')).toBe('# Body\n');
  });

  it('keeps the input when the opening fence is never closed', () => {
    const md = '---\ntitle: x\n# Body';
    expect(stripFrontMatterText(md)).toBe(md);
  });

  it('does not treat a rule followed by a blank line as front matter', () => {
    const md = '---\n\nx\n---\n';
    expect(stripFrontMatterText(md)).toBe(md);
  });
});

describe('startChain and descend', () => {
  it('seeds the host note as depth 0 with its whole-note key', () => {
    expect(startChain('A.md')).toEqual({ depth: 0, visited: ['A.md#'] });
    expect(startChain(null).visited).toEqual(['#']);
  });

  it('refuses a whole-note embed of the host itself as a cycle', () => {
    expect(descend(startChain('A.md'), 'A.md', null)).toEqual({ ok: false, reason: 'cycle' });
  });

  it('refuses A to B to A as a cycle', () => {
    const b = enter(startChain('A.md'), 'B.md', null);
    expect(descend(b, 'A.md', null)).toEqual({ ok: false, reason: 'cycle' });
  });

  it('allows A to B#S1 to A#S2, since the section differs', () => {
    const b = enter(startChain('A.md'), 'B.md', 'S1');
    const a = enter(b, 'A.md', 'S2');
    expect(a.visited).toEqual(['A.md#', 'B.md#S1', 'A.md#S2']);
    // Going back into A#S2 from there is a real cycle.
    expect(descend(a, 'A.md', 'S2')).toEqual({ ok: false, reason: 'cycle' });
  });

  it('allows a same-note section embed, ![[#H]], as the host#H key', () => {
    const result = descend(startChain('A.md'), 'A.md', 'H');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.chain.visited).toEqual(['A.md#', 'A.md#H']);
  });

  it('allows depths 1 to 3 and refuses the fourth level', () => {
    expect(MAX_TRANSCLUSION_DEPTH).toBe(3);
    let chain = startChain('A.md');
    chain = enter(chain, 'B.md', null);
    expect(chain.depth).toBe(1);
    chain = enter(chain, 'C.md', null);
    expect(chain.depth).toBe(2);
    chain = enter(chain, 'D.md', null);
    expect(chain.depth).toBe(3);
    expect(descend(chain, 'E.md', null)).toEqual({ ok: false, reason: 'depth' });
  });

  it('reports a cycle before the depth limit when both apply', () => {
    let chain = startChain('A.md');
    chain = enter(chain, 'B.md', null);
    chain = enter(chain, 'C.md', null);
    chain = enter(chain, 'D.md', null);
    expect(descend(chain, 'A.md', null)).toEqual({ ok: false, reason: 'cycle' });
  });
});

describe('selectNoteContent with no fragment', () => {
  it('returns the whole body without front matter', () => {
    const md = '---\ntitle: x\n---\n\n# One\ntext\n';
    expect(select(md, null)).toBe('# One\ntext\n');
    expect(select(md, '')).toBe('# One\ntext\n');
  });

  it('treats an empty note as empty, and any target in it as missing', () => {
    expect(select('', null)).toBe('');
    expect(select('', 'Heading')).toBeNull();
    expect(select('', '^id')).toBeNull();
  });
});

describe('heading sections', () => {
  const note = [
    '# Alpha',
    'intro',
    '## Beta',
    'beta text',
    '### Deep',
    'deep text',
    '## Gamma',
    'gamma text',
    '# Delta',
    'delta text',
  ].join('\n');

  it('runs from the heading to the next heading of the same or higher level', () => {
    expect(select(note, 'Alpha')).toBe(
      '# Alpha\nintro\n## Beta\nbeta text\n### Deep\ndeep text\n## Gamma\ngamma text'
    );
  });

  it('includes sub-headings but stops at the next heading of its own level', () => {
    expect(select(note, 'Beta')).toBe('## Beta\nbeta text\n### Deep\ndeep text');
    expect(select(note, 'Deep')).toBe('### Deep\ndeep text');
  });

  it('runs a heading at end of file to the end of the note', () => {
    expect(select(note, 'Delta')).toBe('# Delta\ndelta text');
    expect(select('intro\n# Last\nfinal', 'Last')).toBe('# Last\nfinal');
  });

  it('finds B inside A with A#B, and not outside its section', () => {
    expect(select(note, 'Alpha#Beta')).toBe('## Beta\nbeta text\n### Deep\ndeep text');
    expect(select(note, 'Alpha#Gamma')).toBe('## Gamma\ngamma text');
    // Gamma sits after Beta's section ended, so it is not inside Beta.
    expect(select(note, 'Beta#Gamma')).toBeNull();
  });

  it('returns null for a heading that is not there', () => {
    expect(select(note, 'Missing')).toBeNull();
    expect(select(note, 'Alpha#Missing')).toBeNull();
  });

  it('takes the first of two identical headings', () => {
    expect(select('# Dup\none\n# Dup\ntwo', 'Dup')).toBe('# Dup\none');
  });

  it('keeps nested and sibling sections apart', () => {
    const md = '# P\n## C1\nc1\n## C2\nc2\n# Q';
    expect(select(md, 'P#C1')).toBe('## C1\nc1');
    expect(select(md, 'P')).toBe('# P\n## C1\nc1\n## C2\nc2');
  });

  it('compares case-insensitively with whitespace collapsed', () => {
    expect(select('#   Hello   WORLD\nx', 'hello world')).toBe('#   Hello   WORLD\nx');
  });

  it('ignores emphasis, link syntax and closing hashes when comparing', () => {
    expect(select('# Hello *World*\nx', 'hello world')).toBe('# Hello *World*\nx');
    expect(select('## Read [the docs](https://x.y)\nbody', 'read the docs')).toBe(
      '## Read [the docs](https://x.y)\nbody'
    );
    expect(select('## Closed ##\nbody', 'Closed')).toBe('## Closed ##\nbody');
  });

  it('keeps underscores inside words as part of the title', () => {
    expect(select('# snake_case name\nx', 'snake_case name')).toBe('# snake_case name\nx');
    expect(select('# _Emph_ word\nx', 'emph word')).toBe('# _Emph_ word\nx');
  });

  it('ignores a "# Title" inside fenced code', () => {
    const md = '```\n# not\n```\n# Real\nx';
    expect(select(md, 'not')).toBeNull();
    expect(select(md, 'Real')).toBe('# Real\nx');
  });

  it('ignores a heading-like line inside front matter', () => {
    const md = '---\ntitle: t\n# Fake\n---\n\n# Real\nbody';
    expect(select(md, 'Fake')).toBeNull();
    expect(select(md, 'Real')).toBe('# Real\nbody');
  });

  it('takes a setext heading with its underline', () => {
    const md = 'Big Title\n=========\n\nbody\n\nSub\n---\nsub body';
    expect(select(md, 'Big Title')).toBe('Big Title\n=========\n\nbody\n\nSub\n---\nsub body');
    expect(select(md, 'Sub')).toBe('Sub\n---\nsub body');
  });

  it('drops trailing blank lines from a section', () => {
    expect(select('# A\nx\n\n\n# B', 'A')).toBe('# A\nx');
  });

  it('reads CRLF text', () => {
    expect(select('# A\r\nx\r\n# B\r\n', 'A')).toBe('# A\nx');
  });
});

describe('heading link normalisation', () => {
  const md =
    '## Sub: Colon?\n\nbody\n\n# C#\n\nc body\n\n# A / B\n\nab body\n\n# Heading \\*star\\*\n\nstar body\n\n# R\u00e9sum\u00e9\n\nr body\n';

  it('matches a link written without the punctuation Obsidian drops', () => {
    expect(select(md, 'Sub Colon?')).toBe('## Sub: Colon?\n\nbody');
    expect(select(md, 'Sub: Colon?')).toBe('## Sub: Colon?\n\nbody');
    expect(select(md, 'C')).toBe('# C#\n\nc body');
    expect(select(md, 'A B')).toBe('# A / B\n\nab body');
  });

  it('unescapes backslashes and compares in NFC', () => {
    expect(select(md, 'Heading *star*')).toBe('# Heading \\*star\\*\n\nstar body');
    expect(select(md, 'Re\u0301sume\u0301')).toBe('# R\u00e9sum\u00e9\n\nr body');
  });
});

describe('block selection', () => {
  it('takes the contiguous paragraph around a marker and strips the marker', () => {
    const md = 'Para one\ntwo ^p\nthree\n\nNext';
    expect(select(md, '^p')).toBe('Para one\ntwo\nthree');
  });

  it('takes a list item with its nested child', () => {
    const md = '- item ^id\n  - child\n- next';
    expect(select(md, '^id')).toBe('- item\n  - child');
  });

  it('takes the innermost item with its own continuation lines', () => {
    const md = '- a\n  - b ^cb\n    cont\n- c';
    expect(select(md, '^cb')).toBe('- b\n  cont');
  });

  it('takes a list item through a more-indented continuation line', () => {
    const md = '- a\n  more ^m\n- b';
    expect(select(md, '^m')).toBe('- a\n  more');
  });

  it('takes the block before a marker on its own line, past one blank line', () => {
    expect(select('Para one\n\n^id\n\nNext', '^id')).toBe('Para one');
  });

  it('takes the block directly before a marker line with no blank between', () => {
    expect(select('Para one\n^id\nmore', '^id')).toBe('Para one');
  });

  it('finds nothing when two blank lines separate the marker from its block', () => {
    expect(select('Para\n\n\n^id', '^id')).toBeNull();
  });

  it('takes the whole quote and strips the marker from its line', () => {
    expect(select('> quoted line ^q\n> more\n\nafter', '^q')).toBe('> quoted line\n> more');
    expect(select('> a\n> b ^q', 'q')).toBeNull();
    expect(select('> a\n> b ^q', '^q')).toBe('> a\n> b');
  });

  it('takes a lazy continuation line as part of the quote above it', () => {
    expect(select('> quoted\ncontinued ^c\n\nafter', '^c')).toBe('> quoted\ncontinued');
  });

  it('takes a whole table when the marker sits on a body row', () => {
    const md = 'Intro\n\n| a | b |\n| --- | --- |\n| 1 | 2 | ^t\n\nafter';
    expect(select(md, '^t')).toBe('| a | b |\n| --- | --- |\n| 1 | 2 |');
  });

  it('takes a whole table when the marker sits on the header row', () => {
    const md = '| a | b | ^h\n| --- | --- |\n| 1 | 2 |';
    expect(select(md, '^h')).toBe('| a | b |\n| --- | --- |\n| 1 | 2 |');
  });

  it('takes the section of an ATX heading that carries the marker', () => {
    const md = '# Top\nintro\n\n## Head ^h\nbody\n\n## Next\nx';
    expect(select(md, '^h')).toBe('## Head\nbody');
  });

  it('takes the section of a setext heading that carries the marker', () => {
    const md = 'Setext ^s\n======\n\nbody\n\n# After';
    expect(select(md, '^s')).toBe('Setext\n======\n\nbody');
  });

  it('takes the section of a setext heading when the marker is on its last text line', () => {
    expect(select('Two\nlines ^z\n---\n\nafter', '^z')).toBe('Two\nlines\n---\n\nafter');
  });

  it('ignores a marker inside a fenced code block', () => {
    const md = '```\nx ^f\n```\n\nPara ^g';
    expect(select(md, '^f')).toBeNull();
    expect(select(md, '^g')).toBe('Para');
  });

  it('takes a fenced block when a marker line follows it directly', () => {
    expect(select('```\ncode\n```\n^id', '^id')).toBe('```\ncode\n```');
  });

  it('ignores a marker inside front matter', () => {
    const md = '---\nid: ^fm\n---\n\nBody ^b';
    expect(select(md, '^fm')).toBeNull();
    expect(select(md, '^b')).toBe('Body');
  });

  it('matches ids case-sensitively and only after whitespace or at the start', () => {
    expect(select('Para ^Abc', '^abc')).toBeNull();
    expect(select('Para ^Abc', '^Abc')).toBe('Para');
    expect(select('text^id\n\nnext', '^id')).toBeNull();
  });

  it('returns null when no block carries the id', () => {
    expect(select('Para ^p', '^missing')).toBeNull();
  });

  it('reads CRLF text', () => {
    expect(select('Para ^p\r\nmore\r\n', '^p')).toBe('Para\nmore');
  });
});

describe('long lines stay cheap', () => {
  /** Runs `fn` and returns how long it took, in ms. */
  const time = (fn: () => void): number => {
    const t0 = performance.now();
    fn();
    return performance.now() - t0;
  };
  // Quadratic matching took seconds at these sizes; linear takes milliseconds.
  const LIMIT_MS = 400;
  const N = 30_000;

  it('looks up a heading past a heading made of blanks', () => {
    for (const heading of [
      `# a${' '.repeat(N)}b`,
      `# a${' '.repeat(N)}#x`,
      `# ${'['.repeat(N)}`,
      `# ${'[['.repeat(N)}`,
      `# a${'_'.repeat(N)}b`,
    ]) {
      const md = `${heading}\n\nbody\n\n# Real\n\nreal body\n`;
      let found: string | null = null;
      expect(
        time(() => {
          found = select(md, 'Real');
        }),
        heading.slice(0, 12)
      ).toBeLessThan(LIMIT_MS);
      expect(found).toBe('# Real\n\nreal body');
      expect(time(() => select(md, 'Nope'))).toBeLessThan(LIMIT_MS);
    }
  });

  it('looks up a heading past thousands of bracket-heavy headings', () => {
    // Each heading is cut to 1000 characters, but the link patterns were still quadratic in that.
    for (const heading of [
      '['.repeat(990),
      '[a]('.repeat(240),
      '[['.repeat(495),
      '!['.repeat(330),
    ]) {
      const md = `${`# ${heading}\n`.repeat(2000)}# Real\n\nreal body\n`;
      let found: string | null = null;
      expect(
        time(() => {
          found = select(md, 'Real');
        }),
        heading.slice(0, 8)
      ).toBeLessThan(1000);
      expect(found).toBe('# Real\n\nreal body');
    }
  });

  it('keeps stripping links from headings', () => {
    const md = (h: string) => `# ${h}\n\nbody\n`;
    expect(select(md('A [link](http://x/y) b'), 'A link b')).not.toBeNull();
    expect(select(md('![alt text](a.png) pic'), 'alt text pic')).not.toBeNull();
    expect(select(md('See [[Note|shown]] now'), 'See shown now')).not.toBeNull();
    expect(select(md('See [[Note]] now'), 'See Note now')).not.toBeNull();
  });

  it('looks up a block id past a line of blanks and a table-like line', () => {
    const md = `${' '.repeat(N)}x\n\n${' '.repeat(N)}\n\nPara one\nmore ^id\n\n${' '.repeat(N)}-x`;
    let found: string | null = null;
    expect(
      time(() => {
        found = select(md, '^id');
      })
    ).toBeLessThan(LIMIT_MS);
    expect(found).toBe('Para one\nmore');
    expect(time(() => select(`a | b\n${' '.repeat(N)}x\n^id`, '^id'))).toBeLessThan(LIMIT_MS);
  });

  it('still drops closing hashes and a trailing block id from a heading', () => {
    // The id only matches the heading; the shown text no longer carries it.
    expect(select('## Title ## ^id\n\nbody', 'Title')).toBe('## Title ##\n\nbody');
    expect(select('## Title ##\n\nbody', 'Title')).toBe('## Title ##\n\nbody');
    expect(select('## Title #x\n\nbody', 'Title')).toBeNull();
    expect(select('## C#\n\nbody', 'C')).toBe('## C#\n\nbody');
    expect(select('Para\tcont ^id\n', '^id')).toBe('Para\tcont');
  });

  it('still finds a table by the block id on its last row', () => {
    const md = '| a | b |\n| --- | --- |\n| 1 | 2 | ^t\n\nAfter';
    expect(select(md, '^t')).toBe('| a | b |\n| --- | --- |\n| 1 | 2 |');
  });
});

describe('nested list items lose their indent', () => {
  it('dedents an item nested four columns deep, which would be code otherwise', () => {
    expect(select('- a\n  - b\n    - c ^abc\n', '^abc')).toBe('- c');
  });

  it('counts a tab as four columns and keeps the item relative structure', () => {
    expect(select('- a\n\t- b\n\t\t- c ^abc\n\t\t\t- d\n', '^abc')).toBe('- c\n\t- d');
  });

  it('dedents continuation lines by no more than they have', () => {
    expect(select('- a\n  - b\n    - c ^abc\n      more\n', '^abc')).toBe('- c\n  more');
    expect(select('- a\n  - b\n    - c ^abc\n lazy\n', '^abc')).toBe('- c\nlazy');
  });
});

describe('a standalone id after a list', () => {
  it('names the whole list, not its last item', () => {
    expect(select('- a\n- b\n- c\n\n^lst\n\nafter\n', '^lst')).toBe('- a\n- b\n- c');
    expect(select('1. a\n2. b\n\n^lst', '^lst')).toBe('1. a\n2. b');
  });

  it('takes nested items and blank lines between items along', () => {
    expect(select('- a\n  - a1\n\n- b\n\n^lst', '^lst')).toBe('- a\n  - a1\n\n- b');
  });

  it('stops at the paragraph above the list', () => {
    expect(select('intro\n\n- a\n- b\n\n^lst', '^lst')).toBe('- a\n- b');
  });

  it('keeps naming the item when the id sits right under it, or ends the item line', () => {
    expect(select('- a\n- b\n^lst', '^lst')).toBe('- b');
    expect(select('- a\n- b ^x\n- c', '^x')).toBe('- b');
  });
});

describe('paragraph boundaries follow CommonMark', () => {
  it('does not let a number other than 1 start a list inside a paragraph', () => {
    expect(select('Released in the year\n2020. It was great ^yr\n', '^yr')).toBe(
      'Released in the year\n2020. It was great'
    );
  });

  it('lets 1. interrupt a paragraph, and a list start after a blank line needs no 1', () => {
    expect(select('para ^p\n1. one\n', '^p')).toBe('para');
    expect(select('para\n\n2020. item ^i\n', '^i')).toBe('2020. item');
  });

  it('does not let an empty list marker interrupt a paragraph', () => {
    expect(select('one\ntwo ^p\n*\nthree\n', '^p')).toBe('one\ntwo\n*\nthree');
  });

  it('ends a paragraph at an HTML block start', () => {
    expect(select('one\ntwo ^p1\n<div>raw</div>\n', '^p1')).toBe('one\ntwo');
  });

  it('takes a lazy continuation line as part of the list item above it', () => {
    expect(select('- first\ncontinued ^li\n- second\n', '^li')).toBe('- first\ncontinued');
    expect(select('- first ^li\ncontinued\n- second\n', '^li')).toBe('- first\ncontinued');
  });
});

describe('block id markers in a bigger embed', () => {
  it('hides trailing ids in a whole-note embed and drops a line that is only an id', () => {
    const md = 'Para one ^abc123\n\n- item ^li1\n\n> quote ^qid\n\ntable text\n\n^lone\n\nend';
    expect(select(md, null)).toBe('Para one\n\n- item\n\n> quote\n\ntable text\n\n\nend');
  });

  it('hides ids in a heading section and keeps the heading text clean', () => {
    expect(select('# A ^h\n\ntext ^t\n\n# B\n', 'A')).toBe('# A\n\ntext');
  });

  it('hides ids on nested lines of a block embed', () => {
    expect(select('- a ^top\n  - b ^inner\n', '^top')).toBe('- a\n  - b');
  });

  it('keeps ids inside fenced code, and carets that are not ids', () => {
    const md = '```\ncode ^keep\n```\n\nx^2 and 2 ^ 3 ^\n';
    expect(select(md, null)).toBe(md);
  });

  it('keeps CRLF line endings', () => {
    expect(select('a ^x\r\nb\r\n', null)).toBe('a\r\nb\r\n');
  });
});

describe('hiding block ids stays linear', () => {
  const time = (fn: () => void): number => {
    const t0 = performance.now();
    fn();
    return performance.now() - t0;
  };

  it('does not walk the document for every indented line that carries an id', () => {
    // Each id line used to look for its list owner by walking up to the top of the note.
    const code = '\n    x ^a\n'.repeat(20_000);
    let shown: string | null = null;
    expect(
      time(() => {
        shown = select(code, null);
      })
    ).toBeLessThan(1000);
    // Indented code keeps its caret text.
    expect(shown).toBe(code);
    const list = `- item\n${'\n      x ^a\n'.repeat(20_000)}`;
    let hidden: string | null = null;
    expect(
      time(() => {
        hidden = select(list, null);
      })
    ).toBeLessThan(1000);
    expect(hidden).not.toContain('^a');
    const deep = `${'          - deep\n'.repeat(10_000)}${'\n    x ^a\n'.repeat(10_000)}`;
    expect(time(() => select(deep, null))).toBeLessThan(1000);
  });

  it('hides an id only where Obsidian shows no code', () => {
    expect(select('Para\n\n    code ^a\n', null)).toBe('Para\n\n    code ^a\n');
    expect(select('- item\n\n    more ^a\n', null)).toBe('- item\n\n    more\n');
    expect(select('- item\n  - sub\n\n      deep ^a\n', null)).toBe(
      '- item\n  - sub\n\n      deep\n'
    );
    // Unindented text under an item ends the list, so the indented line after it is code.
    expect(select('- item\nlazy\n\n    code ^a\n', null)).toBe('- item\nlazy\n\n    code ^a\n');
    expect(select('    - item ^a\n', null)).toBe('    - item\n');
  });

  it('does not walk the document for every indented line without an id', () => {
    // A caret anywhere (here x^2) switches the id pass on. 8000 indented code
    // paragraphs took seconds when each one searched for its list owner.
    const md = `x^2 and ${'    code line\n\n'.repeat(8000)}`;
    const t0 = performance.now();
    const result = selectNoteContent(md, null);
    const ms = performance.now() - t0;
    expect(result?.markdown.startsWith('x^2 and')).toBe(true);
    expect(ms).toBeLessThan(1000);
  });
});

describe('selectNoteContent: many embeds of one large note', () => {
  const section = (i: number) =>
    `## Section ${i} ^s${i}\n\nSome paragraph with [[Link ${i}]] and **bold**.\n\n- item one\n- item two\n  - nested\n\n> quote ^q${i}\n\n`;
  const big = Array.from({ length: 2000 }, (_, i) => section(i)).join('');

  it('analyses a note once, however often a fragment of it is embedded', () => {
    const started = performance.now();
    for (let i = 0; i < 300; i++) {
      expect(selectNoteContent(big, 'Nope')).toBeNull();
      expect(select(big, 'Section 1999')).toContain('Section 1999');
      expect(select(big, '^q1999')).toContain('quote');
    }
    expect(performance.now() - started).toBeLessThan(1500);
  });

  it('does not serve one note the analysis of another', () => {
    expect(select('# A\n\none\n', 'A')).toBe('# A\n\none');
    expect(select('# A\n\ntwo\n', 'A')).toBe('# A\n\ntwo');
    expect(select('# A\n\none\n', 'A')).toBe('# A\n\none');
  });
});
