import { describe, expect, it } from 'vitest';
import {
  frontMatterEnd,
  frontMatterForExport,
  frontMatterLines,
  frontMatterTitle,
} from './frontMatter';

/** The front matter as frontMatterEnd sees it, or null. */
const block = (md: string) => {
  const end = frontMatterEnd(md);
  return end < 0 ? null : md.slice(0, end);
};

describe('frontMatterEnd', () => {
  it('finds a YAML block at the start, up to its closing fence', () => {
    expect(block('---\ntitle: Post\ndate: 2024\n---\n\nBody\n')).toBe(
      '---\ntitle: Post\ndate: 2024\n---'
    );
  });

  it('allows an empty block, blank lines and trailing whitespace on the fences', () => {
    expect(block('---\n---\nx')).toBe('---\n---');
    expect(block('---\na\n\nb\n\n---\n')).toBe('---\na\n\nb\n\n---');
    expect(block('---  \na: 1\n---\t\n')).toBe('---  \na: 1\n---\t');
    expect(block('---\na: 1\n---')).toBe('---\na: 1\n---');
  });

  it('reads CRLF text', () => {
    expect(block('---\r\na: 1\r\n---\r\n\r\nB')).toBe('---\r\na: 1\r\n---\r');
  });

  // The same cases remark-frontmatter rejects: they stay a rule and a heading.
  it('needs the opening fence on the first line, and a closing one', () => {
    expect(block('\n---\na\n---\n')).toBeNull();
    expect(block(' ---\na\n---\n')).toBeNull();
    expect(block('----\na\n----\n')).toBeNull();
    expect(block('---\na: 1\n')).toBeNull();
    expect(block('---\na\n --- \n')).toBeNull();
    expect(block('---')).toBeNull();
    expect(block('# Title\n---\na\n---\n')).toBeNull();
  });

  // Pandoc's rules: `...` closes it too, and a blank line straight after the
  // opening fence makes that fence a rule, not front matter.
  it('closes at a `...` line as well', () => {
    expect(block('---\na\n...\n')).toBe('---\na\n...');
    expect(block('---\na\n... \n\n---\n')).toBe('---\na\n... ');
    const report =
      '---\ntitle: Report\n...\n\n# Introduction\n\nKey findings.\n\n---\n\n# Appendix\n';
    expect(block(report)).toBe('---\ntitle: Report\n...');
    expect(block('---\na\n....\n')).toBeNull();
  });

  it('is not front matter when a blank line follows the opening fence', () => {
    expect(block('---\n\nIntro paragraph.\n\n---\n\n# Title\n')).toBeNull();
    expect(block('---\n \na: 1\n---\n')).toBeNull();
    expect(block('---\r\n\r\na: 1\r\n---\r\n')).toBeNull();
  });

  it('closes at the first fence, even inside what looks like code', () => {
    expect(block('---\n```\n---\nafter\n')).toBe('---\n```\n---');
  });
});

describe('frontMatterLines', () => {
  it('counts the fences too', () => {
    expect(frontMatterLines('---\na: 1\nb: 2\n---\n\n# H\n')).toBe(4);
    expect(frontMatterLines('---\n---\n')).toBe(2);
    expect(frontMatterLines('# H\n')).toBe(0);
  });
});

describe('frontMatterForExport', () => {
  const md = '---\ntitle: Post\ntags: [a]\n---\n\n# Title\n\nBody\n';

  it('drops front matter and the blank lines after it', () => {
    expect(frontMatterForExport(md, false)).toBe('# Title\n\nBody\n');
  });

  it('keeps it as a YAML code block when asked', () => {
    expect(frontMatterForExport(md, true)).toBe(
      '```yaml\ntitle: Post\ntags: [a]\n```\n\n# Title\n\nBody\n'
    );
  });

  it('keeps the body after a block closed by `...`, and a leading rule', () => {
    const report =
      '---\ntitle: Report\n...\n\n# Introduction\n\nKey findings.\n\n---\n\n# Appendix\n';
    expect(frontMatterForExport(report, false)).toBe(
      '# Introduction\n\nKey findings.\n\n---\n\n# Appendix\n'
    );
    expect(frontMatterForExport(report, true)).toBe(
      '```yaml\ntitle: Report\n```\n\n# Introduction\n\nKey findings.\n\n---\n\n# Appendix\n'
    );
    const ruled = '---\n\nIntro paragraph.\n\n---\n\n# Title\n';
    expect(frontMatterForExport(ruled, false)).toBe(ruled);
  });

  it('fences YAML that contains backticks with a longer fence', () => {
    expect(frontMatterForExport('---\nnote: ```x```\n---\nBody', true)).toBe(
      '````yaml\nnote: ```x```\n````\n\nBody'
    );
  });

  it('leaves out an empty block, and documents without front matter alone', () => {
    expect(frontMatterForExport('---\n---\n\nBody', true)).toBe('Body');
    expect(frontMatterForExport('# Only\n---\n', false)).toBe('# Only\n---\n');
  });
});

describe('frontMatterTitle', () => {
  it('reads a plain or quoted title', () => {
    expect(frontMatterTitle('---\ntitle: My post\n---\n')).toBe('My post');
    expect(frontMatterTitle('---\ndate: 1\ntitle: "Quoted: yes"\n---\n')).toBe('Quoted: yes');
    expect(frontMatterTitle("---\ntitle: 'single'\n---\n")).toBe('single');
  });

  it('reads YAML quoting and comments, and skips block scalars', () => {
    const title = (line: string) => frontMatterTitle(`---\n${line}\n---\n`);
    expect(title('title: "My Post" # draft')).toBe('My Post');
    expect(title('title: My Post # draft')).toBe('My Post');
    expect(title('title: C# in a day')).toBe('C# in a day');
    expect(title("title: 'It''s here'")).toBe("It's here");
    expect(title('title: "Say \\"hi\\" \\\\ bye"')).toBe('Say "hi" \\ bye');
    expect(title("title: 'x' # note")).toBe('x');
    expect(title('title: # nothing')).toBe('');
    expect(title('title: >-\n  My Post')).toBe('');
    expect(title('title: |\n  My Post')).toBe('');
    expect(title('title: >2- # c\n  My Post')).toBe('');
  });

  it('is empty without a title, or without front matter', () => {
    expect(frontMatterTitle('---\ndate: 1\n---\n')).toBe('');
    expect(frontMatterTitle('title: x\n')).toBe('');
    expect(frontMatterTitle('---\nsubtitle: x\n---\n')).toBe('');
  });
});
