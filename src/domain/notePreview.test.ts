import { describe, expect, it } from 'vitest';
import { notePreview } from './notePreview';

describe('notePreview', () => {
  it('takes the first heading as the title and the following lines as text', () => {
    expect(
      notePreview('# Plan\n\nFirst **line** with a [link](x.md).\nSecond line.\n\n## Later\nno')
    ).toEqual({
      title: 'Plan',
      text: 'First line with a link. Second line.',
    });
  });

  it('skips front matter, fenced code, tables and rules', () => {
    const md = '---\ntitle: X\n---\n\n```\ncode\n```\n---\n| a | b |\n\nReal text.';
    expect(notePreview(md)).toEqual({ title: null, text: 'Real text.' });
  });

  it('writes wikilinks, embeds, callouts, quotes and lists as plain words', () => {
    expect(
      notePreview('> [!note] Heads up\n- [ ] see [[Other|that note]] and [[Plain]] ![[pic.png]]')
    ).toEqual({ title: null, text: 'Heads up see that note and Plain' });
  });

  it('cuts long text at the limit with an ellipsis', () => {
    const preview = notePreview(`${'word '.repeat(200)}`, 50);
    expect(preview.text.endsWith('…')).toBe(true);
    expect(preview.text.length).toBeLessThanOrEqual(51);
  });

  it('is empty for an empty note', () => {
    expect(notePreview('')).toEqual({ title: null, text: '' });
  });

  it('reads only the start of a huge note', () => {
    const time = (n: number) => {
      const md = `# T\n${'text ['.repeat(n)}`;
      const start = performance.now();
      notePreview(md);
      return performance.now() - start;
    };
    time(1000);
    const small = Math.max(time(200_000), 1);
    expect(time(400_000)).toBeLessThan(small * 6);
  });
});
