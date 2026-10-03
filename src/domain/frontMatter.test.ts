import { describe, expect, it } from 'vitest';
import { frontMatterEnd, frontMatterLines } from './frontMatter';

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
    expect(block('---\n\na\n\n---\n')).toBe('---\n\na\n\n---');
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
    expect(block('---\na\n...\n')).toBeNull();
    expect(block('---\na\n --- \n')).toBeNull();
    expect(block('---')).toBeNull();
    expect(block('# Title\n---\na\n---\n')).toBeNull();
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
