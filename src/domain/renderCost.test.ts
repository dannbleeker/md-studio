import { describe, expect, it } from 'vitest';
import { tooCostlyToRender } from './renderCost';

describe('tooCostlyToRender', () => {
  it('accepts ordinary notes', () => {
    const note = [
      '# Title',
      '',
      'Some *emphasis*, **strong**, ~~gone~~ and snake_case words.',
      '',
      '- one **a**',
      '  - nested _b_',
      '    - deeper',
      '',
      '| a | b | c |',
      '| - | - | - |',
      '| 1 | 2 | 3 |',
    ].join('\n');
    expect(tooCostlyToRender(note)).toBe(false);
  });

  it('accepts a long tight list whose items each use emphasis', () => {
    expect(tooCostlyToRender('- **bold** and *it*\n'.repeat(2000))).toBe(false);
    expect(tooCostlyToRender('1. **bold** and *it*\n'.repeat(2000))).toBe(false);
    // Separate paragraphs add up to nothing, however many.
    expect(tooCostlyToRender('word *a* b\n\n'.repeat(5000))).toBe(false);
  });

  it('refuses a paragraph with thousands of emphasis delimiters', () => {
    for (const unit of ['*a', '_a', '~a']) {
      expect(tooCostlyToRender(unit.repeat(5000))).toBe(true);
      // Split over lines it is still one paragraph.
      expect(tooCostlyToRender(`${unit}\n`.repeat(5000))).toBe(true);
    }
    expect(tooCostlyToRender('*a'.repeat(400))).toBe(false);
  });

  it('refuses lists nested far past real documents, and keeps deep but plausible ones', () => {
    const nested = (depth: number) =>
      Array.from({ length: depth }, (_, i) => `${'  '.repeat(i)}- a`).join('\n');
    expect(tooCostlyToRender(nested(300))).toBe(true);
    expect(tooCostlyToRender(nested(20))).toBe(false);
    expect(tooCostlyToRender(`${'\t'.repeat(40)}1. a`)).toBe(true);
  });

  it('refuses a table row with hundreds of cells', () => {
    expect(tooCostlyToRender(`|${' a |'.repeat(3300)}\n|${' - |'.repeat(3300)}`)).toBe(true);
    expect(tooCostlyToRender(`|${' a |'.repeat(40)}\n|${' - |'.repeat(40)}`)).toBe(false);
  });
});
