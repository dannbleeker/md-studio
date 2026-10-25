import { describe, expect, it } from 'vitest';
import { findMermaidBlocks } from './mermaidBlocks';

describe('findMermaidBlocks', () => {
  it('finds a block with its source and where it sits', () => {
    const md = 'Intro\n\n```mermaid\ngraph TD\n  A --> B\n```\n\nOutro';
    const [block] = findMermaidBlocks(md);
    expect(block?.source).toBe('graph TD\n  A --> B');
    expect(md.slice(block?.start, block?.end)).toBe('```mermaid\ngraph TD\n  A --> B\n```');
  });

  it('finds several, with tilde fences and a longer fence', () => {
    const md = '~~~mermaid\nA\n~~~\n\n````mermaid\nB\n```\nstill B\n````\n';
    expect(findMermaidBlocks(md).map((b) => b.source)).toEqual(['A', 'B\n```\nstill B']);
  });

  it('ignores other languages and fences inside other fences', () => {
    const md = '```js\nx\n```\n\n````markdown\n```mermaid\nA\n```\n````\n';
    expect(findMermaidBlocks(md)).toEqual([]);
  });

  it('reads an unclosed block to the end', () => {
    const [block] = findMermaidBlocks('```mermaid\ngraph TD\nA --> B\n');
    expect(block?.source).toBe('graph TD\nA --> B');
  });

  it('handles CRLF and an indented fence', () => {
    const [block] = findMermaidBlocks('  ```mermaid\r\nA\r\n  ```\r\n');
    expect(block?.source).toBe('A');
  });

  it('is empty without the word mermaid', () => {
    expect(findMermaidBlocks('```\nplain\n```')).toEqual([]);
  });

  it('is linear in the number of lines', { tags: ['stress'] }, () => {
    const time = (n: number) => {
      const md = `${'```x\n```\n'.repeat(n)}\`\`\`mermaid\nA\n\`\`\`\n`;
      const start = performance.now();
      findMermaidBlocks(md);
      return performance.now() - start;
    };
    time(2000);
    const small = Math.max(time(40_000), 1);
    expect(time(80_000)).toBeLessThan(small * 6);
  });
});
